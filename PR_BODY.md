# PR body — the novelty-score split

> **Written 2026-11-17, describing the branch at `cc7cecc`.** The counts below
> (39 files, 6,491 insertions, 387 tests) were accurate then. The branch has
> since grown to 17 commits and 609 tests, and the later work — Task 7's
> oncology stratification, Task 8, `/neglect-screen`, the fitted repurposing
> model, the docking status and content sweeps — is not described here.
> `PR_BODY_ALL_COMMITS.md` covers the branch as it currently stands.
>
> Kept as-is because the science in it is unchanged: M4 vs M1 at −0.002, M3 at
> 0.807, and Part D still unrun.

## What this does

Replaces the anti-predictive novelty score with two separately-named, separately-scoped scores; puts every score's measured performance on a public `/validation` page where each figure traces to a committed file under `benchmark/`; and adds three new retrospective studies that test whether anything in the product predicts clinical progression beyond how much attention a target has already had.

The short version of the science: it does not. That is now documented rather than papered over.

39 files changed, 6,491 insertions. 387 tests pass (from 352 at the branch point); production build compiles.

## Commits

| Commit | What |
|---|---|
| `9406739` | Commit the missing Task 3 artifacts; split novelty into understudy + progression |
| `655f130` | Surface measured performance in the UI; stop describing components as validated |
| `ecbd7df` | Part A — scope the evidence score, derive provenance, delete the dead formula |
| `dab8654` | Part B — control for attention (M0/M1/M2, paired bootstrap CIs) |
| `a836f4b` | Part D — Vina vs Tanimoto harness, written but **not run** |
| `cc7cecc` | Part C — pre-2021 tractability features; criterion met, by the wrong features |

## Results

### Target scores, held-out (Open Targets 21.04 → 26.09, 11 training / 11 held-out diseases, 11,711 pairs, 258 positives)

| Model | ROC-AUC | PR-AUC | p@25 |
|---|---:|---:|---:|
| Publication count alone (`M0`) | 0.667 | 0.057 | 0.040 |
| + 8 Open Targets biology features (`M1`) | 0.721 | 0.069 | 0.240 |
| + all pre-2021 tractability features (`M3`) | 0.807 | 0.146 | 0.440 |
| + **gene properties only**, no effort proxies (`M4`) | 0.719 | 0.073 | 0.200 |

Paired deltas, both models rescored on the same resampled rows:

| Comparison | ROC-AUC delta | 95% CI | Excludes zero? |
|---|---:|---:|:---:|
| M1 vs M0 | +0.054 | +0.021 to +0.089 | yes |
| M3 vs M0 | +0.140 | +0.100 to +0.181 | yes |
| M3 vs M1 | +0.086 | +0.052 to +0.119 | yes |
| **M4 vs M1** | **−0.002** | **−0.026 to +0.022** | **no** |

### The finding

`M3` beats publication count, so the acceptance criterion is formally met. It is met entirely by features that record medicinal chemistry already done on a target, not by biology. Splitting the feature set into *effort* (compounds, clinical precedence, druggable-genome membership) and *biology* (constraint, essentiality, expression) and keeping only the latter gives `M4`, which does **not** improve on `M1`.

The single strongest predictor in the whole study is the number of high-quality compounds that already existed for a target in 2021 — solo held-out ROC-AUC **0.772**, higher than any fitted model here. Mean 101 compounds for targets that progressed, 11 for those that did not.

| Feature | Kind | Solo ROC-AUC |
|---|---|---:|
| `tract_sm_high_quality_compounds` | effort | 0.772 |
| `tract_sm_genome_member` | effort | 0.676 |
| `tract_sm_predicted_tractable` | effort | 0.671 |
| `pli` | biology | 0.621 |
| `depmap_frac_dependent_lines` | biology | 0.539 |
| `gtex_n_tissues_above_1tpm` | biology | 0.519 |
| `gtex_tau` | biology | 0.513 |
| `depmap_mean_gene_effect` | biology | 0.497 |
| `depmap_common_essential` | biology | 0.480 |
| `loeuf` | biology | 0.409 |

So nothing here predicts progression beyond attention. Attention is simply measured better in compounds than in papers. **No production score was promoted on this result** — one dominated by existing compound count would rank highest precisely the targets a user could have found without it, and would rank an under-studied target last by construction.

## Three places I departed from the brief

These are deliberate and each is argued in its commit message.

**1. The understudy chip's wording was inverted.** The brief specified the clause "Ranks how little is known about a target". Measured, that is backwards: the score is 100 × the biology signal, which *rises* with evidence — a well-studied target scores 72.8 against 3.7 for a barely-studied one. Every number the brief gave is unchanged; the clause now reads "Evidence strength score … so well-studied targets score highest. It is not a novelty score."

**2. The brief said three functions had no callers. They had three.** `noveltyScoreValue`, `broadDrugDiscount` and `diseaseNoveltyFactor` were live in the production scoring path and in the benchmark generator that measured them. They are deleted from `server/noveltyScore.js`; the historical formulas are reproduced bit-for-bit inside `validate_novelty_retrospective.mjs` as artifacts under evaluation, so the published 0.361 and 0.129 stay reproducible.

**3. A disease-clustered bootstrap was added alongside the pair-level one.** The held-out rows are not independent — they cluster into 10 diseases that share both a base rate and a literature volume — so resampling pairs understates the variance. It changes conclusions, and every headline is written from the weaker of the two:

- Part B: ROC-AUC barely survives (+0.003 to +0.112) and **PR-AUC does not** (−0.004 to +0.026). The biology features alone do not beat publication count.
- Part C: M3 vs M0 survives (+0.089 to +0.187).

## Consequence worth a decision before merge

Deleting the drug-count and clinical-score terms was required by the measurement — they scored 0.361 on held-out data, below chance — but those terms were the only part of the score that pointed towards unexplored targets. The default ranking is now strength of evidence, so on the CML fixtures ABL1 (27 drugs, imatinib's target) ranks above SETBP1 (none).

Nothing in the product ranks targets by novelty any more. The `/validation` page says so in plain words, and drug count is surfaced as its own column for filtering rather than folded into a single number. Two ranking tests were rewritten to assert the new behaviour and record why.

## Part D is blocked, not done

`benchmark/docking/scripts/run_vina_vs_tanimoto.py` extends the enrichment run to all 14 sanity-passing Task 2 targets (928 compounds), scoring both rankers on identical compound sets and reporting ROC-AUC, EF@1%, EF@5%, BEDROC(20) and the paired delta-AUC with pooled and per-target-clustered CIs.

**It has never been run, or even syntax-checked.** The machine this was written on has no Python interpreter (`py -0` reports "No installed Python found"), no Vina binary and no Open Babel; the hosted docking service reports `serviceConfigured: false`. `TASK6_VINA_VS_TANIMOTO.md` is headed "Status: NOT RUN. This file contains no measurements," and five tests enforce that it cannot drift into looking like results. The harness exits non-zero and writes nothing when its prerequisites are absent.

Tanimoto therefore remains the default ranker, which is what `server/scoreCandidates.js` already does on the strength of Task 2 (0.662 against heuristic-v2's 0.523 and random's 0.520).

To run it: Python 3 + RDKit, the Vina binary, and Open Babel or ADFR. `--check` reports prerequisites; `--target <id>` runs one target at a time. Expect hours at exhaustiveness 16.

## Guardrails added

- **Provenance is derived, not typed.** `src/shared/validationProvenance.js` is generated from the shipped weights asset by `scripts/build-validation-provenance.mjs` (wired into `npm run build`). The old hand-typed commit constant disagreed with the asset it shipped alongside. The generator has a `--check` mode that a test runs, so the page and the asset cannot diverge again.
- **Every three-decimal figure** in user-visible copy is checked against a committed benchmark artifact by a generic test — it fails if any number on the page is not traceable.
- **Negative results are asserted as negative.** Tests require the page to report the clustered interval that *fails*, the removed formula's below-chance figures, and Task 5's null result rather than its headline number.
- **No promotional adjectives**, enforced by a test over the rendered page.
- `depmap_common_essential` read a 100% join rate because unscreened genes defaulted to 0. A gene DepMap never screened is unknown, not non-essential; it is now null, the rate reads 97.3%, and a test pins it to the gene-effect join rate.

## Data hygiene

- The 20MB Task 3 snapshot is gzipped to 0.64MB (31×) and the loader reads `.json.gz`. **Git history still carries the uncompressed 20MB blob**; a `git-filter-repo` pass could drop it later. No history was rewritten here.
- ~336MB of raw third-party downloads (DepMap, gnomAD, GTEx, the 21.04 target ETL) are gitignored and refetchable by `build_target_features.mjs`. Only the 1.4MB derived feature table is committed.

## Leakage controls

Every predictor comes from a source whose release date is recorded with the evidence for it: Open Targets 21.04 (2021-05-05), gnomAD v2.1.1 (2019-03), DepMap 21Q2 (2021-05-05, figshare 14541774), GTEx v8 (freeze 2017-06-05). A test asserts no source postdates 2021-05-31. Outcomes come only from 26.09. All fitting — including every residualisation regression and every missing-value fill — happens on the 11 training diseases. The split is by disease, so a target appearing in two diseases cannot straddle train and test. No feature was skipped for an unestablished vintage; two were excluded for joining under 70% of targets and are named with their rates.

## Reproducing

```
node benchmark/docking/scripts/validate_novelty_retrospective.mjs
node benchmark/docking/scripts/attention_control.mjs
node benchmark/docking/scripts/build_target_features.mjs
node benchmark/docking/scripts/tractability_models.mjs
```

## Still open

The brief's Task 1 called `understudyScore` the existing formula "unchanged in maths" while its acceptance criterion forbade a drug-count divisor, and the existing formula multiplied by `broadDrugDiscount`. Both cannot hold. I went with no divisor: on cohort 2 the drug term is inert and the result (0.6371) matches `novelty_v2` (0.6366) closely enough that both round to the 0.637 on the chip. If `broadDrugDiscount` should stay, say so — the acceptance test changes with it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
