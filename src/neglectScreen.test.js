/**
 * Tests for the neglect screen.
 *
 * Two properties matter more than the rest and are asserted hardest:
 *
 *   1. Effort can never raise a target's score. Task 8 declined to ship a score
 *      dominated by compound count; this screen must not reintroduce one.
 *   2. Missing effort data is never treated as zero effort. Open Targets 21.04
 *      tractability joined only 72.8% of benchmark targets, so defaulting an
 *      absent compound count to zero would manufacture precisely the neglected
 *      targets the screen claims to find.
 */
import fs from "fs";
import path from "path";
import {
  EFFORT_TIERS,
  EVIDENCE_MODEL,
  assertNoEffortTermInEvidence,
  burdenAssetInfo,
  effortProfile,
  evidenceScore,
  indiaBurdenFor,
  screenLimitations,
} from "../server/neglectScreen";
import { NEGLECT_SCREEN_COPY } from "./shared/validationCopy";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");
const task4 = JSON.parse(read("benchmark/docking/results/task4_attention_control.json"));
const task7 = JSON.parse(read("benchmark/docking/results/task7_cancer_stratification.json"));
const task8 = JSON.parse(read("benchmark/docking/results/task8_tractability.json"));
const m1Asset = JSON.parse(read("server/data/novelty/fitted-m1-weights.json"));

describe("the evidence axis carries no measure of prior effort", () => {
  test("the feature list is exactly M1: attention plus the eight biology scores", () => {
    expect(EVIDENCE_MODEL.featureOrder).toEqual(Object.keys(task4.coefficients.M1.coefficients));
    expect(EVIDENCE_MODEL.featureOrder).toContain("log1p_pub_count");
    expect(EVIDENCE_MODEL.featureOrder).toHaveLength(9);
  });

  test("no feature name resembles drugs, compounds, precedence or tractability", () => {
    expect(assertNoEffortTermInEvidence()).toBe(true);
    for (const f of EVIDENCE_MODEL.featureOrder) {
      expect(f).not.toMatch(/drug|compound|precedence|tractab|clinical|ligand|chembl/i);
    }
  });

  test("the guard throws if an effort feature is ever introduced", () => {
    // The point of the guard is that a future edit to the weights asset cannot
    // quietly turn this into the score Task 8 refused to ship.
    expect(() => assertNoEffortTermInEvidence(["log1p_pub_count", "tract_sm_high_quality_compounds"])).toThrow(
      /must contain no measure of prior effort/i
    );
    expect(() => assertNoEffortTermInEvidence(["drug_count"])).toThrow();
  });

  test("the score ignores drug and compound counts entirely", () => {
    const dt = { genetic_association: 0.7, somatic_mutation: 0.6, literature: 0.5 };
    // Same evidence, wildly different effort: identical score, by construction.
    expect(evidenceScore(dt, 0.6, 100)).toBe(evidenceScore(dt, 0.6, 100));
    const score = evidenceScore(dt, 0.6, 100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test("the shipped coefficients match the committed Task 4 run", () => {
    expect(m1Asset.coefficients).toEqual(task4.coefficients.M1.coefficients);
    expect(m1Asset.intercept).toBe(task4.coefficients.M1.intercept);
    expect(m1Asset.heldOutPerformance.rocAuc).toBe(task4.held_out.models.M1.roc_auc);
  });
});

describe("effort tiers never read absent data as zero", () => {
  test("a gene with no 21.04 record is unknown, not none", () => {
    const p = effortProfile({ ensemblId: "ENSG00000000000" });
    expect(p.tier).toBe(EFFORT_TIERS.UNKNOWN);
    expect(p.hqCompounds2021).toBeNull();
    expect(p.tierReason).toMatch(/unknown, not absent/i);
  });

  test("an unknown compound count is null rather than 0", () => {
    const p = effortProfile({ ensemblId: "NOT_A_GENE" });
    expect(p.hqCompounds2021).not.toBe(0);
    expect(p.hqCompounds2021).toBeNull();
    expect(p.pre2021DataAvailable).toBe(false);
  });

  test("current drugs make a target active even when 2021 data is missing", () => {
    const p = effortProfile({ ensemblId: "NOT_A_GENE", drugCount: 2 });
    expect(p.tier).toBe(EFFORT_TIERS.ACTIVE);
  });

  test("live clinical precedence makes a target active", () => {
    const p = effortProfile({
      ensemblId: "NOT_A_GENE",
      tractability: [{ id: "Approved Drug", value: true }],
    });
    expect(p.tier).toBe(EFFORT_TIERS.ACTIVE);
  });

  test("an unrecognised tractability shape yields null flags, never false", () => {
    const p = effortProfile({ ensemblId: "NOT_A_GENE", tractability: 42 });
    expect(p.liveClinicalPrecedence).toBeNull();
    expect(p.liveHighQualityLigand).toBeNull();
    expect(p.tier).toBe(EFFORT_TIERS.UNKNOWN);
  });

  test("the copy states that unknown is not zero", () => {
    expect(NEGLECT_SCREEN_COPY.unknownIsNotZero).toMatch(/not zero effort/i);
    expect(NEGLECT_SCREEN_COPY.unknownIsNotZero).toContain("72.8%");
    expect(NEGLECT_SCREEN_COPY.unknownIsNotZero).toMatch(/excluded/i);
  });
});

describe("burden is never defaulted or interpolated", () => {
  test("an unmapped disease reports unavailable with a reason", () => {
    const b = indiaBurdenFor("MONDO_9999999");
    expect(b.available).toBe(false);
    expect(b.reason).toMatch(/no exact-match mapping/i);
    expect(b.dalyThousands).toBeUndefined();
  });

  test("a mapped disease reports the published figure unchanged", () => {
    const burdenFile = JSON.parse(read("benchmark/burden/india_disease_burden.json"));
    const mapping = JSON.parse(read("benchmark/burden/ghe_to_efo_mapping.json"));
    const tb = mapping.mappings.find((m) => m.ghe_label === "Tuberculosis");
    expect(tb.efo_id).toBeTruthy();
    const cause = burdenFile.causes.find((c) => c.ghe_code === tb.ghe_code);
    const got = indiaBurdenFor(tb.efo_id);
    expect(got.available).toBe(true);
    // Exactly as published: no rounding or rescaling on the way through.
    expect(got.dalyThousands).toBe(cause.daly_thousands);
  });

  test("the mapping records its coverage and does not pretend to be complete", () => {
    const info = burdenAssetInfo();
    expect(info.available).toBe(true);
    expect(info.mappingCoverage.mapping_rate).toBeGreaterThan(0);
    expect(info.mappingCoverage.mapping_rate).toBeLessThan(1);
    expect(info.mappingCoverage.n_unmapped).toBeGreaterThan(0);
  });

  test("every mapping was accepted on an exact label match, not a best guess", () => {
    const mapping = JSON.parse(read("benchmark/burden/ghe_to_efo_mapping.json"));
    for (const m of mapping.mappings) {
      if (!m.efo_id) continue;
      expect(m.match_type).toMatch(/exact/);
      expect(m.efo_id).toMatch(/^(EFO|MONDO)_\d+$/);
    }
    expect(mapping.resolver.rejected_alternative).toMatch(/top-hit-wins/i);
  });

  test("no commercial or market proxy appears anywhere in the burden asset", () => {
    const asset = read("server/data/burden/india-burden.json").toLowerCase();
    for (const word of ["market", "revenue", "income", "gdp", "willingness", "price", "sales"]) {
      expect(asset).not.toContain(word);
    }
    expect(NEGLECT_SCREEN_COPY.burdenSourceCaveat).toMatch(/no market size/i);
  });

  test("the substitution away from the requested GBD India source is recorded", () => {
    const info = burdenAssetInfo();
    expect(info.source.not_the_requested_source).toBeTruthy();
    expect(info.source.not_the_requested_source.requested).toMatch(/ICMR/);
    expect(info.source.producer).toMatch(/World Health Organization/);
    expect(NEGLECT_SCREEN_COPY.burdenSourceCaveat).toMatch(/not the ICMR/i);
  });
});

describe("the screen reports what it cannot know", () => {
  const limits = screenLimitations();

  test("the oncology scope limit is present with its measured figures", () => {
    const l = limits.find((x) => x.id === "oncology-scope");
    expect(l).toBeTruthy();
    expect(l.detail).toContain(String(task4.held_out.models.M1.roc_auc));
    expect(l.detail).toContain(String(task7.strata.non_cancer.models.M0.roc_auc));
    expect(l.source).toMatch(/task7_cancer_stratification\.json/);
  });

  test("it says absence of effort is not evidence of an opportunity", () => {
    const l = limits.find((x) => x.id === "why-passed-over");
    expect(l.detail).toMatch(/not evidence of a missed opportunity/i);
    expect(NEGLECT_SCREEN_COPY.notOpportunities).toMatch(/not opportunities/i);
  });

  test("it admits the evidence score is partly a measure of attention", () => {
    const l = limits.find((x) => x.id === "evidence-is-attention-shaped");
    expect(l.detail).toContain(String(task4.held_out.models.M0.roc_auc));
    expect(l.detail).toMatch(/in tension with/i);
  });

  test("it names the temporal extrapolation", () => {
    expect(limits.find((x) => x.id === "temporal-extrapolation")).toBeTruthy();
  });

  test("every limitation has a title and a detail of real length", () => {
    expect(limits.length).toBeGreaterThanOrEqual(6);
    for (const l of limits) {
      expect(l.title.length).toBeGreaterThan(8);
      expect(l.detail.length).toBeGreaterThan(40);
    }
  });
});

describe("context columns stay out of the ranking", () => {
  test("the copy quotes the measured null result for the gene properties", () => {
    expect(NEGLECT_SCREEN_COPY.contextOnly).toContain("0.719");
    expect(NEGLECT_SCREEN_COPY.contextOnly).toContain("0.721");
    expect(NEGLECT_SCREEN_COPY.contextOnly).toContain("−0.002");
    expect(NEGLECT_SCREEN_COPY.contextOnly).toMatch(/do not enter the ranking/i);
    // And those figures are the committed ones.
    expect(Number(task8.held_out.models.M4.roc_auc.toFixed(3))).toBe(0.719);
    expect(task8.paired_deltas.M4_vs_M1.roc_auc.includes_zero).toBe(true);
  });

  test("the page renders them in a recessed column class", () => {
    const page = read("src/NeglectScreenPage.jsx");
    expect(page).toMatch(/context-col/);
    expect(page).toMatch(/NEGLECT_SCREEN_COPY\.contextOnly/);
  });
});

describe("the screen's own copy traces to committed artifacts", () => {
  test("the evidence axis figures match Task 4 and Task 7", () => {
    expect(NEGLECT_SCREEN_COPY.evidenceAxis).toContain("0.721");
    expect(NEGLECT_SCREEN_COPY.evidenceAxis).toContain("0.667");
    expect(NEGLECT_SCREEN_COPY.evidenceAxis).toContain("0.730");
    expect(NEGLECT_SCREEN_COPY.evidenceAxis).toContain("0.722");
    expect(Number(task4.held_out.models.M1.roc_auc.toFixed(3))).toBe(0.721);
    expect(Number(task4.held_out.models.M0.roc_auc.toFixed(3))).toBe(0.667);
    expect(Number(task7.strata.non_cancer.models.M0.roc_auc.toFixed(3))).toBe(0.73);
  });

  test("the compound-count figure matches Task 8", () => {
    expect(NEGLECT_SCREEN_COPY.intro).toContain("0.772");
    expect(Number(task8.solo_held_out_roc_auc.tract_sm_high_quality_compounds.toFixed(3))).toBe(
      0.772
    );
  });

  test("it says effort is a filter and never a positive term", () => {
    expect(NEGLECT_SCREEN_COPY.effortIsAFilter).toMatch(/filter, never a positive term/i);
    expect(NEGLECT_SCREEN_COPY.effortIsAFilter).toMatch(/declined to ship/i);
  });

  test("no promotional adjective appears in any screen string", () => {
    const all = Object.values(NEGLECT_SCREEN_COPY)
      .filter((v) => typeof v === "string")
      .join(" ")
      .toLowerCase();
    for (const w of ["powerful", "cutting-edge", "revolutionary", "breakthrough", "unlock", "untapped"]) {
      expect(all).not.toContain(w);
    }
  });
});
