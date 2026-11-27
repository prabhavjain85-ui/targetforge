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
import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  MEASURED,
  NEGLECT_SCREEN_COPY,
  SCORE_CHIPS,
  SITE_COPY,
  TARGET_DISCOVERY_COPY,
  VALIDATION_COMMIT_SHORT,
  VALIDATION_SECTIONS,
  VALIDATION_SOURCES,
} from "./shared/validationCopy";
import { VINA_MEASURED } from "./shared/dockingStatus";
import MethodologyPage from "./MethodologyPage";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const page = read("src/MethodologyPage.jsx");

/**
 * The rendered methodology page, as text.
 *
 * The figures on this page used to be literal text in the JSX, so grepping
 * the source was enough to check them. They now interpolate from MEASURED and
 * VINA_MEASURED, which is the point of the content sweep: a figure exists once
 * and every surface renders it. Checking the source would therefore pass
 * vacuously on an interpolation that resolves to undefined, so every figure
 * assertion below reads the DOM instead. `page` is still used, but only for
 * what must be ABSENT from the source.
 */
global.IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_TEXT = (() => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  // MemoryRouter because SeoIntroLinks renders react-router <Link>s.
  act(() => {
    root.render(
      React.createElement(MemoryRouter, null, React.createElement(MethodologyPage))
    );
  });
  const text = container.textContent || "";
  act(() => root.unmount());
  container.remove();
  return text;
})();
const results = read("benchmark/docking/RESULTS.md");
const task1 = read("benchmark/docking/TASK1_BASELINES.md");
const task2 = read("benchmark/docking/TASK2_DECOY_BENCHMARK.md");
const validationCopy = read("src/shared/validationCopy.js");
const validationPage = read("src/ValidationPage.jsx");
const discoveryPage = read("src/TargetDiscoveryPage.jsx");
const task3 = JSON.parse(read("benchmark/docking/results/task3_novelty_validation.json"));
const task4 = JSON.parse(read("benchmark/docking/results/task4_attention_control.json"));
const task8 = JSON.parse(read("benchmark/docking/results/task8_tractability.json"));
const task7 = JSON.parse(read("benchmark/docking/results/task7_cancer_stratification.json"));
const task10 = JSON.parse(read("benchmark/docking/results/task10_repurposing_validation.json"));
const fittedAsset = JSON.parse(read("server/data/novelty/fitted-simplex-weights.json"));

/**
 * Every committed benchmark artifact, concatenated, for traceability checks.
 *
 * The task write-ups are included alongside the JSON: some figures are only
 * stated in the markdown (the Open Targets tractability join rate, 72.8%, is
 * derived in TASK8 and not emitted as a field), and a figure stated only in a
 * committed write-up still traces.
 */
const ARTIFACT_TEXT =
  results +
  task1 +
  task2 +
  read("benchmark/docking/TASK3_NOVELTY_VALIDATION.md") +
  read("benchmark/docking/TASK4_ATTENTION_CONTROL.md") +
  read("benchmark/docking/TASK7_CANCER_STRATIFICATION.md") +
  read("benchmark/docking/TASK8_TRACTABILITY.md") +
  read("benchmark/docking/TASK9_NEGLECT_SCREEN.md") +
  read("benchmark/docking/TASK10_REPURPOSING.md") +
  JSON.stringify(task3) +
  JSON.stringify(task4) +
  JSON.stringify(task7) +
  JSON.stringify(task8) +
  JSON.stringify(task10);

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
    // Via VINA_MEASURED, so this page and the docking copy cannot diverge.
    expect(VINA_MEASURED.potencySpearman).toBe("−0.291");
    expect(VINA_MEASURED.potencySpearmanCi).toBe("−0.681 to 0.478");
    expect(PAGE_TEXT).toContain("−0.291");
    // The interval spans zero; the page must not imply a reliable correlation.
    expect(PAGE_TEXT).toContain("−0.681 to 0.478");
    expect(PAGE_TEXT).toMatch(/spans zero/i);
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
      // ...the shared constant carries them...
      const shared = VINA_MEASURED.enrichment.find(
        (x) => x.target.toLowerCase() === e.id
      );
      expect(shared).toBeDefined();
      expect(shared.roc).toBe(e.auc);
      expect(shared.ci).toBe(`${e.lo}–${e.hi}`);
      expect(shared.ef1).toBe(e.ef);
      expect(shared.actives).toBe(String(e.actives));
      expect(shared.decoys).toBe(String(e.decoys));
      // ...and the rendered page shows them.
      expect(PAGE_TEXT).toContain(e.auc);
      expect(PAGE_TEXT.toUpperCase()).toContain(e.id.toUpperCase());
    }

    // Two of the three targets show no early enrichment; the page states that.
    expect(PAGE_TEXT).toMatch(/EF@1% 0\.00/);
    expect(PAGE_TEXT).toMatch(/EF@1% 3\.50/);
    expect(PAGE_TEXT).toMatch(/no early enrichment/i);
  });

  test("the triage baseline finding quotes Task 2, not the superseded Task 1", () => {
    expect(task1).toMatch(/DOES NOT beat/);
    // Task 2 sanity-passing figures, matching /validation.
    expect(PAGE_TEXT).toMatch(/0\.523/);
    expect(PAGE_TEXT).toMatch(/0\.662/);
    expect(PAGE_TEXT).toMatch(/TASK2_DECOY_BENCHMARK/);
    expect(PAGE_TEXT).toMatch(/superseded/i);
  });

  test("no page quotes a figure from the superseded Task 1 benchmark", () => {
    // These are Task 1 weak-binder numbers. That benchmark had only 3 of 15
    // targets passing decoy sanity checks, and quoting it on the methodology
    // page while /validation quoted Task 2 is exactly how the two pages came
    // to state different values for the same quantity.
    const SUPERSEDED = ["0.583", "0.777", "0.684", "0.407"];
    const validationBodies = VALIDATION_SECTIONS.map((x) => x.body).join(" ");
    const offenders = [];
    for (const v of SUPERSEDED) {
      if (page.includes(v)) offenders.push(`methodology: ${v}`);
      if (validationBodies.includes(v)) offenders.push(`validation: ${v}`);
    }
    expect(offenders).toEqual([]);
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
    const artifacts = ARTIFACT_TEXT;
    const unmatched = [];
    for (const n of new Set(COPY_NUMBERS)) {
      const asText = n.toFixed(3);
      // A figure counts as traced if it appears verbatim, or if any artifact
      // value rounds to it at three decimals.
      if (artifacts.includes(asText)) continue;
      const rounds = (ARTIFACT_TEXT.match(/\d+\.\d{3,}/g) || []).some(
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

describe("Task 6 (Vina vs Tanimoto) is reported as unrun, not as a result", () => {
  const md = read("benchmark/docking/TASK6_VINA_VS_TANIMOTO.md");
  const resultPath = path.join(repoRoot, "benchmark/docking/results/task6_vina_vs_tanimoto.json");

  test("the status document says plainly that it has not run", () => {
    expect(md).toMatch(/Status: NOT RUN/);
    expect(md).toMatch(/contains no measurements/i);
  });

  test("it invents no figure of its own", () => {
    // It has produced no measurements, so every number in it must be one it
    // cites from an existing committed artifact. Checked by traceability rather
    // than an allowlist, so adding a cited figure cannot silently become
    // adding a fabricated one.
    const unmatched = [];
    for (const n of new Set(md.match(/\b0\.\d{3}\b/g) || [])) {
      if (ARTIFACT_TEXT.includes(n)) continue;
      const rounds = (ARTIFACT_TEXT.match(/\d+\.\d{3,}/g) || []).some(
        (v) => Number(Number(v).toFixed(3)) === Number(n)
      );
      if (!rounds) unmatched.push(n);
    }
    expect(unmatched).toEqual([]);
  });

  test("if a result file ever appears, the status document must stop saying NOT RUN", () => {
    // This is the guard: whoever runs the harness has to update the prose, and
    // the harness overwrites this file, so the two cannot disagree silently.
    if (fs.existsSync(resultPath)) {
      expect(md).not.toMatch(/Status: NOT RUN/);
    } else {
      expect(md).toMatch(/Status: NOT RUN/);
    }
  });

  test("Tanimoto remains the default ranker while the comparison is unmeasured", () => {
    expect(md).toMatch(/Tanimoto remains the default/i);
    const scorer = read("server/scoreCandidates.js");
    expect(scorer).toMatch(/haveSimilarity/);
  });

  test("it separates ranking from affinity prediction, in both doc and harness", () => {
    // A ranking win must not become evidence for affinity prediction: Vina
    // correlated with measured potency at Spearman -0.291 (CI -0.681 to 0.478).
    expect(md).toMatch(/Ranking is not affinity prediction/i);
    expect(md).toContain("−0.291");
    expect(md).toContain("−0.681 to 0.478");
    expect(md).toMatch(/must not be used to support each other/i);
    const py = read("benchmark/docking/scripts/run_vina_vs_tanimoto.py");
    expect(py).toMatch(/Ranking is not affinity prediction/i);
    expect(py).toMatch(/-0.291/);
  });

  test("promotion is gated on the target-level interval, not the pooled one", () => {
    const py = read("benchmark/docking/scripts/run_vina_vs_tanimoto.py");
    expect(py).toMatch(/per_target_mean_delta_roc_auc/);
    expect(py).toMatch(/resampling_unit": "target"|"resampling_unit": "target"/);
    // The gate reads the per-target interval.
    const gate = py.slice(py.indexOf("promote = ("), py.indexOf("if promote:"));
    expect(gate).toMatch(/per_target_mean_delta_roc_auc/);
    expect(gate).not.toMatch(/pooled_paired_delta/);
  });
  test("the harness refuses to write a result without its prerequisites", () => {
    const py = read("benchmark/docking/scripts/run_vina_vs_tanimoto.py");
    expect(py).toMatch(/def check_prerequisites/);
    expect(py).toMatch(/No result file was written/);
    expect(py).toMatch(/sys\.exit\(2\)/);
  });
});

describe("Task 8 tractability figures trace to the committed run", () => {
  const h = task8.held_out;
  const section = VALIDATION_SECTIONS.find((s) => s.id === "tractability-features");
  const round = (x, d = 3) => Number(Number(x).toFixed(d));

  test("the four models match the artifact", () => {
    expect(round(h.models.M0.roc_auc)).toBe(0.667);
    expect(round(h.models.M1.roc_auc)).toBe(0.721);
    expect(round(h.models.M3.roc_auc)).toBe(0.807);
    expect(round(h.models.M4.roc_auc)).toBe(0.719);
    expect(round(h.models.M3.pr_auc)).toBe(0.146);
    expect(round(h.models.M3.precision_at_25)).toBe(0.44);
    for (const n of ["0.667", "0.721", "0.807", "0.719", "0.146", "0.440"]) {
      expect(section.body).toContain(n);
    }
  });

  test("M3 beats M0 and the page says so", () => {
    const d = task8.paired_deltas.M3_vs_M0.roc_auc;
    expect(round(d.delta)).toBe(0.14);
    expect(d.includes_zero).toBe(false);
    expect(section.body).toContain("+0.140");
    expect(section.body).toContain("+0.100");
    expect(section.body).toContain("+0.181");
  });

  test("the gene-property features add nothing, and that is the headline", () => {
    // The result that governs how this run should be read: M4 keeps only gene
    // properties and does not improve on M1.
    const d = task8.paired_deltas.M4_vs_M1.roc_auc;
    expect(d.includes_zero).toBe(true);
    expect(round(d.delta)).toBe(-0.002);
    expect(task8.promotion.gene_property_features_add_nothing).toBe(true);
    expect(task8.finding).toMatch(/No gene-property feature tested here predicts/i);
    expect(section.body).toContain("−0.002");
    expect(section.body).toMatch(/includes zero/i);
    expect(section.body).toMatch(/add nothing/i);
  });

  test("the gain is attributed to the compound-count feature", () => {
    expect(round(task8.solo_held_out_roc_auc.tract_sm_high_quality_compounds)).toBe(0.772);
    expect(round(task8.solo_held_out_roc_auc.pli)).toBe(0.621);
    expect(task8.feature_kinds.effort).toContain("tract_sm_high_quality_compounds");
    expect(task8.feature_kinds.biology).toContain("pli");
    expect(task8.feature_kinds.biology).not.toContain("tract_sm_high_quality_compounds");
    expect(section.body).toContain("0.772");
    expect(section.body).toContain("0.621");
  });

  test("the criterion is met yet nothing was promoted, with the reason recorded", () => {
    expect(task8.promotion.criterion_met).toBe(true);
    expect(task8.promotion.promoted_to_production).toBe(false);
    expect(task8.promotion.note).toMatch(/Goodhart/i);
    expect(section.body).toMatch(/no score was\s+promoted/i);
  });

  test("every feature carries a vintage predating the cutoff", () => {
    const vintages = Object.values(task8.feature_source_vintage);
    expect(vintages.length).toBeGreaterThanOrEqual(4);
    for (const v of vintages) {
      expect(v.predates_cutoff).toBe(true);
      expect(v.release_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Nothing may postdate May 2021.
      expect(v.release_date <= "2021-05-31").toBe(true);
      expect(v.evidence.length).toBeGreaterThan(20);
    }
  });

  test("features under the 70% join gate are excluded and named", () => {
    const excluded = task8.join_rates.filter((j) => !j.included_in_model);
    expect(excluded.length).toBeGreaterThan(0);
    for (const j of excluded) {
      expect(j.excluded_reason).toBeTruthy();
      expect(j.join_rate < task8.min_join_rate || j.constant_on_cohort).toBe(true);
    }
    // And every included feature really does clear the gate.
    for (const j of task8.join_rates.filter((x) => x.included_in_model)) {
      expect(j.join_rate).toBeGreaterThanOrEqual(task8.min_join_rate);
    }
  });

  test("the DepMap common-essential flag is not counted for unscreened genes", () => {
    // It read 100% while it was defaulting absent genes to 0; a gene DepMap
    // never screened is unknown, not non-essential.
    const ce = task8.join_rates.find((j) => j.feature === "depmap_common_essential");
    const eff = task8.join_rates.find((j) => j.feature === "depmap_mean_gene_effect");
    expect(ce.join_rate).toBeLessThan(1);
    expect(ce.join_rate).toBe(eff.join_rate);
  });

  test("fitting never touches the held-out diseases", () => {
    expect(task8.n_train_diseases).toBe(11);
    expect(task8.n_test_diseases).toBe(11);
    expect(task8.leakage_controls.join(" ")).toMatch(/fitted on the 11 training diseases/i);
    expect(task8.leakage_controls.join(" ")).toMatch(/training-set medians/i);
  });
});

describe("every validation section names a real source file", () => {
  // This guard is here because it was missed once: the tractability section
  // referenced VALIDATION_SOURCES.task8Json, which was never defined, so the
  // page rendered "Source: undefined" and shipped that way in cc7cecc. A
  // section whose provenance is undefined is exactly what this page exists to
  // prevent, so the check is structural rather than per-section.
  test("no section has an undefined source", () => {
    for (const section of VALIDATION_SECTIONS) {
      expect(typeof section.source).toBe("string");
      expect(section.source.length).toBeGreaterThan(0);
      expect(section.source).not.toMatch(/undefined/);
    }
  });

  test("every named source file exists on disk", () => {
    for (const section of VALIDATION_SECTIONS) {
      const abs = path.join(repoRoot, section.source);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });

  test("every entry in VALIDATION_SOURCES points at a file that exists", () => {
    for (const [key, rel] of Object.entries(VALIDATION_SOURCES)) {
      expect(typeof rel).toBe("string");
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        throw new Error(`VALIDATION_SOURCES.${key} points at a missing file: ${rel}`);
      }
    }
  });
});

describe("Task 7 cancer stratification figures trace to the committed run", () => {
  const section = VALIDATION_SECTIONS.find((s) => s.id === "cancer-stratification");
  const labels = JSON.parse(read("benchmark/docking/data/disease_cancer_labels.json"));
  const round = (x, d = 3) => Number(Number(x).toFixed(d));

  test("the labelling is committed, complete and self-consistent", () => {
    expect(labels.diseases.length).toBe(22);
    expect(labels.counts.cancer).toBe(15);
    expect(labels.counts.non_cancer).toBe(7);
    const tally = labels.diseases.reduce(
      (a, d) => ((a[d.stratum] = (a[d.stratum] || 0) + 1), a),
      {}
    );
    expect(tally.cancer).toBe(labels.counts.cancer);
    expect(tally.non_cancer).toBe(labels.counts.non_cancer);
    // Every disease carries a reason, so the labelling can be argued with.
    for (const d of labels.diseases) {
      expect(d.rationale.length).toBeGreaterThan(5);
      expect(["cancer", "non_cancer"]).toContain(d.stratum);
    }
  });

  test("stratum counts match the artifact", () => {
    expect(task7.strata.cancer.n_diseases_with_cohort2_data).toBe(9);
    expect(task7.strata.cancer.n_total).toBe(10308);
    expect(task7.strata.cancer.n_positives).toBe(236);
    expect(task7.strata.non_cancer.n_diseases_in_split).toBe(2);
    expect(task7.strata.non_cancer.n_diseases_with_cohort2_data).toBe(1);
    expect(task7.strata.non_cancer.n_total).toBe(1403);
    expect(task7.strata.non_cancer.n_positives).toBe(22);
    for (const n of ["10,308", "236", "1,403", "22"]) {
      expect(section.body).toContain(n);
    }
  });

  test("the cancer stratum reproduces the pooled Task 4 result", () => {
    const c = task7.strata.cancer.paired_deltas.M1_vs_M0.roc_auc;
    expect(round(c.delta)).toBe(0.057);
    expect(c.includes_zero).toBe(false);
    expect(task7.strata.cancer.clustered_deltas.M1_vs_M0.roc_auc.includes_zero).toBe(false);
    // Within a whisker of the pooled +0.054 from Task 4.
    const pooled = task4.paired_deltas.M1_vs_M0.roc_auc.delta;
    expect(Math.abs(c.delta - pooled)).toBeLessThan(0.01);
    expect(section.body).toContain("+0.057");
    expect(section.body).toContain("+0.054");
  });

  test("no disease-level interval is manufactured for the one-disease stratum", () => {
    // The acceptance explicitly allows "underpowered to tell" and forbids
    // inventing a CI to avoid it.
    expect(task7.strata.non_cancer.clustered_deltas).toBeNull();
    expect(task7.strata.non_cancer.clustered_withheld_reason).toMatch(/would produce an interval/i);
    expect(task7.min_clusters_for_ci).toBeGreaterThanOrEqual(4);
    expect(section.body).toMatch(/no disease-level interval is reported/i);
  });

  test("the verdict is 'underpowered to tell' and says so plainly", () => {
    expect(task7.verdict_label).toBe("underpowered to tell");
    expect(task7.verdict).toMatch(/^\*\*Underpowered to tell\.\*\*/);
    expect(section.body).toMatch(/underpowered to tell/i);
  });

  test("the non-cancer point estimates are reported without being spun", () => {
    const sm = task7.somatic_mutation_residualised;
    expect(round(sm.cancer)).toBe(0.708);
    expect(round(sm.non_cancer)).toBe(0.73);
    expect(round(sm.all)).toBe(0.709);
    // The non-cancer number happens to favour generalisation; the copy must
    // say it cannot establish that, not lean on it.
    expect(section.body).toContain("0.708");
    expect(section.body).toContain("0.730");
    expect(section.body).toMatch(/cannot establish/i);
    expect(section.body).toMatch(/not as a comparison/i);
  });

  test("the one non-cancer disease shows no benefit, and the page says so", () => {
    const d = task7.strata.non_cancer.paired_deltas.M1_vs_M0.roc_auc;
    expect(d.includes_zero).toBe(true);
    expect(round(d.delta)).toBe(-0.008);
    expect(round(task7.strata.non_cancer.models.M0.roc_auc)).toBe(0.73);
    expect(round(task7.strata.non_cancer.models.M1.roc_auc)).toBe(0.722);
    expect(section.body).toContain("−0.008");
    expect(section.body).toContain("0.722");
  });

  test("the Task 4 section now carries the oncology scope limit", () => {
    const t4 = VALIDATION_SECTIONS.find((s) => s.id === "attention-control");
    expect(t4.body).toMatch(/oncology result/i);
    expect(t4.body).toContain("15 cancers");
    expect(t4.body).toContain("9 of the 11 held-out diseases");
  });

  test("models are fitted on the full training set, not per stratum", () => {
    expect(task7.models_fitted_on).toMatch(/full 11-disease training set/i);
    expect(task7.leakage_controls.join(" ")).toMatch(/No stratum is fitted on its own held-out data/i);
    expect(task7.leakage_controls.join(" ")).toMatch(/only the disease name/i);
  });
});

describe("Task 8 residualised features and per-stratum contribution", () => {
  const round = (x, d = 3) => Number(Number(x).toFixed(d));
  const byFeature = (n) => task8.residualised.find((r) => r.feature === n);

  test("every included feature has a residualised AUC", () => {
    const included = task8.join_rates.filter((j) => j.included_in_model && j.kind).map((j) => j.feature);
    expect(included.length).toBeGreaterThan(0);
    for (const name of included) {
      const r = byFeature(name);
      expect(r).toBeDefined();
      expect(Number.isFinite(r.held_out_roc_auc_residual)).toBe(true);
      expect(r.regression_on_log1p_pub_count).toHaveProperty("r2");
    }
  });

  test("compound count is not a publication-count proxy, and the report says so", () => {
    // This is the correction Table 7 forced: R2 against attention is ~0, and the
    // feature survives residualisation, so it is independent signal rather than
    // attention measured twice. It is still effort, not biology.
    const hq = byFeature("tract_sm_high_quality_compounds");
    expect(round(hq.regression_on_log1p_pub_count.r2)).toBe(0.002);
    expect(round(hq.held_out_roc_auc_residual)).toBe(0.699);
    expect(hq.kind).toBe("effort");
    expect(task8.finding).toMatch(/NOT a restatement of publication count/i);
    expect(task8.finding).toMatch(/is still no/i);
    expect(task8.finding).toMatch(/prior human effort/i);
  });

  test("DepMap contribution is reported per stratum, as Task 7 requires", () => {
    expect(task8.cancer_labels_source).toBe("benchmark/docking/data/disease_cancer_labels.json");
    const c = task8.per_stratum.cancer;
    const n = task8.per_stratum.non_cancer;
    expect(c.n_total).toBe(10308);
    expect(n.n_total).toBe(1403);
    for (const key of ["depmap_mean_gene_effect", "depmap_frac_dependent_lines", "depmap_common_essential"]) {
      expect(Number.isFinite(c.solo_held_out_roc_auc[key])).toBe(true);
      expect(Number.isFinite(n.solo_held_out_roc_auc[key])).toBe(true);
    }
  });

  test("the tractability gain holds on the cancers and is withheld on one disease", () => {
    const c = task8.per_stratum.cancer.paired_deltas.M3_vs_M1.roc_auc;
    expect(round(c.delta)).toBe(0.083);
    expect(c.includes_zero).toBe(false);
    // One non-cancer disease: pair-level interval includes zero, and no
    // disease-level interval is offered at all.
    const n = task8.per_stratum.non_cancer.paired_deltas.M3_vs_M1.roc_auc;
    expect(n.includes_zero).toBe(true);
    expect(task8.per_stratum.non_cancer.clustered_withheld).toBeTruthy();
  });

  test("M3 beats M1 under disease-level resampling, which permits but does not compel shipping", () => {
    // The brief's gate for a production change.
    expect(task8.clustered_deltas.M3_vs_M1.roc_auc.includes_zero).toBe(false);
    expect(task8.promotion.criterion_met).toBe(true);
    // And nothing shipped anyway, for the reason recorded.
    expect(task8.promotion.promoted_to_production).toBe(false);
    expect(task8.promotion.note).toMatch(/Goodhart/i);
  });
});

describe("the tractability section no longer calls compound count an attention proxy", () => {
  // The page said "attention is just measured better in compounds than in
  // papers" until Table 7 showed R2 0.002 against publication count. The claim
  // was wrong in the direction that made the story tidier, so it was corrected.
  const section = VALIDATION_SECTIONS.find((s) => s.id === "tractability-features");

  test("it states the independence rather than the proxy claim", () => {
    expect(section.body).not.toMatch(/measured better in compounds than in papers/i);
    expect(section.body).toMatch(/not simply publication count again/i);
    expect(section.body).toContain("0.002");
    expect(section.body).toContain("0.699");
    expect(section.body).toMatch(/independent predictor/i);
  });

  test("it still says the feature is not biology and nothing was promoted", () => {
    expect(section.body).toMatch(/what it is not is biology/i);
    expect(section.body).toMatch(/no score was promoted/i);
  });

  test("it carries the per-stratum result", () => {
    expect(section.body).toContain("+0.083");
    expect(section.body).toContain("9 held-out cancers");
  });
});

describe("the removed hypothesis module leaves nothing behind", () => {
  const files = [
    "src/index.js",
    "src/Header.jsx",
    "src/SeoIntroLinks.jsx",
    "src/seoConfig.js",
    "src/serverApi.js",
    "server/compute.js",
    "src/setupProxy.js",
    "public/sitemap.xml",
    "public/index.html",
  ];

  test("no route, nav entry, link or op references it", () => {
    for (const f of files) {
      const text = read(f);
      expect(text).not.toMatch(/\/hypothesis\b/);
      expect(text).not.toMatch(/HypothesisPage/);
      expect(text).not.toMatch(/hypothesis-eval/);
      expect(text).not.toMatch(/hypothesisService/);
      expect(text).not.toMatch(/parseHypothesisApi|evaluateHypothesisApi/);
    }
  });

  test("the deleted files are gone", () => {
    for (const p of [
      "api/hypothesis-eval.js",
      "server/hypothesis/hypothesisService.js",
      "src/HypothesisPage.jsx",
      "src/hypothesis/EvidenceGraph.jsx",
      "src/hypothesis/hypothesisReport.js",
    ]) {
      expect(fs.existsSync(path.join(repoRoot, p))).toBe(false);
    }
  });

  test("the platform-level disclaimer on the methodology page is kept", () => {
    // Deliberately retained: "computational hypothesis generator" there
    // describes the whole product, not the removed module.
    expect(page).toMatch(/computational hypothesis generator/i);
  });

  test("no dead hypothesis CSS remains", () => {
    expect(read("src/app.css")).not.toMatch(/hypothesis/i);
  });
});

describe("neglect screen strings trace to committed artifacts", () => {
  const section = VALIDATION_SECTIONS.find((s) => s.id === "neglect-screen");
  const limitations = JSON.parse(read("src/shared/screenLimitations.generated.json"));
  const round = (x, d = 3) => Number(Number(x).toFixed(d));

  test("the validation section exists and names its source", () => {
    expect(section).toBeTruthy();
    expect(section.source).toBe("benchmark/docking/results/task7_cancer_stratification.json");
  });

  test("the cancer-share figure matches the committed burden table", () => {
    const burden = JSON.parse(read("benchmark/burden/india_disease_burden.json"));
    const malignant = burden.causes.find((c) => c.ghe_code === "610");
    const share = ((100 * malignant.daly_thousands) / burden.total_daly_thousands).toFixed(1);
    expect(share).toBe("6.0");
    expect(section.body).toContain(`${share}%`);
  });

  test("the held-out disease counts match Task 7", () => {
    expect(section.body).toContain(
      String(task7.strata.cancer.n_diseases_with_cohort2_data)
    );
    expect(limitations.validationPanel.cancerDiseases).toBe(
      task7.strata.cancer.n_diseases_with_cohort2_data
    );
    expect(limitations.validationPanel.contributingDiseases).toBe(10);
    expect(limitations.validationPanel.nonCancerRocAucPubCountOnly).toBe(
      round(task7.strata.non_cancer.models.M0.roc_auc).toFixed(3)
    );
  });

  test("the generated list carries no four-decimal figure", () => {
    for (const l of limitations.limitations) {
      expect(l.detail.match(/\b\d+\.\d{4,}\b/g) || []).toEqual([]);
    }
  });

  test("the TDL names are the current IDG/Pharos four", () => {
    // Checked against the IDG/Pharos literature before shipping; these are
    // also the names server/noveltyScore.js assigns.
    for (const t of ["Tclin", "Tchem", "Tbio", "Tdark"]) {
      expect(section.body).toContain(t);
      expect(read("server/noveltyScore.js")).toContain(t);
    }
    expect(section.body).toMatch(/approximately Tbio/i);
  });

  test("prior art is credited on the validation page, not only on the screen", () => {
    expect(section.body).toMatch(/not original to TargetForge/i);
    expect(section.body).toMatch(/Illuminating the Druggable Genome/);
  });
});

describe("docking status has exactly one source of truth", () => {
  /** Every file a user-facing string could hide in. */
  const userFacing = () => {
    const out = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
        const rel = `${dir}/${name}`;
        const stat = fs.statSync(path.join(repoRoot, rel));
        if (stat.isDirectory()) {
          walk(rel);
        } else if (/\.(js|jsx)$/.test(name) && !/\.test\.jsx?$/.test(name)) {
          out.push(rel);
        }
      }
    };
    walk("src");
    walk("api");
    return out;
  };

  const HELPER = "src/shared/dockingStatus.js";

  test("the helper exists and owns the three states", () => {
    const h = read(HELPER);
    expect(h).toMatch(/VINA_LIVE/);
    expect(h).toMatch(/VINA_UNREACHABLE/);
    expect(h).toMatch(/OFF:/);
    expect(h).toMatch(/export function dockingStatus/);
  });

  test("no phrasing describes docking as pending a validation result", () => {
    // It described a finished negative result as work in progress.
    //
    // The first version of this guard matched "under validation" literally,
    // and HandoffStations shipped "temporarily unavailable DURING validation"
    // straight past it for weeks — the same claim, one preposition away. The
    // pattern now covers any preposition, because what is banned is the
    // claim, not the wording.
    const PENDING_VALIDATION = /\b(?:under|during|pending|awaiting|in)\s+validation\b/i;
    const offenders = [];
    for (const f of userFacing()) {
      // The helper is the one file allowed to name the phrase: its docblock
      // explains why it is banned everywhere else.
      if (f === HELPER) continue;
      const text = userFacingText(read(f));
      for (const line of text.split("\n")) {
        if (PENDING_VALIDATION.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("that guard catches every preposition, not just the one it shipped with", () => {
    const PENDING_VALIDATION = /\b(?:under|during|pending|awaiting|in)\s+validation\b/i;
    for (const phrasing of [
      "Molecular docking is temporarily unavailable during validation.",
      "Docking is under validation.",
      "This engine is pending validation.",
      "Results awaiting validation.",
    ]) {
      expect(PENDING_VALIDATION.test(phrasing)).toBe(true);
    }
    // ...and does not fire on legitimate uses of the word.
    for (const ok of [
      "see the validation page",
      "held-out validation figures",
      "it does not replace experimental target validation",
    ]) {
      expect(PENDING_VALIDATION.test(ok)).toBe(false);
    }
  });

  test("in-browser never qualifies docking as working or pending", () => {
    // The engine that works is a Vina service; the in-browser one failed. So
    // "in-browser" may appear only where it says that engine failed or is
    // disabled — never attached to a claim that docking runs, is available, or
    // is awaiting validation. Saying it failed is required copy, not a leak.
    const offenders = [];
    for (const f of userFacing()) {
      if (f === HELPER) continue;
      const text = read(f);
      for (const m of text.match(/[^.\n]*in-browser[^.\n]*/gi) || []) {
        if (!/dock/i.test(m)) continue;
        const saysItFailed = /fail|disabled|not used|never/i.test(m);
        const claimsItWorks = /under validation|available|runs|works|enabled|simulated/i.test(m);
        if (claimsItWorks && !saysItFailed) {
          offenders.push(`${f}: ${m.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no docking status sentence is hardcoded outside the helper", () => {
    // Phrases that assert a docking state. Any of them outside the helper is a
    // second source of truth, which is how the twelve strings drifted apart.
    const PATTERNS = [
      /docking is (?:under|currently|not|off|unavailable|paused)/i,
      /docking (?:paused|disabled|unavailable)/i,
      /no docking poses or scores/i,
      /simulated in-browser/i,
      /binding scores and poses are not available/i,
    ];
    const offenders = [];
    for (const f of userFacing()) {
      if (f === HELPER) continue;
      // Comments stripped: a note explaining why a phrase was removed must
      // not trip the guard that removed it, or the reason cannot be recorded
      // next to the code it applies to.
      const text = userFacingText(read(f));
      for (const re of PATTERNS) {
        const m = text.match(re);
        if (m) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every surface that shows docking status renders it from the helper", () => {
    for (const f of [
      "src/Layout.jsx",
      "src/HomepageIntro.jsx",
      "src/seoConfig.js",
      "src/MethodologyPage.jsx",
      "src/HandoffStations.jsx",
      "src/DockingRunCocrystalSection.jsx",
      "src/DockingPage.jsx",
    ]) {
      expect(read(f)).toMatch(/dockingStatusFromFlags|DOCKING_STATUS/);
    }
  });

  test("the failed in-browser engine is off and unreachable", () => {
    for (const f of ["src/featureFlags.js", "server/featureFlags.js"]) {
      expect(read(f)).toMatch(/DOCKING_ENGINE_ENABLED = false/);
    }
    // Unregistering the op matters as much as the flag: with the op present the
    // engine was reachable by a direct POST to /api/compute even though no UI
    // route used it.
    expect(read("server/compute.js")).not.toMatch(/^\s*runMolecularDocking:/m);
    expect(read("src/serverApi.js")).not.toMatch(/runMolecularDocking/);
  });

  test("DOCKING_UNAVAILABLE_NOTICE is gone from both flag files", () => {
    for (const f of ["src/featureFlags.js", "server/featureFlags.js"]) {
      expect(read(f)).not.toMatch(/DOCKING_UNAVAILABLE_NOTICE/);
    }
  });
});

describe("methodology and validation do not contradict each other", () => {
  const methodology = read("src/MethodologyPage.jsx");
  const validationText = VALIDATION_SECTIONS.map((s) => s.body).join("\n");

  /** Quantities both pages may state. A different value on each is a bug. */
  const SHARED = [
    { label: "Tanimoto", value: "0.662" },
    { label: "heuristic-v2", value: "0.523" },
    { label: "BEDROC20", value: "0.617" },
  ];

  test("both pages state the committed value for each shared quantity", () => {
    // Checked by exact value, not by proximity to a label. A proximity regex
    // read the random baseline (0.520) as the Tanimoto figure and reported a
    // contradiction that did not exist — the kind of false positive that gets
    // a guard deleted rather than fixed.
    const missing = [];
    for (const q of SHARED) {
      if (!task2.includes(q.value)) missing.push(`TASK2 lacks ${q.label} ${q.value}`);
      if (!methodology.includes(q.value) && !validationText.includes(q.value)) {
        missing.push(`neither page states ${q.label} ${q.value}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("the figures both pages quote are the committed ones", () => {
    for (const q of SHARED) {
      expect(task2).toContain(q.value);
    }
  });

  test("Station 3 describes similarity ranking, not AI prioritisation", () => {
    expect(methodology).not.toMatch(/AI prioriti[sz]ation/i);
    expect(PAGE_TEXT).toMatch(/Station 3 — Ranking and filters/);
    expect(PAGE_TEXT).toMatch(/Tanimoto similarity/i);
    expect(PAGE_TEXT).toContain("0.662");
    expect(PAGE_TEXT).toContain("0.523");
    expect(PAGE_TEXT).toMatch(/neither is AI/i);
  });

  test("docking paused appears nowhere", () => {
    for (const f of ["src/MethodologyPage.jsx", "src/HandoffStations.jsx"]) {
      expect(read(f)).not.toMatch(/docking paused/i);
    }
  });
});

describe("no surface presents LLM output as analysis", () => {
  test("the adversarial critique is gone entirely", () => {
    for (const p of [
      "api/adversarial-critique.js",
      "src/AdversarialCritique.jsx",
      "src/adversarialService.js",
      "server/adversarialService.js",
    ]) {
      expect(fs.existsSync(path.join(repoRoot, p))).toBe(false);
    }
    expect(read("src/setupProxy.js")).not.toMatch(/adversarial/i);
  });

  test("no component imports a deleted critique module", () => {
    for (const f of [
      "src/CandidateViews.jsx",
      "src/EvolutionPage.jsx",
      "src/HandoffStations.jsx",
      "src/RepurposingPage.jsx",
    ]) {
      expect(read(f)).not.toMatch(/AdversarialCritique/);
    }
  });

  test("any remaining LLM endpoint is labelled as generated where rendered", () => {
    // rank-candidates still attaches language-model narration. Wherever a
    // surface renders it, the text must be labelled as generated so a reader
    // can tell it from a measurement.
    // /api/rank-candidates optionally asks a language model to narrate a row
    // and attaches it as `reasoning`. Four components rendered that with
    // nothing to distinguish it from the measured scores beside it.
    const offenders = [];
    const files = fs
      .readdirSync(path.join(repoRoot, "src"))
      .filter((n) => /\.jsx$/.test(n) && !/\.test\./.test(n));
    for (const name of files) {
      const text = read(`src/${name}`);
      // Any component that reads .reasoning off a row is rendering narration.
      if (!/\.reasoning\b/.test(text)) continue;
      // The label must be RENDERED, not merely imported. Checking for the
      // identifier anywhere in the file passed a component whose JSX had been
      // deleted but whose import remained.
      const rendered = /\{LLM_NARRATION_LABEL\}/.test(text);
      const guarded = /isModelNarration\(/.test(text);
      if (!rendered || !guarded) offenders.push(`src/${name}`);
    }
    expect(offenders).toEqual([]);
  });

  test("Quantum Insight, which was never being built, is gone", () => {
    expect(fs.existsSync(path.join(repoRoot, "src/QuantumInsight.jsx"))).toBe(false);
    const offenders = [];
    for (const name of fs.readdirSync(path.join(repoRoot, "src"))) {
      if (!/\.(js|jsx)$/.test(name) || /\.test\./.test(name)) continue;
      if (/coming soon/i.test(read(`src/${name}`))) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

/* ========================================================================= *
 * The content sweep.
 *
 * The status sweep fixed what the site said about whether docking works.
 * These guards cover what it said its scores MEAN — claims the benchmarks
 * have since refuted:
 *
 *   "AI-powered"            nothing here is AI
 *   "genetically validated" genetic association alone scored at chance
 *   "underexplored"         zero prior effort predicts AGAINST progression
 *   "novelty score"         split into understudy and progression
 *   "opportunity"           nothing may assert a target is one
 *
 * The phrase bans run over user-facing STRINGS, not whole files: a comment
 * explaining why a phrase was removed must not trip the guard that removed
 * it, or the explanation cannot be written down.
 * ========================================================================= */

/** Every file that renders user-facing copy. */
const USER_FACING_FILES = fs
  .readdirSync(path.join(repoRoot, "src"))
  .filter((n) => /\.jsx?$/.test(n) && !/\.test\./.test(n))
  .map((n) => `src/${n}`)
  .concat(["src/shared/validationCopy.js", "src/shared/dockingStatus.js", "src/seoConfig.js"]);

/**
 * Strip what a user never reads: block comments, line comments, import
 * specifiers and JSX attribute names. What remains is string literals and JSX
 * text — the copy itself.
 */
function userFacingText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*import[\s\S]*?from\s+"[^"]+";/gm, " ")
    .replace(/\bclassName=("[^"]*"|\{[^}]*\})/g, " ")
    .replace(/\bid="[^"]*"/g, " ");
}

/**
 * Occurrences of "opportunit*" that are allowed, because they deny the thing
 * the ban exists to stop. The neglect screen's "They are not opportunities"
 * is the correct register and the sweep says to reuse it, so the guard has to
 * permit the denial while still catching the assertion.
 */
const NEGATED_OPPORTUNITY = [
  /\bnot\s+(?:an\s+)?opportunit/i,
  /\bnever\s+(?:an\s+)?opportunit/i,
  /\bdoes not identify opportunit/i,
  /\bunpursued,?\s+or an opportunit/i,
  // The identifier itself, e.g. NEGLECT_SCREEN_COPY.notOpportunities.
  /\bnotOpportunit/,
];

/**
 * Sentences allowed to contain a banned phrase because they report that the
 * claim was made and has been withdrawn.
 *
 * This is an explicit allowlist rather than a regex for words like "was" or
 * "previously", on purpose. A heuristic would let any new sentence through as
 * long as it was phrased in the past tense, which is precisely how the
 * original copy would come back. Every entry here had to be written down and
 * can be read in review; adding one is a visible act.
 *
 * Each entry must also be a denial or a history, never an assertion — the
 * "guards bite" test checks that an affirmative sentence is not covered by
 * any of them.
 */
const WITHDRAWN_CLAIM_ALLOWLIST = [
  // Criterion 04 opens by naming the formula it replaced and its figure.
  "used to describe a single &quot;novelty score&quot;",
  // Criterion 04 names the phrase it removed and why.
  "previously described these as genetically validated targets",
];

/**
 * Denying that a score is a novelty score is the opposite of claiming it is,
 * so the denial is always allowed — three surfaces say it, and the sweep asks
 * them to.
 */
const NEGATED_NOVELTY_SCORE = /\bnot\s+a\s+novelty\s+score/i;

/** True when a line denies the claim or reports it as withdrawn. */
function isWithdrawnClaim(line) {
  if (NEGATED_NOVELTY_SCORE.test(line)) return true;
  return WITHDRAWN_CLAIM_ALLOWLIST.some((allowed) => line.includes(allowed));
}

describe("no surface claims the site finds validated, novel or underexplored targets", () => {
  const BANNED = [
    { label: "AI-powered", pattern: /AI[-\s]?powered/i },
    { label: "genetically validated", pattern: /genetically[-\s]valid/i },
    { label: "underexplored", pattern: /underexplored/i },
    { label: "novelty score", pattern: /novelty\s+score/i },
  ];

  test("the four refuted phrases appear in no user-facing string", () => {
    const offenders = [];
    for (const file of USER_FACING_FILES) {
      const text = userFacingText(read(file));
      for (const { label, pattern } of BANNED) {
        for (const line of text.split("\n").filter((l) => pattern.test(l))) {
          if (isWithdrawnClaim(line)) continue;
          offenders.push(`${file}: ${label} → ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the static shell crawlers see carries none of them either", () => {
    // public/index.html is served before React hydrates and its <h1>, <title>
    // and og:/twitter: tags are what crawlers and no-JS readers get. It had
    // its own "AI-Powered" copy in six places, which no test looked at
    // because the suite only ever read src/.
    const shell = read("public/index.html");
    for (const { label, pattern } of BANNED) {
      expect({ label, hit: pattern.test(shell) }).toEqual({ label, hit: false });
    }
    expect(read("public/social-preview.svg")).not.toMatch(/AI[-\s]?powered/i);
    // The generator and the committed asset must agree, or the next regen
    // reintroduces it.
    expect(read("scripts/generate_social_preview.py")).not.toMatch(/AI[-\s]?powered/i);
  });

  test("'opportunity' appears only where it is denied", () => {
    const offenders = [];
    for (const file of USER_FACING_FILES) {
      const text = userFacingText(read(file));
      for (const line of text.split("\n")) {
        if (!/opportunit/i.test(line)) continue;
        if (NEGATED_OPPORTUNITY.some((re) => re.test(line))) continue;
        if (isWithdrawnClaim(line)) continue;
        offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the allowlist covers only denials and histories, never assertions", () => {
    // Every entry must read as withdrawn or denied. If an entry could be a
    // live claim, it does not belong on the list.
    for (const entry of WITHDRAWN_CLAIM_ALLOWLIST) {
      expect(entry).toMatch(/used to|previously/i);
    }
    // The list stays short on purpose: each entry is a hole in the guard.
    expect(WITHDRAWN_CLAIM_ALLOWLIST.length).toBeLessThanOrEqual(4);
    // And the affirmative forms the sweep removed are not covered by any of
    // them, so re-adding the original copy still fails.
    const originals = [
      "Find genetically validated, underexplored protein targets for a disease",
      "Highlighted as underexplored opportunities for first-in-class therapeutic development.",
      "AI-Powered Drug Discovery & Target Identification",
      'aria-label="How novelty score is calculated"',
      "A high novelty score is a hypothesis to follow up",
      "Novelty-ranked opportunities",
    ];
    for (const original of originals) {
      expect(isWithdrawnClaim(original)).toBe(false);
      expect(NEGATED_OPPORTUNITY.some((re) => re.test(original))).toBe(false);
      // ...and at least one banned pattern catches it.
      expect(
        BANNED.some((b) => b.pattern.test(original)) || /opportunit/i.test(original)
      ).toBe(true);
    }
  });

  test("the guards bite", () => {
    // A guard that cannot fail is not a guard.
    const fake =
      `const a = "Find genetically validated, underexplored targets";\n` +
      `const b = "AI-Powered Drug Discovery";\n` +
      `const c = "How novelty score is calculated";\n` +
      `const d = "a first-in-class opportunity";\n`;
    const text = userFacingText(fake);
    for (const { pattern } of BANNED) expect(pattern.test(text)).toBe(true);
    expect(/opportunit/i.test(text)).toBe(true);
    // The denial the guard must allow is allowed.
    expect(NEGATED_OPPORTUNITY.some((re) => re.test("They are not opportunities: a target"))).toBe(
      true
    );
    // A comment explaining a removal is stripped before the check, so the
    // explanation can be written without tripping the guard it explains.
    expect(/underexplored/i.test(userFacingText("// was underexplored\n"))).toBe(false);
    expect(/underexplored/i.test(userFacingText("/* underexplored */\n"))).toBe(false);
    // But a comment is the ONLY thing stripped: a string is still checked.
    expect(/underexplored/i.test(userFacingText('const x = "underexplored";'))).toBe(true);
  });
});

describe("numeric performance claims live only in the shared constants", () => {
  /**
   * Pages whose figures must all be interpolated. A three-decimal literal in
   * one of these is how /methodology came to quote the superseded Task 1
   * figures while /validation quoted Task 2's.
   */
  const RENDER_FILES = [
    "src/MethodologyPage.jsx",
    "src/TargetDiscoveryPage.jsx",
    "src/seoConfig.js",
    "src/NeglectScreenPage.jsx",
    // Carries no metric today, and is listed so it cannot start carrying a
    // hardcoded one.
    "src/HomepageIntro.jsx",
  ];

  test("no page file hardcodes a three-decimal metric", () => {
    const offenders = [];
    for (const file of RENDER_FILES) {
      const text = userFacingText(read(file));
      for (const line of text.split("\n")) {
        const hits = line.match(/\b0\.\d{3}\b/g);
        if (hits) offenders.push(`${file}: ${hits.join(", ")} → ${line.trim().slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every figure in MEASURED traces to a committed artifact", () => {
    const flat = [];
    const walk = (node, trail) => {
      if (typeof node === "string") return flat.push([trail, node]);
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${trail}[${i}]`));
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`);
      }
    };
    walk(MEASURED, "MEASURED");
    expect(flat.length).toBeGreaterThan(60);

    const artifactDecimals = (ARTIFACT_TEXT.match(/\d+\.\d{2,}/g) || []).map(Number);
    const untraced = [];
    for (const [trail, value] of flat) {
      // Each decimal inside the string must appear in, or round to, a value
      // in a committed artifact. Counts and windows carry no decimals.
      for (const raw of value.match(/\d+\.\d+/g) || []) {
        const dp = raw.split(".")[1].length;
        const n = Number(raw);
        if (ARTIFACT_TEXT.includes(raw)) continue;
        if (artifactDecimals.some((v) => Number(v.toFixed(dp)) === n)) continue;
        untraced.push(`${trail} = ${value} (${raw})`);
      }
    }
    expect(untraced).toEqual([]);
  });

  test("the artifact check bites", () => {
    const artifactDecimals = (ARTIFACT_TEXT.match(/\d+\.\d{2,}/g) || []).map(Number);
    const invented = "0.9991";
    expect(ARTIFACT_TEXT.includes(invented)).toBe(false);
    expect(artifactDecimals.some((v) => Number(v.toFixed(4)) === Number(invented))).toBe(false);
  });
});

describe("/methodology and /validation never state the same quantity differently", () => {
  const validationText = VALIDATION_SECTIONS.map((s) => s.body).join("\n") +
    Object.values(SCORE_CHIPS).join("\n");

  /**
   * Quantities both pages discuss. Each is checked for ONE rendered form, so
   * 0.0175 on one page and 0.018 on the other fails — which is the drift the
   * HARD RULE forbids, and was real: validationCopy rounded the genetic
   * simplex weight to 0.018 while the artifact and the sweep spec say 0.0175.
   */
  const SHARED_QUANTITIES = [
    { label: "understudy ROC (undrugged)", value: MEASURED.understudy.rocUndrugged, variants: ["0.64", "0.6370"] },
    { label: "progression ROC", value: MEASURED.progression.roc, variants: ["0.71", "0.7080"] },
    { label: "publication-count ROC", value: MEASURED.publications.roc, variants: ["0.67", "0.6670"] },
    { label: "biology + publications ROC", value: MEASURED.attention.publicationsPlusBiology, variants: ["0.72"] },
    { label: "compound count ROC", value: MEASURED.tractability.compoundCount, variants: ["0.77"] },
    { label: "removed novelty formula ROC", value: MEASURED.removedNoveltyFormula.roc, variants: ["0.36"] },
    { label: "heuristic-v2 ROC", value: MEASURED.compoundTriage.heuristicV2, variants: ["0.52"] },
    { label: "Tanimoto ROC", value: MEASURED.compoundTriage.tanimoto, variants: ["0.66"] },
    { label: "repurposing ROC", value: MEASURED.repurposing.shipped, variants: ["0.91"] },
  ];

  test("each shared quantity has exactly one rendered form on both pages", () => {
    const problems = [];
    for (const q of SHARED_QUANTITIES) {
      // Both surfaces state it...
      if (!PAGE_TEXT.includes(q.value)) problems.push(`/methodology omits ${q.label} ${q.value}`);
      if (!validationText.includes(q.value)) problems.push(`/validation omits ${q.label} ${q.value}`);
      // ...and neither states a differently-rounded form of it. The variant
      // must be matched as a whole number: "0.72" is a substring of "0.721",
      // so a plain includes() reports every correct figure as a re-rounding.
      for (const v of q.variants) {
        const whole = new RegExp(`(?<!\\d)${v.replace(".", "\\.")}(?!\\d)`);
        if (whole.test(PAGE_TEXT)) problems.push(`/methodology re-rounds ${q.label} to ${v}`);
        if (whole.test(validationText)) problems.push(`/validation re-rounds ${q.label} to ${v}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("the genetic simplex weight is stated identically, not re-rounded", () => {
    // The specific drift this rule exists to catch.
    expect(MEASURED.geneticAlone.simplexWeight).toBe("0.0175");
    const bothSurfaces = `${PAGE_TEXT}\n${validationText}`;
    expect(bothSurfaces).toContain("0.0175");
    expect(bothSurfaces).not.toContain("0.018 on genetic");
  });

  test("the site descriptor and target-discovery copy are shared, not duplicated", () => {
    // seoConfig renders SITE_COPY / TARGET_DISCOVERY_COPY rather than its own
    // wording, so the title and the H1 cannot drift apart again.
    const seo = read("src/seoConfig.js");
    expect(seo).toMatch(/SITE_COPY\.title/);
    expect(seo).toMatch(/SITE_COPY\.h1/);
    expect(seo).toMatch(/TARGET_DISCOVERY_COPY\.(lead|seo)/);
    expect(SITE_COPY.title).not.toMatch(/AI/i);
    expect(SITE_COPY.h1).not.toMatch(/AI/i);
    expect(TARGET_DISCOVERY_COPY.lead).toMatch(/not opportunities/i);
    expect(read("src/TargetDiscoveryPage.jsx")).toMatch(/TARGET_DISCOVERY_COPY\.lead/);
  });
});

describe("the methodology page no longer contradicts itself", () => {
  test("the anti-hype policy is not refuted elsewhere in the same file", () => {
    // Line 438 used to label targets "underexplored opportunities" twenty
    // lines above the box forbidding exactly that word.
    expect(PAGE_TEXT).toMatch(/Anti-Hype Reporting Policy/i);
    expect(PAGE_TEXT).toMatch(/asserts that a target is novel, unpursued, or an opportunity/i);
    // The column that carried the contradiction is gone, by its own id.
    expect(page).not.toMatch(/col-novelty-metric/);
    expect(page).not.toMatch(/First-in-Class Potential/i);
    expect(page).toMatch(/col-understudy-score/);
    expect(page).toMatch(/col-progression-score/);
  });

  test("Criterion 03 states measured performance before the score bands", () => {
    const measuredAt = PAGE_TEXT.indexOf(MEASURED.compoundTriage.heuristicV2);
    const bandsAt = PAGE_TEXT.indexOf("Score Bands");
    expect(measuredAt).toBeGreaterThan(-1);
    expect(bandsAt).toBeGreaterThan(-1);
    expect(measuredAt).toBeLessThan(bandsAt);
  });

  test("Criterion 04 reports the split scores and the removed formula", () => {
    expect(PAGE_TEXT).toMatch(/Evidence strength score/);
    expect(PAGE_TEXT).toMatch(/Progression score/);
    expect(PAGE_TEXT).toContain(MEASURED.removedNoveltyFormula.roc);
    expect(PAGE_TEXT).toMatch(/below chance/i);
    // Task 4, 7 and 8 as the sweep requires.
    expect(PAGE_TEXT).toContain(MEASURED.attention.deltaRoc);
    expect(PAGE_TEXT).toContain(MEASURED.attention.deltaRocCiDiseases);
    expect(PAGE_TEXT).toContain(MEASURED.cancerStratification.nonCancerPublicationsOnly);
    expect(PAGE_TEXT).toMatch(/underpowered to tell/i);
    expect(PAGE_TEXT).toContain(MEASURED.tractability.genePropertyDelta);
    expect(PAGE_TEXT).toContain(MEASURED.tractability.compoundCount);
    expect(PAGE_TEXT).toMatch(/No score was shipped on this result/i);
  });

  test("the two repurposing engines are not conflated", () => {
    // Criterion 05 is the compound screen (heuristic-v2); Task 10 is the
    // target-side profile. The page must say which is which.
    expect(PAGE_TEXT).toMatch(/does not score compounds/i);
    expect(PAGE_TEXT).toContain(MEASURED.repurposing.shipped);
    expect(PAGE_TEXT).toContain(MEASURED.compoundTriage.ruleTableOnly);
  });

  test("ADME location is stated once and says backend", () => {
    expect(PAGE_TEXT).not.toMatch(/in-browser (RDKit|ADME)/i);
    expect(PAGE_TEXT).toMatch(/RDKit, which runs on the backend|calculated on the backend/i);
    // The claim matches the code: RDKit is initialised only on the server.
    expect(read("server/rdkitLoader.js")).toMatch(/run exclusively on the server/i);
    const srcImports = fs
      .readdirSync(path.join(repoRoot, "src"))
      .filter((n) => /\.jsx?$/.test(n) && !/\.test\./.test(n))
      // Import statements only. Prose may name @rdkit/rdkit — the panels do,
      // when saying what computes their alerts — without loading it here.
      .filter((n) => /^\s*import[^\n]*(@rdkit|\.\/rdkit)/m.test(read(`src/${n}`)));
    expect(srcImports).toEqual([]);
  });

  test("the sections the site never had are present and sourced", () => {
    expect(PAGE_TEXT).toMatch(/The Neglect Screen, And What It Is Not/i);
    expect(PAGE_TEXT).toMatch(/not opportunities/i);
    expect(PAGE_TEXT).toContain(MEASURED.cancerStratification.indiaCancerShareOfDalys);
    expect(PAGE_TEXT).toMatch(/not original to TargetForge/i);
    expect(PAGE_TEXT).toMatch(/Illuminating the Druggable Genome/i);
    // The link comes from the shared copy, so the href is checked there and
    // the rendered label is checked on the page.
    expect(NEGLECT_SCREEN_COPY.priorArtHref).toContain("pharos.nih.gov");
    expect(PAGE_TEXT).toContain(NEGLECT_SCREEN_COPY.priorArtLinkLabel);
    expect(page).toMatch(/NEGLECT_SCREEN_COPY\.priorArtHref/);
    // And the prominent pointer to the authoritative source.
    expect(PAGE_TEXT).toMatch(/authoritative source for every number/i);
    expect(page).toMatch(/methodology-validation-callout/);
  });

  test("the stale 'hypothesis generation' and in-progress benchmark are gone", () => {
    expect(PAGE_TEXT).not.toMatch(/hypothesis generation/i);
    expect(PAGE_TEXT).not.toMatch(/being rebuilt|in progress/i);
    // userFacingText, so the comment recording the removal does not count.
    expect(userFacingText(read("src/seoConfig.js"))).not.toMatch(/hypothesis generation/i);
  });
});

