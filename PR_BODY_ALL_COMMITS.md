# Measure every score, then fix what the site claims about them

`feat/split-novelty-scores` → `main`, 17 commits.

A retrospective validation of every score in TargetForge against Open Targets
21.04 → 26.09, followed by the removal of the scores and the copy that the
measurements refuted. Several headline results are negative and are reported
as the finding.

Every figure below traces to a committed file under `benchmark/`. Nothing is
computed, re-rounded or inferred at render time; `src/methodologyProvenance.test.js`
reads the artifacts back and fails the build on drift.

---

## The results

### The shipped novelty score was below chance

`biologySignal / (1 + drugCount)` scored held-out **ROC-AUC 0.361** on
disease-specific clinical acquisition — below the 0.500 of a coin flip. The
inverse drug-count term alone scored 0.129. Dividing by drug count inverts the
strongest real predictor of a target entering the clinic.

It has been deleted. What replaced it is two separate columns:

| Score | Held-out ROC-AUC | PR-AUC |
|---|---|---|
| Evidence strength (undrugged cohort) | 0.637 | 0.038 |
| Evidence strength (all targets) | 0.555 | 0.030 |
| Progression (fitted) | 0.708 | 0.052 |
| Publication count (baseline) | 0.667 | 0.057 |
| Genetic association alone | 0.500 | 0.022 |

The fitted progression weights put **0.8135** of the simplex on the literature
feature and **0.0175** on genetic association, so that column is largely a
publication-count proxy — and publication count alone scores 0.667 against its
0.708. They are near-duplicate signals, not independent evidence.

**Direction, because it is easy to misread:** the evidence score *rises* with
evidence. Best-studied targets score highest. Removing the drug-count term was
what the measurement required, but that term was also the only part of the old
score pointing toward unexplored targets. **No score here ranks by novelty.**

### Genetic evidence did not predict progression

0.497 on cohort 1, 0.500 on cohort 2. Chance in both. The site described its
output as "genetically validated targets"; that claim is gone.

### Does the biology beat counting papers? Marginally, and only in cancer

Three nested models, same cohort and split:

| Model | ROC-AUC |
|---|---|
| Publication count alone | 0.667 |
| + the 8 Open Targets biology features | 0.721 |
| The 8 biology features alone | 0.683 |

Paired gain **+0.054** (95% CI +0.021 to +0.089 resampling pairs). Resampling
whole diseases widens that to **+0.003 to +0.112** — still excluding zero, but
barely — and the PR-AUC interval becomes −0.004 to +0.026, which includes zero.
The gain in ranking holds; the gain in precision among the rare positives does
not.

Stratifying (cancer labelling committed as its own file so it can be disputed):
on the 9 held-out cancers the gain is +0.057, essentially the pooled figure.
Outside cancer it is **underpowered to tell** — one disease, 1,403 pairs, 22
positives. On it the biology features do not help (−0.008, CI −0.047 to +0.033)
and **publication count alone scores higher (0.730 vs 0.722)**. No disease-level
interval is reported for that stratum: resampling one disease would produce
something that looks like a measurement and is not one.

### Gene properties add nothing. Prior chemistry is what predicts

Five more pre-2021 feature groups (OT tractability, ChEMBL protein class, gnomAD
pLI/LOEUF, DepMap 21Q2, GTEx v8). Everything together: **0.807**, a +0.140 gain
over publication count.

None of it is biology. Keeping only properties of the gene itself gives 0.719
against 0.721 without them — a paired difference of **−0.002** (CI −0.026 to
+0.022), including zero.

The entire gain is one feature: the count of high-quality compounds that already
existed for the target in 2021, which alone scores **0.772** — better than any
model in the report, and independent of attention (R² 0.002, still 0.699
residualised).

**No score was promoted on this result**, and the reason is the point: it would
rank highest the targets a user could have found without it, and rank a
genuinely unstudied target last by construction.

### Repurposing: the one strong result

Measured on the cohort that actually poses the question — targets associated
with a disease in 2021 with no clinical drug for it, scored on whether they
acquired one by 2026 (13,601 held-out pairs, 300 positives):

| Model | ROC-AUC | PR-AUC | p@25 |
|---|---|---|---|
| Drug count + publication count (shipped) | **0.910** | 0.195 | 0.240 |
| Drug count alone | 0.872 | 0.177 | — |
| Publication count alone | 0.707 | 0.070 | — |
| The previous hand-weighted formula | 0.787 | 0.084 | 0.320 |

Worth **+0.123** (CI +0.107 to +0.138 pairs, +0.048 to +0.200 diseases). The old
formula put 0.35 of its weight on disease-specific clinical evidence and capped
drug count at a 0.15 bonus — nearly ignoring the one feature that works.

Its higher p@25 (0.320 vs 0.240) is two pairs out of 25; the paired bootstrap
puts that at −0.080 with a CI of −0.320 to +0.160. No evidence it was better at
the top, strong evidence it was worse across the list.

What this does **not** support: the score ranks by how often the field has
already drugged a target elsewhere. That is a statement about where effort has
gone, not about biology.

### Compound triage does not rank

Property-matched decoy benchmark, Bemis–Murcko scaffold splitting, 14/15 targets
passing sanity checks, mean AVE bias 0.099, zero leaked scaffolds:

| Ranker | ROC-AUC |
|---|---|
| Tanimoto to staged co-crystal ligand | 0.662 (BEDROC20 0.617) |
| `heuristic-v2` | 0.523 |
| Seeded random | 0.520 |
| Gene/PDB rule table alone | 0.482 |

`heuristic-v2` is a drug-likeness and liability **filter**. Its target rules are
keyed to specific drug names and fire on 0% of held-out molecules. Compounds are
ranked by Tanimoto instead, which is the best ranker actually measured.

### Docking

Vina 1.2.5 reproduces the co-crystal pose within 2 Å on **10/11** targets.
Drug–structure pair reliability **15/25**. Correlation with measured potency:
**Spearman −0.291 (95% CI −0.681 to 0.478)** — none, and the wrong sign.

The legacy in-browser engine failed redocking on every target tested (in-place
RMSD 5.5–11.5 Å, no valid pose at all on six of eleven). It is disabled and
unregistered from `/api/compute`; it was previously reachable by direct POST.
This is a finished negative result, not work in progress, so the phrases "under
validation" and "in-browser" are banned from docking copy.

---

## What changed in the app

**Two new pages.** `/validation` lists the measured performance of every score,
including the failures. `/neglect-screen` lists targets with substantial evidence
and no recorded medicinal chemistry, weighted by India's WHO GHE DALYs — framed
throughout as the inverse of what predicts success, because that is what Task 8
measured. Its copy says "They are not opportunities", nothing in it is styled as
desirable, and it carries a per-target manual checklist (outbound links only; no
patent office or trial registry is scraped).

**Removed:** the hypothesis-testing module, the LLM adversarial critique, Quantum
Insight, and the in-browser docking engine's registration.

**One source of truth per fact.** Three shared modules now own what the site
says, with tests that fail if a claim appears anywhere else:

- `src/shared/dockingStatus.js` — docking status in English, replacing twelve
  hardcoded strings that had drifted out of agreement with the flags, with each
  other, and with `/validation`.
- `src/shared/validationCopy.js` — `MEASURED`, every numeric performance figure,
  as strings because the rendered form is part of the fact.
- `src/shared/reportProvenance.js` — stamps each exported report with its
  generating commit and the benchmark commit its figures came from.

**Copy the measurements refuted, removed:**

- "AI-Powered" from the title, H1 and metadata. Nothing here is AI. It was also
  in six places in `public/index.html` — the shell crawlers get before React
  hydrates — so every route served an AI-Powered `h1` until this branch.
- "genetically validated", "underexplored", "opportunities", "novelty score"
  wherever they asserted rather than denied.
- "Novel Discovery" as an evidence-profile label.
- Exported reports no longer claim a ΔG, a Ki, an energy decomposition, or cite
  Morris 2009 / Trott & Olson 2010 for an engine that produced none of it.
- The repurposing screen no longer generates "shows strong structural fit" from
  a chance-level filter.
- The ADME location contradiction resolved: RDKit runs on the backend.

**Styling:** the green badge and green row marker on evidence-with-no-drug are
neutral. The benchmark points away from that combination; green said "good find".

---

## Honest gaps

- **Task 6 (Vina vs Tanimoto) has not run.** The harness is committed for all 14
  targets; this environment has no Python, no Vina binary and no Open Babel. It
  is reported as NOT RUN and invents no figure. A test fails if a result file
  appears while the status document still says NOT RUN.
- **Everything is oncology-scoped.** The panel is 15 cancers and 7 non-cancers,
  and 9 of 11 held-out diseases are cancers. Settling generalisation needs more
  non-cancer diseases, not more analysis of these 22 positives.
- **`/neglect-screen` has not been viewed at 360px.** The browser pane was
  blocked for this work; the layout is covered by render tests only.
- `server/nodeRequire.js` derives its base from `process.cwd()`, so server asset
  reads fail from a non-root cwd. Pre-existing, not fixed here.
- `api/rank-candidates.js` still sends LLM prompts for narration. Labelled as
  such; no LLM output is treated as a scientific claim.

## Verification

609 tests pass. Full build pipeline green including the post-build SEO step. New
guards were each verified by reintroducing the fault they catch.
