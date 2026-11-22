# Task 10 — Does the Repurposing Score Work?

Generated: 2026-11-22T14:38:22.791Z

cohort 1 — targets associated with disease D in 21.04 with no clinical drug for D; outcome is acquiring one by 26.09. Open Targets 21.04 (2021-05-05) → 26.09 (2026-09), fitted on 11 training diseases (15383 pairs, 252 positives), evaluated on 11 held out (13601 pairs, 300 positives, base rate 0.022).

## Headline finding

**Drug count is the signal, and the shipped score does not use it.** On the held-out diseases of cohort 1 (13601 target-disease pairs, 300 positives), drug count alone reaches held-out ROC-AUC 0.872 (PR-AUC 0.177, precision@25 0.240), while the shipped `repurposingSignal` reaches 0.787 (PR-AUC 0.084, precision@25 0.320).

Drug count against the shipped score: +0.084 ROC-AUC (95% CI +0.066 to +0.102 resampling pairs, +0.014 to +0.151 resampling diseases), excluding zero under both. A single feature the shipped score caps at a 0.15 bonus beats the whole hand-weighted formula.

**It is not merely an attention effect.** Publication count alone reaches 0.707; drug count beats it by +0.164 (95% CI +0.125 to +0.203 pairs, +0.118 to +0.228 diseases), excluding zero under both. This was the load-bearing check: a well-drugged target attracts more trials, so drug count could have been popularity in disguise, as publication count largely was in Task 4. It is not.

Adding the eight biology features to drug count does not help: +0.016 (95% CI +0.004 to +0.028 pairs, −0.000 to +0.035 diseases), an interval that includes zero under at least one scheme. The same null result Task 8 found for the gene-property features holds here.

**The one metric the shipped score wins, and why it does not change the answer.** The shipped score shows precision@25 0.320 against 0.240 for the recommended model, which looks like it finds more at the very top of the list. It is computed from 25 rows, so that gap is two target-disease pairs. A paired bootstrap on precision@25 puts the difference at −0.080 with a 95% CI of −0.320 to +0.160 — an interval several times wider than the gap and comfortably including zero. There is no evidence the shipped score is better at the top of the list, and strong evidence it is worse across the whole list.

**What this does not license.** Drug count ranks targets by how often the field has already drugged them elsewhere, which is a statement about where effort has gone, not about biology. It cannot say a repurposing hypothesis is correct, only that targets like it have historically entered the clinic for new indications more often. Cohort 1 is also the same panel Task 7 stratified — 9 held-out cancers against 1 non-cancer — so the oncology scope limit applies here exactly as it does to the neglect screen.

## Table 1 — Held-out performance

| Model | What it is | ROC-AUC | PR-AUC | precision@25 | recall@25 |
|---|---|---:|---:|---:|---:|
| `R0` | publication count alone | **0.707** | 0.070 | 0.160 | 0.013 |
| `R1` | drug count alone | **0.872** | 0.177 | 0.240 | 0.020 |
| `R2` | drug count + publication count | **0.910** | 0.195 | 0.240 | 0.020 |
| `R3` | drug count + publication count + 8 biology features | **0.887** | 0.169 | 0.160 | 0.013 |
| `RS` | shipped repurposingSignal (not fitted) | **0.787** | 0.084 | 0.320 | 0.027 |

The shipped score gives drug count bonus capped at 0.15, via min(0.15, log1p(drugCount) * 0.035). Tractability joined 75.9% of held-out targets; where absent, no boost is applied, as in production.

## Table 2 — Paired deltas

| Comparison | Metric | Delta | 95% CI (pairs) | 95% CI (diseases) |
|---|---|---:|---:|---:|
| drug count vs publication count | ROC-AUC | **+0.164** | +0.125 to +0.203 | +0.118 to +0.228 |
| drug count vs publication count | PR-AUC | **+0.106** | +0.073 to +0.146 | +0.057 to +0.171 |
| drug count vs shipped score | ROC-AUC | **+0.084** | +0.066 to +0.102 | +0.014 to +0.151 |
| drug count vs shipped score | PR-AUC | **+0.092** | +0.062 to +0.126 | +0.024 to +0.147 |
| + biology vs drug count | ROC-AUC | **+0.016** | +0.004 to +0.028 | −0.000 to +0.035 (incl. 0) |
| + biology vs drug count | PR-AUC | **−0.007** | −0.017 to +0.000 (incl. 0) | −0.024 to +0.025 (incl. 0) |
| + biology vs shipped score | ROC-AUC | **+0.100** | +0.090 to +0.111 | +0.043 to +0.154 |
| + biology vs shipped score | PR-AUC | **+0.085** | +0.060 to +0.112 | +0.025 to +0.142 |
| + publications vs drug count | ROC-AUC | **+0.039** | +0.025 to +0.053 | +0.021 to +0.060 |
| + publications vs drug count | PR-AUC | **+0.018** | +0.011 to +0.024 | +0.011 to +0.023 |

## Table 3 — Per stratum

Cohort 1 is the same 15-cancer / 7-non-cancer panel Task 7 stratified, so the oncology scope limit applies here too.

| Stratum | Diseases | Pairs | Positives | R0 | R1 | RS | drug count vs shipped (pairs) |
|---|---:|---:|---:|---:|---:|---:|---:|
| cancer | 9 | 11953 | 283 | 0.722 | 0.871 | 0.772 | +0.098 (+0.079 to +0.118) |
| non_cancer | 1 | 1648 | 17 | 0.527 | 0.895 | 0.911 | −0.015 (−0.068 to +0.019) incl. 0 |

No disease-level interval for `non_cancer`: only 1 held-out disease(s) with rows in this stratum.

## Table 4 — Fitted coefficients

| Feature | `R0` | `R1` | `R2` | `R3` |
|---|---:|---:|---:|---:|
| `log1p_drug_count` | — | 4.516 | 4.491 | 4.455 |
| `log1p_pub_count` | 0.950 | — | 0.443 | 0.570 |
| `genetic_association` | — | — | — | 0.358 |
| `genetic_literature` | — | — | — | -0.007 |
| `somatic_mutation` | — | — | — | -0.148 |
| `overall` | — | — | — | 1.005 |
| `literature` | — | — | — | 0.027 |
| `affected_pathway` | — | — | — | 0.986 |
| `animal_model` | — | — | — | 0.000 |
| `rna_expression` | — | — | — | -0.029 |

## Recommendation

- Drug count beats attention: **yes**
- Drug count beats the shipped score: **yes**
- Biology features add over drug count: **no**
- Model to ship: **`R2`** — drug count + publication count

## Leakage controls

- Predictors come only from the Open Targets 21.04 snapshot; outcomes only from 26.09.
- All four fitted models are fitted on the 11 training diseases; the 11 held-out diseases are scored once.
- The shipped score is not fitted at all, so it has no opportunity to learn the held-out data.
- The split is by disease, so a target appearing in two diseases cannot straddle train and test.
- Deltas are reported under both pair-level and disease-level resampling, with the disease-level interval governing the conclusions.

## Reproducing

```
node benchmark/docking/scripts/repurposing_validation.mjs
```
