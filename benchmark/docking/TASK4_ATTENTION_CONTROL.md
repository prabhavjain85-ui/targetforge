# Task 4 — Does Open Targets Biology Predict Progression Beyond Attention?

Generated: 2026-11-17T04:12:54.908Z

Cohort 2 (`drugCount_2021 == 0`), Open Targets 21.04 (2021-05-05) → 26.09 (2026-09). Fitted on 11 training diseases (12869 pairs, 399 positives); evaluated on 11 held-out diseases (11711 pairs, 258 positives, base rate 0.022).

## Headline finding

**The biology features carry ranking signal beyond attention.** Adding the eight biology features to publication count moves held-out ROC-AUC by +0.054 (95% CI +0.021 to +0.089) and PR-AUC by +0.012 (95% CI +0.001 to +0.025), resampling pairs. The ROC-AUC interval excludes zero under both resampling schemes: resampling whole diseases it is +0.003 to +0.112, with the lower bound close to zero. PR-AUC does not survive that stricter test: resampling diseases, its interval is −0.004 to +0.026, which includes zero. So the ranking improvement is established and the improvement in precision among the rare positives is not. Publication count alone reaches ROC-AUC 0.667; with the biology features, 0.721. The biology features ALONE (M2, ROC-AUC 0.683) do not beat publication count under disease resampling, so they are a useful addition to attention, not a replacement for it.

## Table 1 — Nested models, held-out test diseases

| Model | Features | ROC-AUC | PR-AUC | precision@25 | recall@25 |
|---|---|---:|---:|---:|---:|
| `M0` | publication_count alone | **0.667** | **0.057** | 0.040 | 0.004 |
| `M1` | publication_count + 8 biology features | **0.721** | **0.069** | 0.240 | 0.023 |
| `M2` | 8 biology features alone | **0.683** | **0.049** | 0.080 | 0.008 |

Training-set figures, for reference (fitting diagnostics, not evidence):

| Model | ROC-AUC | PR-AUC | precision@25 | recall@25 |
|---|---:|---:|---:|---:|
| `M0` | 0.684 | 0.074 | 0.040 | 0.003 |
| `M1` | 0.722 | 0.074 | 0.080 | 0.005 |
| `M2` | 0.684 | 0.056 | 0.080 | 0.005 |

## Table 2 — Paired delta, held-out test diseases

Both models are rescored on the same resampled rows and the delta taken per resample (2000 resamples, seed 42). This is the interval that answers whether one model beats the other; two overlapping marginal CIs do not.

| Comparison | Metric | Delta | 95% CI on the delta | CI includes zero? |
|---|---|---:|---:|:---:|
| M1 vs M0 | ROC-AUC | **+0.054** | +0.021 to +0.089 | no |
| M1 vs M0 | PR-AUC | **+0.012** | +0.001 to +0.025 | no |
| M2 vs M0 | ROC-AUC | **+0.016** | −0.026 to +0.061 | **yes** |
| M2 vs M0 | PR-AUC | **−0.008** | −0.025 to +0.008 | **yes** |

## Table 2b — Same delta, resampling whole diseases

The held-out rows are not independent: they cluster into 10 diseases, and rows within a disease share both the disease base rate and its literature volume. Resampling pairs understates that variance. Resampling whole diseases is the conservative reading; at this cluster count it is also coarse.

| Comparison | Metric | Median delta | 95% CI on the delta | CI includes zero? |
|---|---|---:|---:|:---:|
| M1 vs M0 | ROC-AUC | +0.052 | +0.003 to +0.112 | no |
| M1 vs M0 | PR-AUC | +0.012 | −0.004 to +0.026 | **yes** |
| M2 vs M0 | ROC-AUC | +0.015 | −0.052 to +0.076 | **yes** |
| M2 vs M0 | PR-AUC | −0.009 | −0.032 to +0.011 | **yes** |

## Table 3 — Residualised features

Each biology feature is regressed on `log1p(publication_count)` across the training diseases, and the held-out AUC of the residual is reported. A feature whose residual AUC collapses to chance was ranking by attention, not by biology.

| Feature | Variance explained by attention (R²) | Held-out ROC-AUC, raw | Held-out ROC-AUC, residualised |
|---|---:|---:|---:|
| `genetic_association` | 0.009 | 0.500 | **0.342** |
| `genetic_literature` | 0.002 | 0.504 | **0.340** |
| `somatic_mutation` | 0.023 | 0.564 | **0.709** |
| `overall` | 0.038 | 0.633 | **0.659** |
| `literature` | 0.340 | 0.657 | **0.593** |
| `affected_pathway` | 0.031 | 0.485 | **0.609** |
| `animal_model` | 0.000 | 0.504 | **0.504** |
| `rna_expression` | 0.070 | 0.481 | **0.621** |

## Table 4 — Fitted coefficients

| Feature | `M0` | `M1` | `M2` |
|---|---:|---:|---:|
| `log1p_pub_count` | 1.575 | 1.601 | — |
| `genetic_association` | — | 0.006 | 0.017 |
| `genetic_literature` | — | -0.010 | -0.009 |
| `somatic_mutation` | — | 0.536 | 0.490 |
| `overall` | — | 0.361 | 0.316 |
| `literature` | — | 0.255 | 0.296 |
| `affected_pathway` | — | -0.292 | -0.332 |
| `animal_model` | — | 0.000 | 0.000 |
| `rna_expression` | — | -0.032 | -0.037 |
| _(intercept)_ | -0.210 | -0.271 | -0.052 |

## Leakage controls

- Every predictor is read from the Open Targets 21.04 snapshot (2021-05-05). No quantity from any later release enters any model.
- Outcomes come only from 26.09.
- All three models and every residualisation regression are fitted on the 11 training diseases. The 11 held-out test diseases are used once, for evaluation.
- The split is by disease, not by target, so a target appearing in two diseases cannot straddle train and test.
- Bootstrap resamples pairs, and both models are rescored on the same resampled rows, so the delta CI is paired.

## Reproducing

```
node benchmark/docking/scripts/attention_control.mjs
```
