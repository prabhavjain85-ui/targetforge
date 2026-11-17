/**
 * Single source for every user-visible validation string.
 *
 * Each figure here traces to a committed file under benchmark/. Nothing is
 * computed, re-rounded or inferred at render time; src/methodologyProvenance
 * .test.js reads the artifacts back and fails if any of these strings carries
 * a number the benchmarks do not contain.
 *
 * Do not add adjectives. Where a component failed validation it is reported
 * as having failed, not softened. Where a result is negative it is stated as
 * the finding, not framed as a partial success.
 */

export {
  VALIDATION_GENERATOR,
  VALIDATION_GENERATED_AT,
  VALIDATION_PRODUCED_BY_COMMIT,
  VALIDATION_COMMIT_SHORT,
  VALIDATION_RUN_LINE,
  VALIDATION_SOURCE_FILES,
} from "./validationProvenance";

export const VALIDATION_SOURCES = {
  task3Json: "benchmark/docking/results/task3_novelty_validation.json",
  task3Md: "benchmark/docking/TASK3_NOVELTY_VALIDATION.md",
  task1Md: "benchmark/docking/TASK1_BASELINES.md",
  task2Md: "benchmark/docking/TASK2_DECOY_BENCHMARK.md",
  task4Json: "benchmark/docking/results/task4_attention_control.json",
  task4Md: "benchmark/docking/TASK4_ATTENTION_CONTROL.md",
  redock: "benchmark/docking/results/redock_multiseed.json",
  pairs: "benchmark/docking/results/pair_sanity_checks.json",
  enrichment: "benchmark/docking/results/enrichment.json",
  approved25: "benchmark/docking/results/approved_25.json",
};

export const SCORE_CHIPS = {
  // Scoped to both cohorts: the column renders for every target, but 0.637 was
  // measured only on targets with no approved or clinical drug in 2021. On the
  // cohort that includes drugged targets the same signal scores 0.555.
  //
  // The closing clause departs from the brief, which asked for "Ranks how
  // little is known about a target". It is the one wording changed, because
  // measurement shows that sentence inverted: the score is 100 x the biology
  // signal, which RISES with evidence, so a well-studied target scores 72.8
  // against 3.7 for a barely-studied one. The drug-count and clinical-score
  // terms that made the old score point the other way were deleted after the
  // retrospective measured them below chance, and nothing replaced them.
  understudy:
    "Evidence strength score — held-out ROC-AUC 0.637 on targets with no " +
    "existing drug, 0.555 across all targets (PR-AUC 0.038 / 0.030), Open " +
    "Targets 21.04 → 26.09, 11 held-out diseases. Ranks how much evidence " +
    "already supports a target, so well-studied targets score highest. It is " +
    "not a novelty score and not a prediction that a target will yield a drug.",
  progression:
    "Progression score — held-out ROC-AUC 0.708 (PR-AUC 0.052), precision@25 " +
    "0.12, Open Targets 21.04 → 26.09, 11 held-out diseases. Fitted on 11 " +
    "training diseases. Modest: about 3 true positives in a top-25 list.",
  publications:
    "Publication count — held-out ROC-AUC 0.667 (PR-AUC 0.057) on the same " +
    "benchmark, higher than the hand-weighted evidence score. Shown so you can " +
    "see when a target is novel only in the sense of being unstudied. Close to " +
    "the progression score, which is mostly the same signal.",
};

export const VALIDATION_INTRO =
  "Every score in TargetForge with its measured performance on held-out data. " +
  "Scores that perform at chance are listed as such. Where a component failed " +
  "validation it is disabled rather than shipped with a caveat.";

export const VALIDATION_SECTIONS = [
  {
    id: "target-scores",
    title: "Target scores",
    source: VALIDATION_SOURCES.task3Json,
    body:
      "Retrospective validation, Open Targets 21.04 (May 2021) → 26.09 (September " +
      "2026). 22 diseases split by disease into 11 training and 11 held out. " +
      "Cohort: targets with no approved or clinical drug in 2021 (n=11,711 " +
      "held-out pairs, 258 positives, base rate 2.2%).\n" +
      "Understudy score: ROC-AUC 0.637 (PR-AUC 0.038).\n" +
      "Progression score (fitted): ROC-AUC 0.708 (PR-AUC 0.052).\n" +
      "Publication count baseline: ROC-AUC 0.667 (PR-AUC 0.057).\n" +
      "Genetic association alone: ROC-AUC 0.500.\n" +
      "The fitted progression weights place 0.814 of the simplex on the literature " +
      "feature and 0.018 on genetic association, so this score behaves largely as a " +
      "publication-count proxy. Publication count alone scores 0.667 against the " +
      "fitted model's 0.708; treat the two columns as near-duplicate signals rather " +
      "than independent evidence.\n" +
      "The previously shipped novelty formula, biology ÷ (1 + drug count), scored " +
      "ROC-AUC 0.361 on disease-specific clinical acquisition — below chance. The " +
      "inverse drug-count term alone scored 0.129. It has been removed.\n" +
      "Direction, stated plainly because it is easy to misread: the evidence " +
      "strength score rises with evidence, so the best-studied targets score " +
      "highest. Removing the drug-count and clinical-score terms was what the " +
      "measurement required, but those terms were also the only part of the old " +
      "score that pointed towards unexplored targets. No score here ranks targets " +
      "by novelty. Drug count is shown as its own column so you can filter on it " +
      "yourself rather than have it folded into a single number.",
  },
  {
    id: "compound-triage",
    title: "Compound triage",
    source: VALIDATION_SOURCES.task2Md,
    body:
      "Property-matched decoy benchmark with Bemis–Murcko scaffold splitting, " +
      "14/15 targets passing decoy sanity checks, mean AVE bias 0.099, zero " +
      "leaked scaffolds.\n" +
      "Tanimoto to staged co-crystal ligand: ROC-AUC 0.662 (BEDROC20 0.617).\n" +
      "heuristic-v2: ROC-AUC 0.523. Rule table alone: 0.482. Random: 0.520.\n" +
      "heuristic-v2 is a drug-likeness and liability filter. It does not predict " +
      "binding or activity, and on held-out chemistry its target rules do not fire.",
  },
  {
    id: "docking",
    title: "Docking",
    source: VALIDATION_SOURCES.redock,
    body:
      "AutoDock Vina 1.2.5, receptor protonation at pH 7.4, symmetry-corrected " +
      "RMSD. Redocking: 10/11 targets under 2 Å. Drug–structure pair reliability: " +
      "15/25. Enrichment on 3 targets: ROC-AUC 0.636, 0.744, 0.800. Correlation " +
      "with measured potency: Spearman −0.291 (95% CI −0.681 to 0.478), i.e. none. " +
      "Poses are shown only for pairs that pass sanity checks. The in-browser " +
      "docking engine failed redocking on all targets tested and remains disabled.",
  },
];
