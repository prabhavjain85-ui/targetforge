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
  task8Json: "benchmark/docking/results/task8_tractability.json",
  task7Json: "benchmark/docking/results/task7_cancer_stratification.json",
  cancerLabels: "benchmark/docking/data/disease_cancer_labels.json",
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
    id: "attention-control",
    title: "Do the biology scores beat counting papers?",
    source: VALIDATION_SOURCES.task4Json,
    body:
      "Because the fitted model is mostly a publication-count proxy, the question " +
      "worth testing is whether Open Targets evidence adds anything once attention " +
      "is controlled for. Three nested models on the same cohort, fitted on the 11 " +
      "training diseases and evaluated on the 11 held out.\n" +
      "Publication count alone: ROC-AUC 0.667 (PR-AUC 0.057).\n" +
      "Publication count + the 8 biology features: ROC-AUC 0.721 (PR-AUC 0.069).\n" +
      "The 8 biology features alone: ROC-AUC 0.683 (PR-AUC 0.049).\n" +
      "Paired difference, biology added to publication count: ROC-AUC +0.054 (95% CI " +
      "+0.021 to +0.089), PR-AUC +0.012 (95% CI +0.001 to +0.025). Both intervals " +
      "exclude zero, so the evidence scores do add ranking signal beyond attention.\n" +
      "That result is weaker than it looks. The held-out rows cluster into 10 " +
      "diseases rather than being independent, and resampling whole diseases widens " +
      "the ROC-AUC interval to +0.003 to +0.112 — still excluding zero, but barely — " +
      "while the PR-AUC interval becomes −0.004 to +0.026, which includes zero. The " +
      "gain in ranking holds; the gain in precision among the rare positives does " +
      "not. The biology features alone do not beat publication count under disease " +
      "resampling, so they are an addition to attention, not a replacement.\n" +
      "Only the literature feature is substantially explained by publication count " +
      "(R² 0.340). The next largest is RNA expression at 0.070 and the rest are " +
      "lower, so residualising each feature against attention changes little: " +
      "somatic mutation in fact ranks better residualised (0.709) than raw (0.564).\n" +
      "Scope limit, measured rather than assumed: the panel is 15 cancers and 7 " +
      "non-cancers, and 9 of the 11 held-out diseases are cancers. Read every figure " +
      "in this section as an oncology result — see the next section for why.",
  },
  {
    id: "cancer-stratification",
    title: "Is that an oncology result?",
    source: VALIDATION_SOURCES.task7Json,
    body:
      "The signal above is carried by somatic mutation evidence, which in Open " +
      "Targets comes largely from cancer genomics. So the same comparison was run " +
      "separately on the cancer and non-cancer held-out diseases, with the " +
      "cancer/non-cancer labelling committed as its own file so it can be disputed.\n" +
      "On the 9 held-out cancers (10,308 pairs, 236 positives) the biology features " +
      "add +0.057 over publication count (95% CI +0.019 to +0.096 resampling pairs, " +
      "+0.002 to +0.122 resampling diseases) — almost exactly the +0.054 measured " +
      "across everything. Since 10,308 of the 11,711 held-out pairs are cancer, the " +
      "pooled figure essentially is the cancer figure.\n" +
      "Whether it holds outside cancer is underpowered to tell, and that is the " +
      "honest answer rather than a hedge. Only 2 held-out diseases are non-cancer and " +
      "one of them contributes no rows at all, leaving a single disease: 1,403 pairs " +
      "with 22 positives. No disease-level interval is reported for it, because " +
      "resampling one disease would produce something that looks like a measurement " +
      "and is not one.\n" +
      "On that one disease the biology features do not help: −0.008 (95% CI −0.047 to " +
      "+0.033, including zero), and publication count alone scores higher there, " +
      "0.730 against 0.722. Residualised somatic mutation reads 0.708 on the cancers " +
      "and 0.730 on the single non-cancer disease, which points towards the signal " +
      "generalising — but one disease and 22 positives cannot establish that in either " +
      "direction, so it is quoted here as a count, not as a comparison.\n" +
      "Settling this needs more non-cancer diseases in the panel, not more analysis of " +
      "these 22 positives.",
  },
  {
    id: "tractability-features",
    title: "Does anything else beat counting papers?",
    source: VALIDATION_SOURCES.task8Json,
    body:
      "The same cohort and split, with five more pre-2021 feature groups added: " +
      "Open Targets 21.04 tractability, ChEMBL protein class, gnomAD v2.1.1 pLI " +
      "and LOEUF, DepMap 21Q2 CRISPR essentiality, and GTEx v8 expression " +
      "selectivity. Every source is dated before May 2021; two features were " +
      "dropped for joining under 70% of targets.\n" +
      "Publication count alone: ROC-AUC 0.667. Plus the 8 biology features: 0.721. " +
      "Plus everything: 0.807 (PR-AUC 0.146, precision@25 0.440), a paired gain of " +
      "+0.140 over publication count (95% CI +0.100 to +0.181).\n" +
      "That gain is not biology. Separating features that record work already done " +
      "on a target from properties of the gene itself, and keeping only the latter — " +
      "pLI, LOEUF, three DepMap measures, two GTEx measures — gives ROC-AUC 0.719 " +
      "against 0.721 without them: a paired difference of −0.002 (95% CI −0.026 to " +
      "+0.022), which includes zero. The five gene-property groups add nothing.\n" +
      "The whole gain comes from one feature: the number of high-quality compounds " +
      "that already existed for the target in 2021, which alone scores 0.772 — " +
      "better than any model in this report. The best gene property is pLI at 0.621; " +
      "DepMap essentiality and GTEx selectivity sit at chance.\n" +
      "Compound count is not simply publication count again: regressed against " +
      "attention its R² is 0.002, and residualised against attention it still " +
      "scores 0.699. It is an independent predictor. What it is not is biology — it " +
      "records medicinal chemistry already done. A target with a hundred compounds " +
      "and no drug is one the field has already picked, so no score was promoted on " +
      "this result: it would rank highest the targets you could have found without " +
      "it, and rank an under-studied target last by construction.\n" +
      "On the 9 held-out cancers the tractability features do add over the biology " +
      "model (+0.083, 95% CI +0.048 to +0.117). On the single held-out non-cancer " +
      "disease no interval is reported, for the reason given in the previous section.",
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
      "docking engine failed redocking on all targets tested and remains disabled.\n" +
      "Whether docking ranks compounds better than a fingerprint comparison has not " +
      "been measured. The three enrichment targets above re-fetch their own compounds " +
      "rather than using the scaffold-split benchmark, so they are not comparable with " +
      "the compound triage figures and include nothing to compare against. Until that " +
      "run exists, compounds are ranked by Tanimoto to the co-crystallised ligand, " +
      "which is the best ranker actually measured on that benchmark.",
  },
];
