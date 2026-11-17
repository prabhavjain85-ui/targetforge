import {
  biologySignal,
  evidenceSummary,
  explainTarget,
  geneticStrength,
  isHighNovelty,
  isWellEstablished,
  passesEvidenceFloor,
  scoreAssociatedRows,
  understudyScore,
} from "../server/noveltyScore";

function row({
  symbol,
  name,
  overall,
  genetic = 0,
  somatic = 0,
  genLit = 0,
  literature = 0,
  pathway = 0,
  animal = 0,
  expression = 0,
  clinical = 0,
  drugs = 0,
  biotype = "protein_coding",
  sources = {},
}) {
  const datatypeScores = [
    ["genetic_association", genetic],
    ["genetic_literature", genLit],
    ["somatic_mutation", somatic],
    ["literature", literature],
    ["affected_pathway", pathway],
    ["animal_model", animal],
    ["rna_expression", expression],
    ["clinical", clinical],
  ]
    .filter(([, score]) => score > 0)
    .map(([id, score]) => ({ id, score }));
  const datasourceScores = Object.entries(sources).map(([id, score]) => ({ id, score }));
  return {
    score: overall,
    datatypeScores,
    datasourceScores,
    target: {
      id: `ENSG_${symbol}`,
      approvedSymbol: symbol,
      approvedName: name || symbol,
      biotype,
      drugAndClinicalCandidates: { count: drugs },
    },
  };
}

test("no drug-count or clinical-score term survives in the scoring module", () => {
  // Measured below chance on held-out data (ROC-AUC 0.361; the inverse
  // drug-count term alone 0.129), so diseaseNoveltyFactor, broadDrugDiscount
  // and noveltyScoreValue were deleted rather than down-weighted. The
  // historical formulas live on only in the benchmark that condemned them.
  const mod = require("../server/noveltyScore");
  expect(mod.diseaseNoveltyFactor).toBeUndefined();
  expect(mod.broadDrugDiscount).toBeUndefined();
  expect(mod.noveltyScoreValue).toBeUndefined();
});

test("biology weights sum to exactly 1 so perfect evidence scores 100", () => {
  const perfect = biologySignal(
    {
      genetic_association: 1,
      genetic_literature: 1,
      somatic_mutation: 1,
      literature: 1,
      affected_pathway: 1,
      animal_model: 1,
      rna_expression: 1,
    },
    1
  );
  expect(perfect).toBeCloseTo(1, 10);
  expect(understudyScore(perfect)).toBe(100);
});

test("the understudy score ignores how drugged a gene is", () => {
  // EGFR has 82 drugs globally. drugCount is a GLOBAL count, so it said the
  // same thing in lung cancer as in pachyonychia congenita; the retrospective
  // then showed that discounting by it inverts the real signal. The score now
  // takes biology alone, so there is no drug term left to get wrong.
  const biology = biologySignal({ genetic_association: 0.6, literature: 0.4 }, 0.5);
  expect(understudyScore(biology)).toBe(understudyScore(biology));
  expect(understudyScore(biology)).toBeGreaterThan(10);
  expect(understudyScore.length).toBe(1);
});

test("biology signal weights genetic association far above literature", () => {
  const genetic = biologySignal({ genetic_association: 0.9, literature: 0.2 }, 0.5);
  const literatureOnly = biologySignal({ genetic_association: 0, literature: 0.9 }, 0.5);
  expect(genetic).toBeGreaterThan(literatureOnly * 1.5);
});

test("the understudy score is high for strong genetics", () => {
  const biology = biologySignal({ genetic_association: 0.9 }, 0.8);
  expect(understudyScore(biology)).toBeGreaterThan(50);
});

test("evidence floor drops literature/clinical-only noise but keeps genetic or somatic leads", () => {
  const genetic = scoreAssociatedRows([row({ symbol: "SETBP1", overall: 0.68, genetic: 0.87 })]).all[0];
  const clinicalKinase = scoreAssociatedRows([
    row({ symbol: "FYN", overall: 0.6, literature: 0.7, clinical: 0.9, drugs: 6 }),
  ]).all[0];
  const weak = scoreAssociatedRows([row({ symbol: "NOISE", overall: 0.05, literature: 0.2 })]).all[0];
  expect(passesEvidenceFloor(genetic)).toBe(true);
  expect(passesEvidenceFloor(clinicalKinase)).toBe(false);
  expect(passesEvidenceFloor(weak)).toBe(false);
});

test("high-novelty badge is reserved for strong evidence and no clinical programme for this disease", () => {
  const palb2 = scoreAssociatedRows([
    row({
      symbol: "PALB2",
      overall: 0.79,
      genetic: 0.94,
      genLit: 0.85,
      somatic: 0.6,
      drugs: 0,
      sources: { eva: 0.94, genomics_england: 0.9 },
    }),
  ]).all[0];
  const kras = scoreAssociatedRows([
    row({ symbol: "KRAS", overall: 0.81, genetic: 0.86, somatic: 0.89, clinical: 0.75, drugs: 3 }),
  ]).all[0];
  expect(isHighNovelty(palb2)).toBe(true);
  expect(isHighNovelty(kras)).toBe(false);
  expect(palb2.explanation).toMatch(/no drug is in clinical development/i);
  expect(palb2.explanation).toMatch(/rare variant/i);
});

test("well-established means clinical programmes exist for THIS disease", () => {
  const abl1 = scoreAssociatedRows([
    row({ symbol: "ABL1", overall: 0.84, genetic: 0.86, clinical: 0.9, drugs: 27 }),
  ]).all[0];
  const tet2 = scoreAssociatedRows([row({ symbol: "TET2", overall: 0.64, genetic: 0.71, drugs: 0 })]).all[0];
  // Drugged elsewhere but untouched here: novel for this disease, not established.
  const elsewhere = scoreAssociatedRows([row({ symbol: "EGFR", overall: 0.5, genetic: 0.5, clinical: 0, drugs: 82 })]).all[0];
  expect(isWellEstablished(abl1)).toBe(true);
  expect(isWellEstablished(tet2)).toBe(false);
  expect(isWellEstablished(elsewhere)).toBe(false);
  expect(abl1.explanation).toMatch(/already in clinical development/i);
  expect(elsewhere.explanation).toMatch(/82 drugs target EGFR in other indications/i);
});

test("pancreatic cancer fixtures: undrugged genetic genes outrank KRAS/TP53 on novelty", () => {
  const { novelty, established } = scoreAssociatedRows([
    row({
      symbol: "KRAS",
      name: "KRas proto-oncogene, GTPase",
      overall: 0.807,
      genetic: 0.856,
      somatic: 0.894,
      literature: 0.987,
      pathway: 0.743,
      genLit: 0.608,
      clinical: 0.121,
      drugs: 3,
    }),
    row({
      symbol: "TP53",
      name: "tumor protein p53",
      overall: 0.795,
      genetic: 0.92,
      somatic: 0.873,
      literature: 0.971,
      genLit: 0.608,
      drugs: 9,
    }),
    row({
      symbol: "PALB2",
      name: "partner and localizer of BRCA2",
      overall: 0.786,
      genetic: 0.94,
      somatic: 0.604,
      literature: 0.573,
      pathway: 0.907,
      genLit: 0.847,
      drugs: 0,
      sources: { eva: 0.94, genomics_england: 0.907 },
    }),
    row({
      symbol: "SMAD4",
      overall: 0.779,
      genetic: 0.857,
      somatic: 0.891,
      literature: 0.923,
      drugs: 0,
    }),
    row({ symbol: "RRM1", overall: 0.607, literature: 0.4, clinical: 0.9, drugs: 10 }),
  ]);

  expect(novelty[0].symbol).toBe("PALB2");
  expect(novelty.map((r) => r.symbol)).toEqual(expect.arrayContaining(["PALB2", "SMAD4", "KRAS", "TP53"]));
  expect(novelty.map((r) => r.symbol)).not.toContain("RRM1");
  const palb2 = novelty.find((r) => r.symbol === "PALB2");
  const kras = novelty.find((r) => r.symbol === "KRAS");
  const tp53 = novelty.find((r) => r.symbol === "TP53");
  // Ranked by evidence strength since the drug-count discount was deleted.
  // This ordering is unchanged by that deletion: PALB2 leads on genetic and
  // pathway evidence, not because KRAS and TP53 were penalised for their drugs.
  expect(palb2.noveltyScore).toBeGreaterThan(kras.noveltyScore);
  expect(kras.noveltyScore).toBeGreaterThan(tp53.noveltyScore);
  // Disease-specific: only RRM1 has real clinical evidence in these fixtures.
  expect(established.map((r) => r.symbol)).toEqual(expect.arrayContaining(["RRM1"]));
  expect(established.map((r) => r.symbol)).not.toContain("PALB2");
});

// Direction change, recorded deliberately. Deleting broadDrugDiscount and
// diseaseNoveltyFactor removed the only terms that pushed well-drugged targets
// down, so the default ranking is now strength of evidence: ABL1 (27 drugs,
// genetic 0.863, literature 0.8) comes above SETBP1 (0 drugs). The deleted
// terms were measured at held-out ROC-AUC 0.361 on cohort 1, below chance, so
// they could not stay; but nothing here ranks by novelty any more. drugCount
// is surfaced as its own column instead of being folded into the score.
test("CML fixtures: the strongest-evidence target ranks first, drugs and all", () => {
  const { novelty, established } = scoreAssociatedRows([
    row({ symbol: "ABL1", overall: 0.836, genetic: 0.863, clinical: 0.95, literature: 0.8, drugs: 27 }),
    row({ symbol: "BCR", overall: 0.829, genetic: 0.277, clinical: 0.9, drugs: 15 }),
    row({ symbol: "SETBP1", overall: 0.678, genetic: 0.865, somatic: 0.4, drugs: 0 }),
    row({ symbol: "TET2", overall: 0.637, genetic: 0.709, somatic: 0.3, drugs: 0 }),
    row({ symbol: "KIT", overall: 0.71, somatic: 0.5, clinical: 0.9, drugs: 38 }),
  ]);
  expect(novelty[0].symbol).toBe("ABL1");
  const setbp1 = novelty.find((r) => r.symbol === "SETBP1");
  const abl1 = novelty.find((r) => r.symbol === "ABL1");
  // Evidence strength, not novelty: ABL1 scores higher and reports its 27 drugs.
  expect(abl1.understudyScore).toBeGreaterThan(setbp1.understudyScore);
  expect(abl1.drugCount).toBe(27);
  expect(setbp1.drugCount).toBe(0);
  // The progression score refuses to extrapolate onto an already-drugged target.
  expect(abl1.progressionScore).toBeNull();
  expect(setbp1.progressionScore).not.toBeNull();
  expect(established[0].symbol).toBe("ABL1");
  expect(isWellEstablished(abl1)).toBe(true);
});

test("non-protein-coding targets are skipped", () => {
  const { all } = scoreAssociatedRows([
    row({ symbol: "LINC", overall: 0.9, genetic: 0.9, biotype: "lncRNA" }),
    row({ symbol: "EGFR", overall: 0.7, genetic: 0.6 }),
  ]);
  expect(all.map((r) => r.symbol)).toEqual(["EGFR"]);
});

test("genetic strength labels and evidence summary are human-readable", () => {
  expect(geneticStrength(0.86).label).toBe("Strong");
  expect(geneticStrength(0.45).label).toBe("Moderate");
  expect(geneticStrength(0.2).label).toBe("Limited");
  expect(geneticStrength(0).label).toBe("None / weak");
  expect(evidenceSummary({ genetic_association: 0.9, literature: 0.4, clinical: 0.9 })).toMatch(
    /Genetic association 90/
  );
  expect(explainTarget({ symbol: "ATM", geneticScore: 0.8, clinicalScore: 0, drugCount: 0, datasourceScores: {} })).toMatch(
    /no drug is in clinical development against ATM/i
  );
});

test("repurposing evidence profile prioritizes clinically drugged, tractable targets over undrugged genetic leads", () => {
  const rows = [
    row({ symbol: "PALB2", overall: 0.78, genetic: 0.94, drugs: 0 }),
    row({ symbol: "ABL1", overall: 0.84, genetic: 0.86, clinical: 0.95, drugs: 27 }),
  ];
  const novelRun = scoreAssociatedRows(rows, { profile: "novel_discovery" });
  const repurposeRun = scoreAssociatedRows(rows, { profile: "repurposing" });

  expect(novelRun.novelty[0].symbol).toBe("PALB2");
  expect(repurposeRun.novelty[0].symbol).toBe("ABL1");
  expect(repurposeRun.evidenceProfile).toBe("repurposing");
  expect(repurposeRun.novelty[0].repurposingScore).toBeGreaterThan(repurposeRun.novelty[1].repurposingScore);
});

test("infers expectedMoA directionality (activator for tumour suppressors/LoF vs inhibitor for oncogenes/GoF)", () => {
  const { all } = scoreAssociatedRows([
    row({ symbol: "TP53", name: "tumor suppressor p53", overall: 0.8, genetic: 0.9 }),
    row({ symbol: "EGFR", name: "epidermal growth factor receptor tyrosine kinase", overall: 0.8, genetic: 0.8 }),
  ]);
  const tp53 = all.find((r) => r.symbol === "TP53");
  const egfr = all.find((r) => r.symbol === "EGFR");
  expect(tp53.expectedMoA).toBe("activator");
  expect(tp53.directionOfEffect).toMatch(/Loss-of-Function/i);
  expect(egfr.expectedMoA).toBe("inhibitor");
  expect(egfr.directionOfEffect).toMatch(/Gain-of-Function/i);
});

test("classifies Pharos Target Development Level (Tclin, Tchem, Tbio, Tdark)", () => {
  const { classifyPharosTDL } = require("../server/noveltyScore");
  const tclin = classifyPharosTDL(
    {
      approvedSymbol: "EGFR",
      drugAndClinicalCandidates: { count: 12 },
      tractability: [{ modality: "SM", label: "Approved Drug", value: true }],
    },
    { clinical: 0.85 }
  );
  expect(tclin.tdl).toBe("Tclin");

  const tchem = classifyPharosTDL(
    {
      approvedSymbol: "NOVEL_KINASE",
      drugAndClinicalCandidates: { count: 1 },
      tractability: [{ modality: "SM", label: "ChEMBL High Quality", value: true }],
    },
    { genetic_association: 0.7 }
  );
  expect(tchem.tdl).toBe("Tchem");

  const tbio = classifyPharosTDL(
    {
      approvedSymbol: "PALB2",
      functionDescriptions: ["Plays a critical role in homologous recombination repair."],
      drugAndClinicalCandidates: { count: 0 },
    },
    { genetic_association: 0.9 }
  );
  expect(tbio.tdl).toBe("Tbio");

  const tdark = classifyPharosTDL(
    {
      approvedSymbol: "C1orf999",
      functionDescriptions: [],
      drugAndClinicalCandidates: { count: 0 },
    },
    { genetic_association: 0.05, literature: 0.02 }
  );
  expect(tdark.tdl).toBe("Tdark");
});

test("custom datatype slider weights override preset profiles in scoreAssociatedRows", () => {
  const rows = [
    row({ symbol: "SOMATIC_LEAD", overall: 0.7, genetic: 0.2, somatic: 0.95, drugs: 0 }),
    row({ symbol: "GENETIC_LEAD", overall: 0.7, genetic: 0.95, somatic: 0.1, drugs: 0 }),
  ];
  const somaticWeighted = scoreAssociatedRows(rows, {
    customWeights: {
      genetic_association: 0.05,
      somatic_mutation: 1.0,
      rna_expression: 0,
      crispr_screen: 0,
      known_drug: 0,
    },
  });
  expect(somaticWeighted.evidenceProfile).toBe("custom");
  expect(somaticWeighted.novelty[0].symbol).toBe("SOMATIC_LEAD");
});

test("penalizes pan-essential targets (DepMap isEssential or gnomAD pLI > 0.9 + vital organs) and extracts >65% human paralogs", () => {
  const baseRow = row({ symbol: "EGFR", overall: 0.82, genetic: 0.88, drugs: 0 });
  const panEssentialRow = {
    ...baseRow,
    target: {
      ...baseRow.target,
      approvedSymbol: "EGFR",
      isEssential: true,
      geneticConstraint: [{ constraintType: "lof", score: 0.96, oe: 0.08 }],
      expressions: [
        { tissue: { label: "Heart", organs: ["Heart"] }, rna: { value: 42, level: 4 } },
        { tissue: { label: "Liver", organs: ["Liver"] }, rna: { value: 38, level: 4 } },
        { tissue: { label: "Brain", organs: ["Brain"] }, rna: { value: 31, level: 3 } },
      ],
      homologues: [
        { speciesId: "9606", speciesName: "Homo sapiens", targetGeneSymbol: "ERBB2", queryPercentageIdentity: 82 },
        { speciesId: "9606", speciesName: "Homo sapiens", targetGeneSymbol: "ERBB4", queryPercentageIdentity: 76 },
        { speciesId: "9606", speciesName: "Homo sapiens", targetGeneSymbol: "DISTANT", queryPercentageIdentity: 41 },
      ],
    },
  };

  const baselineScored = scoreAssociatedRows([baseRow]).all[0];
  const essentialScored = scoreAssociatedRows([panEssentialRow]).all[0];

  expect(essentialScored.safetyProfile).toBe("Pan-Essential Warning");
  expect(essentialScored.noveltyScore).toBeLessThan(baselineScored.noveltyScore);
  expect(essentialScored.paralogs).toEqual([
    { symbol: "ERBB2", identityPct: 82 },
    { symbol: "ERBB4", identityPct: 76 },
  ]);
  expect(essentialScored.triageDimensions).toEqual(
    expect.objectContaining({
      geneticEvidence: expect.any(Number),
      pocketDruggability: expect.any(Number),
      structuralQuality: expect.any(Number),
      safetySpecificity: expect.any(Number),
      chemicalMatter: expect.any(Number),
    })
  );
});



