/**
 * Task 1 acceptance: the single novelty score is split into two separately
 * named scores, the fitted one is scoped to the cohort it was validated on,
 * and neither contains a drug-count divisor.
 *
 * Context: the retrospective validation showed the shipped score was
 * anti-predictive on cohort 1 (ROC-AUC 0.361) because it divided biology by
 * drug count, and that the inverse drug-count term alone scored 0.129.
 */
import fs from "fs";
import path from "path";
import {
  understudyScore,
  progressionScore,
  noveltyScoreValueDeprecated,
  biologySignal,
  PROGRESSION_WEIGHTS,
  PROGRESSION_PROVENANCE,
  PROGRESSION_PERFORMANCE,
  scoreAssociatedRows,
} from "../server/noveltyScore";

const BIOLOGY_FEATURES = [
  "genetic_association",
  "genetic_literature",
  "somatic_mutation",
  "overall",
  "literature",
  "affected_pathway",
  "animal_model",
  "rna_expression",
];

function row({ symbol, drugs = 0, genetic = 0.6, literature = 0.4, overall = 0.5, pubs = 0 }) {
  return {
    score: overall,
    datatypeScores: [
      { id: "genetic_association", score: genetic },
      { id: "literature", score: literature },
    ],
    datasourceScores: [],
    target: {
      id: `ENSG_${symbol}`,
      approvedSymbol: symbol,
      approvedName: symbol,
      biotype: "protein_coding",
      drugAndClinicalCandidates: { count: drugs },
      literatureOcurrences: { count: pubs },
    },
  };
}

describe("neither score contains a drug-count divisor", () => {
  test("understudyScore is unaffected by drug count", () => {
    const biology = biologySignal({ genetic_association: 0.8 }, 0.5);
    // The score takes only the biology signal, so there is no count to pass.
    expect(understudyScore.length).toBe(1);
    expect(understudyScore(biology)).toBe(understudyScore(biology));
  });

  test("the same biology gives the same understudy score regardless of drugs", () => {
    const a = scoreAssociatedRows([row({ symbol: "A", drugs: 0 })]).all[0];
    const b = scoreAssociatedRows([row({ symbol: "B", drugs: 40 })]).all[0];
    expect(a.understudyScore).toBe(b.understudyScore);
  });

  test("progression weights cover exactly the eight biology features and sum to 1", () => {
    expect(Object.keys(PROGRESSION_WEIGHTS).sort()).toEqual([...BIOLOGY_FEATURES].sort());
    const sum = BIOLOGY_FEATURES.reduce((s, f) => s + PROGRESSION_WEIGHTS[f], 0);
    expect(sum).toBeCloseTo(1, 2);
    // No drug-count feature may appear in the fitted model.
    expect(Object.keys(PROGRESSION_WEIGHTS).join(",")).not.toMatch(/drug/i);
  });

  test("the module source contains no drug-count divisor in either score", () => {
    const src = fs.readFileSync(path.join(__dirname, "../server/noveltyScore.js"), "utf8");
    const understudyBody = src.slice(src.indexOf("export function understudyScore"), src.indexOf("export function progressionScore"));
    const progressionBody = src.slice(
      src.indexOf("export function progressionScore"),
      src.indexOf("let deprecationLogged")
    );
    for (const body of [understudyBody, progressionBody]) {
      expect(body).not.toMatch(/broadDrugDiscount/);
      expect(body).not.toMatch(/1\s*\+\s*drugCount/);
    }
  });
});

describe("progressionScore is scoped to the validated cohort", () => {
  const dt = { genetic_association: 0.6, literature: 0.4 };

  test("returns a number for a globally undrugged target", () => {
    const value = progressionScore(dt, 0.5, 0);
    expect(typeof value).toBe("number");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  test("returns null once the target has any approved or clinical drug", () => {
    // Cohort 2 was defined as drugCount_2021 == 0; anything else is out of scope.
    expect(progressionScore(dt, 0.5, 1)).toBeNull();
    expect(progressionScore(dt, 0.5, 9)).toBeNull();
  });

  test("scoreAssociatedRows flags scope per row", () => {
    const { all } = scoreAssociatedRows([
      row({ symbol: "UNDRUGGED", drugs: 0 }),
      row({ symbol: "DRUGGED", drugs: 5 }),
    ]);
    const undrugged = all.find((r) => r.symbol === "UNDRUGGED");
    const drugged = all.find((r) => r.symbol === "DRUGGED");
    expect(undrugged.progressionScore).not.toBeNull();
    expect(undrugged.progressionInScope).toBe(true);
    expect(drugged.progressionScore).toBeNull();
    expect(drugged.progressionInScope).toBe(false);
  });
});

describe("deprecated alias", () => {
  test("returns the understudy value and warns once", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const biology = biologySignal({ genetic_association: 0.7 }, 0.4);
    const first = noveltyScoreValueDeprecated(biology);
    const second = noveltyScoreValueDeprecated(biology);
    expect(first).toBe(understudyScore(biology));
    expect(second).toBe(first);
    // Warned at most once across both calls (may already have fired elsewhere).
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  test("the legacy noveltyScore field is still present on each row", () => {
    const item = scoreAssociatedRows([row({ symbol: "LEGACY" })]).all[0];
    expect(item).toHaveProperty("noveltyScore");
    expect(item).toHaveProperty("understudyScore");
  });
});

describe("publicationCount is a first-class field", () => {
  test("is returned per row from Open Targets literatureOcurrences", () => {
    const item = scoreAssociatedRows([row({ symbol: "PUBS", pubs: 4485 })]).all[0];
    expect(item.publicationCount).toBe(4485);
  });

  test("defaults to 0 when the field is absent rather than undefined", () => {
    const bare = row({ symbol: "NOPUBS" });
    delete bare.target.literatureOcurrences;
    expect(scoreAssociatedRows([bare]).all[0].publicationCount).toBe(0);
  });

  test("the discovery query actually requests it", () => {
    const src = fs.readFileSync(path.join(__dirname, "../server/openTargets.js"), "utf8");
    expect(src).toMatch(/literatureOcurrences\s*\{\s*count\s*\}/);
  });
});

describe("fitted weights carry their provenance", () => {
  test("names the release pair, cohort and held-out sample", () => {
    expect(PROGRESSION_PROVENANCE.releasePair).toMatch(/21\.04/);
    expect(PROGRESSION_PROVENANCE.releasePair).toMatch(/26\.09/);
    expect(PROGRESSION_PROVENANCE.cohort).toMatch(/drugCount_2021 == 0/);
    expect(PROGRESSION_PROVENANCE.diseases.training).toBe(11);
    expect(PROGRESSION_PROVENANCE.diseases.heldOut).toBe(11);
    expect(PROGRESSION_PROVENANCE.heldOut.pairs).toBe(11711);
    expect(PROGRESSION_PROVENANCE.heldOut.positives).toBe(258);
    expect(PROGRESSION_PROVENANCE.producedByCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  test("the stated performance matches the committed benchmark result", () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../benchmark/docking/results/task3_novelty_validation.json"), "utf8")
    );
    const fitted = report.cohort2_globally_undrugged_first_in_class.held_out_test.predictors.fitted_biology_simplex;
    expect(PROGRESSION_PERFORMANCE.rocAuc).toBeCloseTo(fitted.roc_auc, 4);
    expect(PROGRESSION_PERFORMANCE.prAuc).toBeCloseTo(fitted.pr_auc, 4);
    // Rounds to the 0.708 shown to users.
    expect(Number(PROGRESSION_PERFORMANCE.rocAuc.toFixed(3))).toBe(0.708);
  });
});
