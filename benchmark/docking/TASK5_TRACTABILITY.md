# Task 5 — Do Pre-2021 Tractability Features Beat Attention?

Generated: 2026-11-17T05:36:07.625Z

Cohort 2 (`drugCount_2021 == 0`), Open Targets 21.04 (2021-05-05) → 26.09 (2026-09). Fitted on 11 training diseases (12869 pairs, 399 positives); evaluated on 11 held-out diseases (11711 pairs, 258 positives, base rate 0.022).

## Headline finding

**No gene-property feature tested here predicts clinical progression beyond attention. What does predict it is prior effort — and the strongest signal is the number of compounds that already exist for the target.**

M3, which adds all the pre-2021 tractability features, does beat publication count: held-out ROC-AUC 0.807 against 0.667, a paired delta of +0.140 (95% CI +0.100 to +0.181 resampling pairs; +0.089 to +0.187 resampling diseases). Both intervals exclude zero, so the brief's promotion criterion is formally met.

It is met by the wrong features. Splitting the tractability set in two — features that record medicinal chemistry or clinical work already done on a target ("effort"), and properties of the gene that hold whether or not anyone has studied it ("biology") — M4 keeps only the gene properties: pLI, LOEUF, three DepMap essentiality measures and two GTEx selectivity measures. M4 scores 0.719, against M1's 0.721. The paired delta is −0.002 (95% CI −0.026 to +0.022), which includes zero: the five gene-property groups together add nothing over publication count and the eight Open Targets evidence scores. All of M3's advantage comes from the effort features (M3 vs M1 +0.086, 95% CI +0.052 to +0.119), and the single strongest predictor in the whole study is `tract_sm_high_quality_compounds` at solo held-out ROC-AUC 0.772 — higher than any model in Task 3 or Task 4. The best gene property is `pli` at 0.621.

So the answer to "does biology predict progression beyond attention" is still no. Attention simply turns out to be better measured in compounds than in papers. A target with a hundred high-quality compounds and no drug is one the field has already chosen; predicting that it enters the clinic is not target discovery.

**No production score is promoted.** A score dominated by existing compound count would rank highest precisely the targets a user could have found without it, and would rank an under-studied target last by construction. That is the Goodhart failure this benchmark exists to catch, and it is why the criterion being met is not sufficient.

## Table 1 — Feature vintage

Every source had to be shown to predate May 2021 before it could be used.

| Source | Release | Release date | Pre-cutoff | Evidence |
|---|---|---|:---:|---|
| Open Targets Platform 21.04 target ETL | `21.04` | 2021-05-05 | yes | The 21.04 release is the historical snapshot this retrospective is built on; its date is the release date itself. |
| gnomAD v2.1.1 loss-of-function constraint metrics by gene | `v2.1.1` | 2019-03-01 | yes | gnomAD 2.1.1 was released in March 2019, two years before the cutoff. |
| DepMap Public 21Q2 CRISPR gene effect (Chronos-corrected CERES) | `21Q2` | 2021-05-05 | yes | figshare article 14541774 'DepMap 21Q2 Public' carries published_date 2021-05-05T20:26:49Z, which is within May 2021 and is the latest release the brief permits. |
| GTEx v8 median gene TPM by tissue | `v8` | 2017-06-05 | yes | The GTEx v8 analysis freeze date 2017-06-05 is carried in the filename. |

No feature was skipped for an unestablished vintage.

## Table 2 — Join rates

Joined on Ensembl gene ID, except DepMap which joins on approved symbol. 24580 of 24580 cohort rows (100.0%) have a record in the 21.04 target ETL at all. A feature joining under 70% of targets is reported but excluded from the fitted model.

| Feature | Vintage | Joined | Join rate | Constant? | In model | Why excluded |
|---|---|---:|---:|:---:|:---:|---|
| `tract_sm_min_bucket` | ot_21_04 | 9972 | 40.6% | no | **no** | join rate 40.6% is below the 70% gate |
| `tract_ab_min_bucket` | ot_21_04 | 13415 | 54.6% | no | **no** | join rate 54.6% is below the 70% gate |
| `tract_sm_clinical_precedence` | ot_21_04 | 17882 | 72.8% | no | yes | — |
| `tract_ab_clinical_precedence` | ot_21_04 | 17882 | 72.8% | no | yes | — |
| `tract_sm_predicted_tractable` | ot_21_04 | 17882 | 72.8% | no | yes | — |
| `tract_sm_high_quality_compounds` | ot_21_04 | 17882 | 72.8% | no | yes | — |
| `tract_sm_genome_member` | ot_21_04 | 17882 | 72.8% | no | yes | — |
| `pli` | gnomad_v2_1_1 | 24321 | 99.0% | no | yes | — |
| `loeuf` | gnomad_v2_1_1 | 24321 | 99.0% | no | yes | — |
| `depmap_mean_gene_effect` | depmap_21q2 | 23913 | 97.3% | no | yes | — |
| `depmap_frac_dependent_lines` | depmap_21q2 | 23913 | 97.3% | no | yes | — |
| `depmap_common_essential` | depmap_21q2 | 23913 | 97.3% | no | yes | — |
| `gtex_tau` | gtex_v8 | 24517 | 99.7% | no | yes | — |
| `gtex_n_tissues_above_1tpm` | gtex_v8 | 24563 | 99.9% | no | yes | — |
| `protein_class_l1 (8 indicators)` | ot_21_04 | 7967 | 32.4% | no | **no** | join rate 32.4% is below the 70% gate |

## Table 3 — Nested models, held-out test diseases

| Model | Features | n features | ROC-AUC | PR-AUC | precision@25 | recall@25 |
|---|---|---:|---:|---:|---:|---:|
| `M0` | publication_count alone | 1 | **0.667** | **0.057** | 0.040 | 0.004 |
| `M1` | publication_count + 8 biology features | 9 | **0.721** | **0.069** | 0.240 | 0.023 |
| `M3` | publication_count + 8 biology features + tractability features | 21 | **0.807** | **0.146** | 0.440 | 0.043 |
| `M4` | publication_count + 8 biology features + gene-property features only (no effort proxies) | 16 | **0.719** | **0.073** | 0.200 | 0.019 |

Training-set figures (fitting diagnostics, not evidence):

| Model | ROC-AUC | PR-AUC |
|---|---:|---:|
| `M0` | 0.684 | 0.074 |
| `M1` | 0.722 | 0.074 |
| `M3` | 0.830 | 0.214 |
| `M4` | 0.692 | 0.072 |

## Table 4 — Paired deltas, resampling pairs

| Comparison | Metric | Delta | 95% CI on the delta | CI includes zero? |
|---|---|---:|---:|:---:|
| M3 vs M0 | ROC-AUC | **+0.140** | +0.100 to +0.181 | no |
| M3 vs M0 | PR-AUC | **+0.089** | +0.057 to +0.126 | no |
| M3 vs M1 | ROC-AUC | **+0.086** | +0.052 to +0.119 | no |
| M3 vs M1 | PR-AUC | **+0.077** | +0.044 to +0.115 | no |
| M4 vs M0 | ROC-AUC | **+0.052** | +0.013 to +0.091 | no |
| M4 vs M0 | PR-AUC | **+0.016** | +0.003 to +0.031 | no |
| M4 vs M1 (gene properties only) | ROC-AUC | **−0.002** | −0.026 to +0.022 | **yes** |
| M4 vs M1 (gene properties only) | PR-AUC | **+0.004** | −0.004 to +0.012 | **yes** |
| M1 vs M0 | ROC-AUC | **+0.054** | +0.021 to +0.089 | no |
| M1 vs M0 | PR-AUC | **+0.012** | +0.001 to +0.025 | no |

## Table 5 — Same deltas, resampling whole diseases

The held-out rows cluster into 10 diseases and are not independent. This is the conservative reading and it governs the headline.

| Comparison | Metric | Median delta | 95% CI on the delta | CI includes zero? |
|---|---|---:|---:|:---:|
| M3 vs M0 | ROC-AUC | +0.138 | +0.089 to +0.187 | no |
| M3 vs M0 | PR-AUC | +0.088 | +0.066 to +0.115 | no |
| M3 vs M1 | ROC-AUC | +0.084 | +0.043 to +0.127 | no |
| M3 vs M1 | PR-AUC | +0.075 | +0.055 to +0.105 | no |
| M4 vs M0 | ROC-AUC | +0.052 | +0.006 to +0.106 | no |
| M4 vs M0 | PR-AUC | +0.016 | −0.002 to +0.034 | **yes** |

## Table 6 — Each feature alone, and which kind it is

`effort` features record medicinal chemistry or clinical work already done on the target; `biology` features are properties of the gene that hold whether or not anyone has studied it. Solo AUC is the held-out ROC-AUC of that one feature used as the whole ranker, with misses filled at zero. This table is the instrumentation that shows which kind carries the gain, and it is the reason the headline does not read as a win.

| Feature | Kind | Solo held-out ROC-AUC | In model |
|---|---|---:|:---:|
| `tract_sm_min_bucket` | effort | 0.677 | no |
| `tract_ab_min_bucket` | effort | 0.521 | no |
| `tract_sm_clinical_precedence` | effort | 0.511 | yes |
| `tract_ab_clinical_precedence` | effort | 0.532 | yes |
| `tract_sm_predicted_tractable` | effort | 0.671 | yes |
| `tract_sm_high_quality_compounds` | effort | 0.772 | yes |
| `tract_sm_genome_member` | effort | 0.676 | yes |
| `pli` | biology | 0.621 | yes |
| `loeuf` | biology | 0.409 | yes |
| `depmap_mean_gene_effect` | biology | 0.497 | yes |
| `depmap_frac_dependent_lines` | biology | 0.539 | yes |
| `depmap_common_essential` | biology | 0.480 | yes |
| `gtex_tau` | biology | 0.513 | yes |
| `gtex_n_tissues_above_1tpm` | biology | 0.519 | yes |

## Promotion decision

- Criterion: M3 must beat M0 with a paired CI excluding zero
- Beats M0, pair-level bootstrap: **yes**
- Beats M0, disease-clustered bootstrap: **yes**
- Criterion met: **yes**
- Promoted to production: **no**

No production score was changed by this run. The criterion (M3 beats M0 with a CI excluding zero) is met, but it is met by features recording prior medicinal chemistry effort, not by gene properties: M4, which keeps only the gene properties, does not improve on M1 (CI includes zero). Promoting a score dominated by existing compound count would rank highest the targets the field has already chosen, which is the Goodhart failure this benchmark exists to catch.

## Leakage controls

- Every feature comes from a source dated before the May 2021 cutoff; each source's release date and the evidence for it are in `feature_source_vintage`.
- Features whose vintage could not be established were not built; see `features_skipped_at_build`.
- Outcomes come only from 26.09.
- All three models are fitted on the 11 training diseases; the 11 held-out diseases are used once, for evaluation.
- Fill values for failed joins are training-set medians, so no held-out value informs any fill.
- Features that are constant on the cohort are excluded and reported, so a model's feature count is not inflated by features that cannot contribute.

## Reproducing

```
node benchmark/docking/scripts/build_target_features.mjs
node benchmark/docking/scripts/tractability_models.mjs
```
