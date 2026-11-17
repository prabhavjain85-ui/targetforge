# Task 7 — Is the Somatic-Mutation Finding a Cancer Effect?

Generated: 2026-11-17T16:28:21.952Z

Cohort 2, Open Targets 21.04 (2021-05-05) → 26.09 (2026-09). Panel: 15 cancers and 7 non-cancers (labelling committed at `benchmark/docking/data/disease_cancer_labels.json`). Models fitted on the full 11-disease training set, never per stratum.

## Headline finding

**Underpowered to tell.** The held-out non-cancer stratum is 2 diseases, of which only 1 contributes any cohort-2 pairs (chronic obstructive pulmonary disease contributes none): 1403 pairs with 22 positives, against 10308 pairs and 236 positives across 9 cancers. No disease-level confidence interval is reported for the non-cancer stratum, because resampling one cluster would produce an interval that looks like a measurement and is not one.

What the point estimates say, for what little that is worth at this sample size: somatic_mutation residualises to 0.708 on the cancers and 0.730 on the non-cancers, against 0.709 pooled. These are single numbers from one non-cancer disease and must not be quoted as a comparison — least of all as evidence that the signal generalises, which is the direction the non-cancer number happens to point.

**What IS established is the scope of the Task 4 result.** The cancer stratum reproduces it almost exactly: M1 vs M0 is +0.057 on the 9 held-out cancers (95% CI +0.019 to +0.096 resampling pairs, +0.002 to +0.122 resampling diseases), against +0.054 pooled. 10308 of the 11711 held-out pairs and 236 of the 258 positives are cancer, so the pooled Task 4 figure essentially IS the cancer figure. On the one held-out non-cancer disease the biology features do not help at all (−0.008, 95% CI −0.047 to +0.033, including zero, and publication count alone scores higher there: 0.730 against M1's 0.722). One disease cannot carry that conclusion either, but it is the only non-cancer evidence there is and it does not support generalisation.

So: **every figure in Task 4 should be read as an oncology result**, and the validation page has been changed to say so. Deciding whether the biology features help outside cancer needs more non-cancer diseases in the panel, not more analysis of these 22 positives.

## Table 1 — Held-out stratum sizes

Counts first, because they decide what can be said at all.

| Stratum | Diseases in split | With cohort-2 data | Pairs | Positives | Base rate |
|---|---:|---:|---:|---:|---:|
| all | 11 | 10 | 11711 | 258 | 0.022 |
| cancer | 9 | 9 | 10308 | 236 | 0.023 |
| non_cancer | 2 | 1 | 1403 | 22 | 0.016 |

Contributing no cohort-2 pairs (non_cancer): chronic obstructive pulmonary disease.

### Held-out diseases, individually

| Disease | Stratum | Pairs | Positives |
|---|---|---:|---:|
| acute myeloid leukemia | cancer | 1360 | 20 |
| amyotrophic lateral sclerosis | non_cancer | 1403 | 22 |
| urinary bladder neoplasm | cancer | 820 | 30 |
| bronchioloalveolar carcinoma | cancer | 272 | 13 |
| carcinoma | cancer | 1503 | 19 |
| chronic obstructive pulmonary disease | non_cancer | 0 | 0 |
| cutaneous melanoma | cancer | 1322 | 34 |
| glioblastoma | cancer | 1335 | 17 |
| mesothelioma | cancer | 1039 | 48 |
| small cell lung carcinoma | cancer | 1337 | 32 |
| plasma cell myeloma | cancer | 1320 | 23 |

## Table 2 — Nested models per stratum

| Stratum | Model | ROC-AUC | PR-AUC | precision@25 | recall@25 |
|---|---|---:|---:|---:|---:|
| all | `M0` | 0.667 | 0.057 | 0.040 | 0.004 |
| all | `M1` | 0.721 | 0.069 | 0.240 | 0.023 |
| all | `M2` | 0.683 | 0.049 | 0.080 | 0.008 |
| cancer | `M0` | 0.665 | 0.060 | 0.080 | 0.009 |
| cancer | `M1` | 0.722 | 0.073 | 0.240 | 0.025 |
| cancer | `M2` | 0.684 | 0.051 | 0.080 | 0.009 |
| non_cancer | `M0` | 0.730 | 0.055 | 0.000 | 0.000 |
| non_cancer | `M1` | 0.722 | 0.052 | 0.000 | 0.000 |
| non_cancer | `M2` | 0.675 | 0.030 | 0.000 | 0.000 |

## Table 3 — Paired deltas per stratum

| Stratum | Comparison | Metric | Delta | 95% CI (pairs) | 95% CI (diseases) |
|---|---|---|---:|---:|---:|
| all | M1 vs M0 | ROC-AUC | +0.054 | +0.021 to +0.089 | +0.003 to +0.112 |
| all | M1 vs M0 | PR-AUC | +0.012 | +0.001 to +0.025 | −0.004 to +0.026 (incl. 0) |
| all | M2 vs M0 | ROC-AUC | +0.016 | −0.026 to +0.061 (incl. 0) | −0.052 to +0.076 (incl. 0) |
| all | M2 vs M0 | PR-AUC | −0.008 | −0.025 to +0.008 (incl. 0) | −0.032 to +0.011 (incl. 0) |
| cancer | M1 vs M0 | ROC-AUC | +0.057 | +0.019 to +0.096 | +0.002 to +0.122 |
| cancer | M1 vs M0 | PR-AUC | +0.013 | +0.001 to +0.028 | −0.004 to +0.031 (incl. 0) |
| cancer | M2 vs M0 | ROC-AUC | +0.018 | −0.033 to +0.069 (incl. 0) | −0.050 to +0.085 (incl. 0) |
| cancer | M2 vs M0 | PR-AUC | −0.009 | −0.029 to +0.009 (incl. 0) | −0.034 to +0.013 (incl. 0) |
| non_cancer | M1 vs M0 | ROC-AUC | −0.008 | −0.047 to +0.033 (incl. 0) | **withheld** |
| non_cancer | M1 vs M0 | PR-AUC | −0.003 | −0.010 to +0.001 (incl. 0) | **withheld** |
| non_cancer | M2 vs M0 | ROC-AUC | −0.054 | −0.149 to +0.056 (incl. 0) | **withheld** |
| non_cancer | M2 vs M0 | PR-AUC | −0.025 | −0.059 to −0.004 | **withheld** |

Disease-level CI withheld for `non_cancer`: only 1 held-out disease(s) with data in this stratum; a disease-level bootstrap over fewer than 4 clusters would produce an interval that looks like a measurement and is not one.

## Table 4 — Residualised features per stratum

Each biology feature regressed on `log1p(publication_count)`, regression fitted on the full training set, held-out AUC of the residual reported per stratum. The question this table exists to answer is whether `somatic_mutation`'s residualised 0.709 from Task 4 survives outside oncology.

| Feature | R² vs attention | Residual AUC (all) | Residual AUC (cancer) | Residual AUC (non-cancer) |
|---|---:|---:|---:|---:|
| `genetic_association` | 0.009 | 0.342 | 0.347 | 0.256 |
| `genetic_literature` | 0.002 | 0.340 | 0.342 | 0.269 |
| `somatic_mutation` | 0.023 | 0.709 | 0.708 | 0.730 |
| `overall` | 0.038 | 0.659 | 0.653 | 0.727 |
| `literature` | 0.340 | 0.593 | 0.602 | 0.522 |
| `affected_pathway` | 0.031 | 0.609 | 0.599 | 0.730 |
| `animal_model` | 0.000 | 0.504 | 0.503 | 0.514 |
| `rna_expression` | 0.070 | 0.621 | 0.619 | 0.680 |

The non-cancer column comes from 1 disease(s) and 22 positives. It is a point estimate with no interval, and it is reported for completeness, not as a comparison.

## Leakage controls

- Predictors come only from the Open Targets 21.04 snapshot; outcomes only from 26.09.
- The cancer/non-cancer labelling uses only the disease name, which is fixed in the 21.04 snapshot, so it introduces no post-2021 information.
- All three models and every residualisation regression are fitted on the full 11-disease training set. No stratum is fitted on its own held-out data.
- The split is by disease, so a target appearing in two diseases cannot straddle train and test.
- No disease-level interval is computed for a stratum with fewer than 4 held-out diseases.

## Reproducing

```
node benchmark/docking/scripts/cancer_stratification.mjs
```
