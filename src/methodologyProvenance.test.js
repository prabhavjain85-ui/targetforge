/**
 * Acceptance test for the methodology validation section: every figure quoted
 * on the public page must trace to a generated file under benchmark/.
 *
 * The page previously said the docking engine "failed redocking on every
 * target tested" while RESULTS.md reported 10/11 passing for the Vina path.
 * Both were true of different engines and the page did not say which, so a
 * reader could not reconcile them. This test fails if the page and the
 * benchmark artifacts drift apart again.
 */
import fs from "fs";
import path from "path";
import {
  SCORE_CHIPS,
  VALIDATION_COMMIT_SHORT,
  VALIDATION_SECTIONS,
} from "./shared/validationCopy";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const page = read("src/MethodologyPage.jsx");
const results = read("benchmark/docking/RESULTS.md");
const task1 = read("benchmark/docking/TASK1_BASELINES.md");
const task2 = read("benchmark/docking/TASK2_DECOY_BENCHMARK.md");
const validationCopy = read("src/shared/validationCopy.js");
const validationPage = read("src/ValidationPage.jsx");
const discoveryPage = read("src/TargetDiscoveryPage.jsx");
const task3 = JSON.parse(read("benchmark/docking/results/task3_novelty_validation.json"));
const task4 = JSON.parse(read("benchmark/docking/results/task4_attention_control.json"));
const fittedAsset = JSON.parse(read("server/data/novelty/fitted-simplex-weights.json"));

/** Every metric-looking number a user can read, across the validation copy. */
const COPY_NUMBERS = (validationCopy.match(/\b0\.\d{3}\b/g) || []).map(Number);
const approved25 = JSON.parse(read("benchmark/docking/results/approved_25.json"));
const enrichment = JSON.parse(read("benchmark/docking/results/enrichment.json"));

describe("methodology page separates the two docking engines", () => {
  test("no longer claims blanket failure without naming the engine", () => {
    expect(page).not.toContain("failed redocking on every target tested");
  });

  test("names both engines and their different outcomes", () => {
    expect(page).toMatch(/in-browser empirical engine/i);
    expect(page).toMatch(/autodock vina/i);
    // The in-browser engine fails; the Vina path passes 10/11.
    expect(page).toMatch(/10 of 11 targets pass/i);
  });

  test("keeps the known ADRB2 failure visible with its reason", () => {
    expect(page).toMatch(/ADRB2/);
    expect(page).toMatch(/3SN6/);
    expect(page).toMatch(/fusion construct/i);
  });
});

describe("every quoted figure traces to a benchmark artifact", () => {
  test("redocking panel result matches RESULTS.md", () => {
    expect(results).toMatch(/10\/11 \(91%\)/);
    expect(page).toMatch(/10 of 11 targets pass \(91%\)/i);
  });

  test("pair reliability matches RESULTS.md", () => {
    expect(results).toMatch(/Reliable: 15\/25/);
    expect(page).toMatch(/15 of 25/i);
  });

  test("Spearman rho and its confidence interval match approved_25.json", () => {
    const rho = approved25.spearman_vina_vs_pchembl.rho;
    expect(rho).toBeCloseTo(-0.291, 3);
    expect(page).toContain("−0.291");
    // The interval spans zero; the page must not imply a reliable correlation.
    expect(page).toContain("−0.681 to 0.478");
    expect(page).toMatch(/spans zero/i);
  });

  test("per-target enrichment figures match enrichment.json", () => {
    const byTarget = {};
    for (const r of enrichment.targets || []) byTarget[String(r.target_id).toLowerCase()] = r;

    // Guard: if the artifact shape changes, fail loudly rather than pass vacuously.
    expect(Object.keys(byTarget).length).toBeGreaterThanOrEqual(3);

    // Each ROC-AUC, CI bound and EF@1% quoted on the page is read back from the
    // artifact and matched against the page text, so the two cannot drift.
    const expectations = [
      { id: "egfr", auc: "0.636", lo: "0.459", hi: "0.791", ef: "0.00", actives: 15, decoys: 50 },
      { id: "jak2", auc: "0.744", lo: "0.589", hi: "0.870", ef: "3.50", actives: 16, decoys: 40 },
      { id: "pde5a", auc: "0.800", lo: "0.668", hi: "0.911", ef: "0.00", actives: 18, decoys: 38 },
    ];

    for (const e of expectations) {
      const row = byTarget[e.id];
      expect(row).toBeDefined();
      expect(row.roc_auc).toBeCloseTo(Number(e.auc), 2);
      expect(row.roc_auc_ci_95[0]).toBeCloseTo(Number(e.lo), 2);
      expect(row.roc_auc_ci_95[1]).toBeCloseTo(Number(e.hi), 2);
      expect(row.ef1pct).toBeCloseTo(Number(e.ef), 2);
      expect(row.n_test_actives).toBe(e.actives);
      expect(row.n_test_decoys).toBe(e.decoys);
      // ...and the same numbers appear on the page.
      expect(page).toContain(e.auc);
      expect(page.toUpperCase()).toContain(e.id.toUpperCase());
    }

    // Two of the three targets show no early enrichment; the page states that.
    expect(page).toMatch(/EF@1% 0\.00/);
    expect(page).toMatch(/EF@1% 3\.50/);
    expect(page).toMatch(/no early enrichment/i);
  });

  test("the triage baseline finding matches TASK1_BASELINES.md", () => {
    expect(task1).toMatch(/DOES NOT beat/);
    expect(page).toMatch(/0\.583/);
    expect(page).toMatch(/0\.777/);
    expect(page).toMatch(/below chance/i);
  });

  test("provenance names the commit and the generation dates", () => {
    expect(page).toMatch(/2026-10-13/);
    expect(page).toMatch(/2026-11-16/);
    expect(page).toMatch(/83655b4/);
  });
});

describe("/validation page figures trace to committed artifacts", () => {
  const c2 = task3.cohort2_globally_undrugged_first_in_class.held_out_test;
  const c1 = task3.cohort1_disease_undrugged.held_out_test;
  const round3 = (x) => Number(Number(x).toFixed(3));

  test("target score figures match the Task 3 run", () => {
    expect(round3(c2.predictors.novelty_v2_current.roc_auc)).toBe(0.637);
    expect(round3(c2.predictors.novelty_v2_current.pr_auc)).toBe(0.038);
    expect(round3(c2.predictors.fitted_biology_simplex.roc_auc)).toBe(0.708);
    expect(round3(c2.predictors.fitted_biology_simplex.pr_auc)).toBe(0.052);
    expect(round3(c2.predictors.baseline_publication_count.roc_auc)).toBe(0.667);
    expect(round3(c2.predictors.baseline_publication_count.pr_auc)).toBe(0.057);
    expect(round3(c2.predictors.baseline_genetic_only.roc_auc)).toBe(0.5);
    expect(c2.n_total).toBe(11711);
    expect(c2.n_positives).toBe(258);
    // and the same figures appear in the copy shown to users
    for (const n of ["0.637", "0.038", "0.708", "0.052", "0.667", "0.057", "0.500", "11,711", "258", "2.2%"]) {
      expect(validationCopy).toContain(n);
    }
  });

  test("the removed formula is reported with its below-chance figures", () => {
    expect(round3(c1.predictors.novelty_v1_hyperbolic.roc_auc)).toBe(0.361);
    expect(round3(c1.predictors.baseline_inv_drug_count.roc_auc)).toBe(0.129);
    expect(validationCopy).toContain("0.361");
    expect(validationCopy).toContain("0.129");
    expect(validationCopy).toMatch(/below chance/i);
    expect(validationCopy).toMatch(/has been removed/i);
  });

  test("compound triage figures match the Task 2 benchmark", () => {
    for (const n of ["0.662", "0.523", "0.482", "0.520", "0.617", "0.099", "14/15"]) {
      expect(task2).toContain(n);
      expect(validationCopy).toContain(n);
    }
    expect(validationCopy).toMatch(/drug-likeness and liability filter/i);
    expect(validationCopy).toMatch(/does not predict/i);
  });

  test("docking figures match RESULTS.md", () => {
    expect(results).toMatch(/10\/11/);
    expect(results).toMatch(/Reliable: 15\/25/);
    for (const n of ["10/11", "15/25", "0.636", "0.744", "0.800", "−0.291", "−0.681 to 0.478"]) {
      expect(validationCopy).toContain(n);
    }
  });

  test("every three-decimal figure in the copy appears in a benchmark file", () => {
    const artifacts = results + task1 + task2 + JSON.stringify(task3) + JSON.stringify(task4);
    const unmatched = [];
    for (const n of new Set(COPY_NUMBERS)) {
      const asText = n.toFixed(3);
      // A figure counts as traced if it appears verbatim, or if any artifact
      // value rounds to it at three decimals.
      if (artifacts.includes(asText)) continue;
      const rounds = (artifacts.match(/\d+\.\d{3,}/g) || []).some(
        (v) => Number(Number(v).toFixed(3)) === n
      );
      if (!rounds) unmatched.push(asText);
    }
    expect(unmatched).toEqual([]);
  });

  test("the page names its generating commit and source files", () => {
    expect(validationPage).toMatch(/VALIDATION_COMMIT_SHORT/);
    expect(validationCopy).toMatch(/benchmark\/docking\/results\/task3_novelty_validation\.json/);
    expect(validationCopy).toMatch(/benchmark\/docking\/TASK2_DECOY_BENCHMARK\.md/);
    expect(VALIDATION_COMMIT_SHORT).toMatch(/^[0-9a-f]{7}$/);
  });
});

describe("Target Discovery chips quote the validated figures", () => {
  test("each chip carries its held-out metric", () => {
    // Scoped to both cohorts, and named for the direction it actually runs in.
    expect(SCORE_CHIPS.understudy).toMatch(
      /Evidence strength score — held-out ROC-AUC 0[.]637 on targets with no existing drug, 0[.]555 across all targets [(]PR-AUC 0[.]038 [/] 0[.]030[)]/
    );
    expect(SCORE_CHIPS.understudy).toMatch(/not a novelty score/);
    expect(SCORE_CHIPS.progression).toMatch(/Progression score — held-out ROC-AUC 0\.708 \(PR-AUC 0\.052\), precision@25 0\.12/);
    expect(SCORE_CHIPS.publications).toMatch(/Publication count — held-out ROC-AUC 0\.667 \(PR-AUC 0\.057\)/);
  });

  test("precision@25 on the chip matches the artifact", () => {
    const fitted = task3.cohort2_globally_undrugged_first_in_class.held_out_test.predictors.fitted_biology_simplex;
    expect(Number(fitted.precision_at_25.toFixed(2))).toBe(0.12);
  });

  test("the table renders the chips and links them to /validation", () => {
    expect(discoveryPage).toMatch(/SCORE_CHIPS\.understudy/);
    expect(discoveryPage).toMatch(/SCORE_CHIPS\.progression/);
    expect(discoveryPage).toMatch(/SCORE_CHIPS\.publications/);
    expect(discoveryPage).toMatch(/href="\/validation"/);
  });

  test("out-of-scope progression shows an em dash with the cohort reason", () => {
    expect(discoveryPage).toMatch(/already has an approved or clinical-stage drug, outside the validated cohort/);
  });

  test("the shipped weights match the committed fitted weights", () => {
    const fromReport = task3.weights_comparison.fitted_simplex_cohort2;
    expect(fittedAsset.weights).toEqual(fromReport);
  });
});

describe("heuristic-v2 is not described as predicting activity", () => {
  const uiFiles = [
    "src/HandoffStations.jsx",
    "src/HomepageIntro.jsx",
    "src/Layout.jsx",
    "src/LibraryScreenPanel.jsx",
  ];

  test("no UI file calls it a triage score or a prioritisation", () => {
    for (const f of uiFiles) {
      const text = read(f);
      expect(text).not.toMatch(/triage score/i);
      expect(text).not.toMatch(/AI prioriti[sz]ation/i);
    }
  });

  test("it is labelled a drug-likeness and liability filter where described", () => {
    expect(read("src/HandoffStations.jsx")).toMatch(/drug-likeness and liability filter/i);
    expect(read("src/Layout.jsx")).toMatch(/drug-likeness and liability filter/i);
  });

  test("similarity is the ranking signal in code, not just in the copy", () => {
    const scorer = read("server/scoreCandidates.js");
    const sortBlock = scorer.slice(scorer.indexOf("scored.sort((a, b)"), scorer.indexOf("Competition ranking"));
    expect(sortBlock).toMatch(/haveSimilarity/);
    // similarity is consulted before the heuristic score
    expect(sortBlock.indexOf("simB !== simA")).toBeLessThan(sortBlock.indexOf("b.score !== a.score"));
  });
});

describe("Task 4 attention control figures trace to the committed run", () => {
  const h = task4.held_out;
  const paired = task4.paired_deltas.M1_vs_M0;
  const clustered = task4.clustered_deltas.M1_vs_M0;
  const section = VALIDATION_SECTIONS.find((s) => s.id === "attention-control");
  const round = (x, d = 3) => Number(Number(x).toFixed(d));

  test("the three nested models match the artifact", () => {
    expect(round(h.models.M0.roc_auc)).toBe(0.667);
    expect(round(h.models.M1.roc_auc)).toBe(0.721);
    expect(round(h.models.M2.roc_auc)).toBe(0.683);
    expect(round(h.models.M0.pr_auc)).toBe(0.057);
    expect(round(h.models.M1.pr_auc)).toBe(0.069);
    expect(round(h.models.M2.pr_auc)).toBe(0.049);
    for (const n of ["0.667", "0.721", "0.683", "0.057", "0.069", "0.049"]) {
      expect(section.body).toContain(n);
    }
  });

  test("M0 reproduces the Task 3 publication-count baseline", () => {
    // Different script, same cohort and split: if these drift apart, one of the
    // two pipelines has changed and the comparison is no longer like for like.
    const task3Pub =
      task3.cohort2_globally_undrugged_first_in_class.held_out_test.predictors
        .baseline_publication_count.roc_auc;
    expect(round(h.models.M0.roc_auc)).toBe(round(task3Pub));
    expect(h.n_total).toBe(11711);
    expect(h.n_positives).toBe(258);
  });

  test("the paired delta and its CI are committed, as the acceptance requires", () => {
    expect(round(paired.roc_auc.delta)).toBe(0.054);
    expect(round(paired.roc_auc.ci_low)).toBe(0.021);
    expect(round(paired.roc_auc.ci_high)).toBe(0.089);
    expect(round(paired.pr_auc.delta)).toBe(0.012);
    expect(round(paired.pr_auc.ci_low)).toBe(0.001);
    expect(round(paired.pr_auc.ci_high)).toBe(0.025);
    expect(paired.roc_auc.includes_zero).toBe(false);
  });

  test("the page reports the weaker clustered interval, not only the pair-level one", () => {
    // Anti-hype: the stricter test must be on the page, including the part of it
    // that fails. PR-AUC does not survive disease-level resampling.
    expect(clustered.pr_auc.includes_zero).toBe(true);
    expect(section.body).toContain("0.003");
    expect(section.body).toContain("0.112");
    expect(section.body).toMatch(/includes zero/i);
    expect(section.body).toMatch(/does\s+not/i);
  });

  test("the headline finding is governed by the conservative bootstrap", () => {
    const md = read("benchmark/docking/TASK4_ATTENTION_CONTROL.md");
    expect(task4.finding).toMatch(/ranking signal beyond attention/i);
    expect(task4.finding).toMatch(/PR-AUC does not survive/i);
    expect(md).toContain(task4.finding);
  });

  test("residualisation shows only literature is attention-driven", () => {
    const byKey = Object.fromEntries(task4.residualised.map((r) => [r.feature, r]));
    expect(round(byKey.literature.regression_on_log1p_pub_count.r2)).toBe(0.34);
    // The next largest is rna_expression at 0.0701; the copy names that value
    // rather than claiming a bound the data does not support.
    const others = Object.keys(byKey)
      .filter((k) => k !== "literature")
      .map((k) => byKey[k].regression_on_log1p_pub_count.r2);
    expect(Math.max(...others)).toBe(byKey.rna_expression.regression_on_log1p_pub_count.r2);
    expect(round(byKey.rna_expression.regression_on_log1p_pub_count.r2)).toBe(0.07);
    expect(Math.max(...others)).toBeLessThan(0.1);
    expect(section.body).toContain("RNA expression at 0.070");
    expect(round(byKey.somatic_mutation.held_out_roc_auc_residual)).toBe(0.709);
    expect(round(byKey.somatic_mutation.held_out_roc_auc_raw)).toBe(0.564);
    expect(section.body).toContain("0.340");
    expect(section.body).toContain("0.709");
  });

  test("nothing in the run is fitted on the held-out diseases", () => {
    expect(task4.n_train_diseases).toBe(11);
    expect(task4.n_test_diseases).toBe(11);
    expect(task4.historical_release).toMatch(/21\.04/);
    expect(task4.leakage_controls.join(" ")).toMatch(/fitted on the 11 training diseases/i);
  });
});
