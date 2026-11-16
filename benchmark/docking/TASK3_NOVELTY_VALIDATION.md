# Task 3 — Retrospective Validation of the TargetForge Novelty Score (Open Targets 21.04 → 26.09)

- **Generated at:** `2026-11-16T14:00:57.009Z`
- **Historical snapshot (≥5 years ago):** Open Targets Platform **`21.04 (2021-05-05)`** (EBI FTP `21.04/output/etl/json/`)
- **Ground-truth release:** Open Targets Platform **`26.09 (2026-09)`** (**5.4 years** elapsed)
- **Disease panel:** **22 diseases** split strictly by disease into **11 training diseases** and **11 held-out test diseases**

## Executive Findings

> **Primary Finding:** On held-out diseases (Open Targets 21.04 -> 26.09, 5.4-year prospective window), the hand-set Novelty Score fails to beat simple baselines: for predicting which disease-undrugged targets in 2021 acquire a clinical/approved drug for that disease by 2026 (Cohort 1, n=13601 held-out pairs, 300 positives), the original 1/(1+drugCount) formula (novelty_v1) scores BELOW random chance (ROC-AUC 0.361, PR-AUC 0.018) and current novelty_v2 scores ROC-AUC 0.510 (PR-AUC 0.025), because dividing by drugCount penalizes existing clinical tractability — whereas drugCount_2021 alone achieves ROC-AUC 0.872 (PR-AUC 0.177), publication_count alone achieves ROC-AUC 0.707, and a logistic model fit on training diseases achieves held-out ROC-AUC 0.887 (PR-AUC 0.169). Even when restricted strictly to globally undrugged targets in 2021 (drugCount_2021 == 0, Cohort 2: first-in-class progression, n=11711 held-out pairs, 258 positives), the hand-set biology weights (0.50 genetic + 0.12 genlit + ...) achieve held-out ROC-AUC 0.637 (PR-AUC 0.038), failing to beat publication_count alone (ROC-AUC 0.667, PR-AUC 0.057) or fitted simplex weights (held-out ROC-AUC 0.708, PR-AUC 0.052; genetic_association alone = 0.497 on Cohort 1 / 0.500 on Cohort 2).

### Why the Hand-Set Novelty Score Fails to Predict Clinical Progression (and How Two Mechanisms Cancel Out)

1. **Dividing by `1 + drugCount` (or `broadDrugDiscount(drugCount)`) inverts the strongest real-world predictor of new disease clinical entry:** In **Cohort 1** (targets associated with a disease in 2021 that had *no clinical drug for that disease* in 2021, tested on whether they entered clinical development for that disease by 2026: **300 positives / 13601 target-disease pairs** on held-out test diseases), `drugCount_2021` (drugs already targeting the gene in *other* diseases) is the single strongest positive predictor (**held-out ROC-AUC 0.872**, **PR-AUC 0.177** vs base rate **0.022**). Because `novelty_v1` divides by `1 + drugCount` and `novelty_v2` multiplies by `1 / (1 + ln(1 + drugCount)/4)`, both penalize tractable targets that get repurposed into the disease: `novelty_v1` collapses to **held-out ROC-AUC 0.361** (below random chance 0.500!) and `novelty_v2` scores **ROC-AUC 0.510** (**PR-AUC 0.025**), far below `drugCount` alone (**0.872**) and `publication_count` alone (**0.707**).
2. **Even when restricted strictly to globally undrugged targets (`drugCount_2021 == 0`, Cohort 2: First-in-Class Target Progression), the hand-set weights (`0.50 genetic + 0.12 genlit + ...`) do not significantly beat `publication_count` or fitted weights:** On held-out diseases among targets with zero drugs globally in 2021 (**258 first-in-class clinical acquisitions / 11711 pairs**), `novelty_v1`, `novelty_v2`, and `biology_signal_handset` are algebraically identical (since `drugCount_2021 = 0`) and achieve **held-out ROC-AUC 0.637** (95% CI **0.604–0.674**, **PR-AUC 0.038**), whereas `publication_count` alone achieves **ROC-AUC 0.667** (**PR-AUC 0.057**), `genetic_association` alone achieves **ROC-AUC 0.500** (**PR-AUC 0.022**), and the **fitted simplex weights** achieve **held-out ROC-AUC 0.708** (**PR-AUC 0.052**).
3. **Why `0.50 * genetic_association` underperforms on short-to-medium (5-year) clinical horizon:** In Open Targets `21.04`, many rare Mendelian / structural / pan-essential genes have high `genetic_association` but low small-molecule/antibody clinical translation over a 5-year window, whereas `overall` harmonic score, `affected_pathway`, `somatic_mutation`, and `literature` intensity reflect active translational biology ready to enter Phase I–III trials within 5 years.

## Table 1 — Cohort 1: Disease-Undrugged Targets in 2021 Acquiring a Clinical/Approved Drug for That Disease by 2026
*(Held-out test diseases: n = 13601 target–disease pairs, 300 positives, base rate = 0.0221; Training diseases: n = 15383, 252 positives, base rate = 0.0164)*

| Predictor | Held-Out ROC-AUC (95% CI) | Held-Out PR-AUC (95% CI) | Held-Out Prec@25 / Rec@25 | Train ROC-AUC (95% CI) | Train PR-AUC |
|---|---:|---:|---:|---:|---:|
| Novelty Score v1 (`biologySignal / (1 + drugCount)`) | **0.361** (0.326–0.397) | **0.018** (0.015–0.024) | 0.040 / 0.003 | 0.357 (0.311–0.406) | 0.015 |
| Novelty Score v2 (`noveltyScore.js`: `biologySignal * broadDrugDiscount`) | **0.510** (0.478–0.546) | **0.025** (0.020–0.036) | 0.080 / 0.007 | 0.551 (0.511–0.593) | 0.026 |
| Hand-set `biologySignal` only (`0.50 genetic + 0.12 genlit + ...`, no drug penalty) | **0.555** (0.524–0.588) | **0.030** (0.024–0.044) | 0.160 / 0.013 | 0.616 (0.577–0.654) | 0.035 |
| Baseline: `genetic_association` alone | **0.497** (0.489–0.506) | **0.023** (0.020–0.030) | 0.120 / 0.010 | 0.523 (0.508–0.538) | 0.024 |
| Baseline: `drugCount` alone (existing drugs in other indications) | **0.872** (0.848–0.894) | **0.177** (0.149–0.216) | 0.240 / 0.020 | 0.908 (0.890–0.924) | 0.166 |
| Baseline: `1 / (1 + drugCount)` alone (inverse drugCount) | **0.129** (0.106–0.152) | **0.012** (0.011–0.013) | 0.040 / 0.003 | 0.092 (0.076–0.110) | 0.009 |
| Baseline: `publication_count` alone (`literature` evidence count) | **0.707** (0.673–0.738) | **0.070** (0.055–0.090) | 0.160 / 0.013 | 0.611 (0.573–0.650) | 0.027 |
| Fitted Simplex Biology Weights (trained on 11 training diseases) | **0.577** (0.548–0.606) | **0.031** (0.023–0.044) | 0.120 / 0.010 | 0.648 (0.612–0.681) | 0.050 |
| Fitted Full Logistic Model (biology + `log1p(drugCount)` + `log1p(pubCount)`) | **0.887** (0.869–0.907) | **0.169** (0.144–0.204) | 0.160 / 0.013 | 0.924 (0.909–0.938) | 0.199 |

## Table 2 — Cohort 2: Globally Undrugged Targets in 2021 (`drugCount_2021 == 0`) Acquiring a First-in-Class Clinical/Approved Drug by 2026
*(Held-out test diseases: n = 11711 target–disease pairs, 258 positives, base rate = 0.0220; Training diseases: n = 12869, 399 positives, base rate = 0.0310)*

| Predictor | Held-Out ROC-AUC (95% CI) | Held-Out PR-AUC (95% CI) | Held-Out Prec@25 / Rec@25 | Train ROC-AUC (95% CI) | Train PR-AUC |
|---|---:|---:|---:|---:|---:|
| Novelty Score v1 (`biologySignal / (1 + drugCount)`) | **0.637** (0.605–0.674) | **0.038** (0.031–0.049) | 0.040 / 0.004 | 0.652 (0.628–0.678) | 0.047 |
| Novelty Score v2 (`noveltyScore.js`: `biologySignal * broadDrugDiscount`) | **0.637** (0.604–0.674) | **0.038** (0.030–0.048) | 0.040 / 0.004 | 0.642 (0.617–0.668) | 0.047 |
| Hand-set `biologySignal` only (`0.50 genetic + 0.12 genlit + ...`, no drug penalty) | **0.637** (0.604–0.674) | **0.038** (0.031–0.049) | 0.040 / 0.004 | 0.652 (0.628–0.678) | 0.047 |
| Baseline: `genetic_association` alone | **0.500** (0.490–0.511) | **0.022** (0.019–0.027) | 0.040 / 0.004 | 0.499 (0.493–0.507) | 0.031 |
| Baseline: `drugCount` alone (existing drugs in other indications) | **0.500** (0.500–0.500) | **0.022** (0.020–0.025) | 0.040 / 0.004 | 0.500 (0.500–0.500) | 0.031 |
| Baseline: `1 / (1 + drugCount)` alone (inverse drugCount) | **0.500** (0.500–0.500) | **0.022** (0.020–0.025) | 0.040 / 0.004 | 0.500 (0.500–0.500) | 0.031 |
| Baseline: `publication_count` alone (`literature` evidence count) | **0.667** (0.629–0.706) | **0.057** (0.045–0.074) | 0.040 / 0.004 | 0.684 (0.655–0.712) | 0.074 |
| Fitted Simplex Biology Weights (trained on 11 training diseases) | **0.708** (0.678–0.739) | **0.052** (0.042–0.064) | 0.120 / 0.012 | 0.701 (0.677–0.730) | 0.065 |
| Fitted Full Logistic Model (biology + `log1p(drugCount)` + `log1p(pubCount)`) | **0.721** (0.689–0.756) | **0.069** (0.053–0.092) | 0.240 / 0.023 | 0.722 (0.701–0.747) | 0.074 |

## Table 3 — Hand-Set vs Fitted Weights Comparison

| Feature | Hand-Set `BIOLOGY_WEIGHTS` (`noveltyScore.js`) | Fitted Simplex Weights (Cohort 1: Disease Progression) | Fitted Simplex Weights (Cohort 2: First-in-Class `drugCount=0`) | Fitted Full Logistic Coefs (Cohort 1) | Fitted Full Logistic Coefs (Cohort 2) |
|---|---:|---:|---:|---:|---:|
| `genetic_association` | 0.500 | 0.495 | 0.018 | 0.358 | 0.006 |
| `genetic_literature` | 0.120 | 0.211 | 0.019 | -0.007 | -0.010 |
| `somatic_mutation` | 0.120 | 0.000 | 0.034 | -0.148 | 0.536 |
| `overall` | 0.100 | 0.000 | 0.000 | 1.005 | 0.361 |
| `literature` | 0.080 | 0.001 | 0.814 | 0.027 | 0.255 |
| `affected_pathway` | 0.050 | 0.236 | 0.000 | 0.986 | -0.292 |
| `animal_model` | 0.020 | 0.058 | 0.105 | 0.000 | 0.000 |
| `rna_expression` | 0.010 | 0.000 | 0.011 | -0.029 | -0.032 |
| `log1p_drug_count` | — (divisor penalty) | — | — | 4.455 | 0.000 |
| `log1p_pub_count` | — (divisor penalty) | — | — | 0.570 | 1.601 |

## Table 4 — Per-Disease Retrospective Breakdown (22 Diseases, 21.04 → 26.09)

| Disease (21.04 → 26.09) | Split | Undrugged 2021 | New Disease Drugs 2026 | `novelty_v1` AUC | `novelty_v2` AUC | `genetic` AUC | `drugCount` AUC | `pubCount` AUC | `fitted_logistic` AUC |
|---|:---:|---:|---:|---:|---:|---:|---:|---:|---:|
| oral cavity squamous cell carcinoma (`EFO_0000199` → `MONDO_0004958`) | TRAIN | 1599 | 7 | 0.461 | 0.697 | 0.500 | 0.987 | 0.697 | 0.987 |
| acute myeloid leukemia (`EFO_0000222` → `MONDO_0018874`) | TEST | 1521 | 37 | 0.428 | 0.536 | 0.420 | 0.876 | 0.730 | 0.902 |
| adenoid cystic carcinoma (`EFO_0000231` → `MONDO_0004971`) | TRAIN | 469 | 13 | 0.358 | 0.635 | 0.500 | 0.918 | 0.804 | 0.923 |
| amyotrophic lateral sclerosis (`EFO_0000253` → `MONDO_0004976`) | TEST | 1648 | 17 | 0.332 | 0.540 | 0.518 | 0.895 | 0.527 | 0.933 |
| astrocytoma (excluding glioblastoma) (`EFO_0000272` → `MONDO_0019781`) | TRAIN | 1659 | 36 | 0.211 | 0.460 | 0.499 | 0.918 | 0.683 | 0.912 |
| urinary bladder neoplasm (`EFO_0000294` → `MONDO_0004987`) | TEST | 998 | 29 | 0.273 | 0.601 | 0.500 | 0.868 | 0.677 | 0.911 |
| breast adenocarcinoma (`EFO_0000304` → `MONDO_0004988`) | TRAIN | 676 | 9 | 0.123 | 0.289 | 0.500 | 0.978 | 0.770 | 0.978 |
| bronchioloalveolar carcinoma (`EFO_0000308` → `EFO_1001941`) | TEST | 347 | 7 | 0.330 | 0.510 | 0.500 | 0.987 | 0.457 | 0.989 |
| Burkitt lymphoma (`EFO_0000309` → `MONDO_0007243`) | TRAIN | 1077 | 8 | 0.283 | 0.417 | 0.499 | 0.881 | 0.662 | 0.877 |
| carcinoma (`EFO_0000313` → `MONDO_0004993`) | TEST | 1746 | 77 | 0.323 | 0.561 | 0.500 | 0.906 | 0.713 | 0.911 |
| cardiomyopathy (`EFO_0000318` → `MONDO_0004994`) | TRAIN | 1749 | 60 | 0.239 | 0.496 | 0.551 | 0.934 | 0.636 | 0.943 |
| chronic obstructive pulmonary disease (`EFO_0000341` → `MONDO_0005002`) | TEST | 0 | 0 | n/a | n/a | n/a | n/a | n/a | n/a |
| congestive heart failure (`EFO_0000373` → `MONDO_0005009`) | TRAIN | 1549 | 33 | 0.299 | 0.540 | 0.531 | 0.833 | 0.642 | 0.880 |
| cutaneous melanoma (`EFO_0000389` → `MONDO_0005012`) | TEST | 1579 | 13 | 0.325 | 0.469 | 0.563 | 0.840 | 0.774 | 0.873 |
| diabetic kidney disease (`EFO_0000401` → `MONDO_0005016`) | TRAIN | 1666 | 17 | 0.221 | 0.403 | 0.498 | 0.859 | 0.643 | 0.902 |
| glioblastoma (`EFO_0000519` → `MONDO_0018177`) | TEST | 1480 | 19 | 0.476 | 0.599 | 0.497 | 0.876 | 0.707 | 0.898 |
| Infertility (`EFO_0000545` → `HP_0000789`) | TRAIN | 1736 | 4 | 0.016 | 0.144 | 0.500 | 0.960 | 0.513 | 0.954 |
| mesothelioma (`EFO_0000588` → `MONDO_0005065`) | TEST | 1268 | 32 | 0.249 | 0.470 | 0.514 | 0.864 | 0.647 | 0.911 |
| papillary renal cell carcinoma (`EFO_0000640` → `MONDO_0017884`) | TRAIN | 1607 | 14 | 0.556 | 0.674 | 0.499 | 0.938 | 0.663 | 0.946 |
| small cell lung carcinoma (`EFO_0000702` → `MONDO_0008433`) | TEST | 1545 | 41 | 0.430 | 0.537 | 0.510 | 0.853 | 0.702 | 0.870 |
| HIV infectious disease (`EFO_0000764` → `MONDO_0005109`) | TRAIN | 1596 | 51 | 0.625 | 0.686 | 0.497 | 0.896 | 0.342 | 0.951 |
| plasma cell myeloma (`EFO_0001378` → `MONDO_0009693`) | TEST | 1469 | 28 | 0.541 | 0.623 | 0.518 | 0.829 | 0.751 | 0.879 |
