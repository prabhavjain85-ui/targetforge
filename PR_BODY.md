# Content sweep: remove claims the benchmarks refuted

Follows #70. That PR fixed what exported reports claimed; #69 fixed what the
site said about whether docking works. This one covers what the site said its
scores **mean** — claims the retrospectives have since refuted.

**Hard rule applied throughout:** a claim appears in one place and every surface
renders from it. If a sentence states what a score predicts, it traces to a
committed file under `benchmark/` or it does not ship.

---

## One source of truth for every figure

`src/shared/validationCopy.js` gains `MEASURED`: every numeric performance
figure any page may show, as **strings**, because the rendered form is part of
the fact. `/methodology` and `/validation` now interpolate from it.
`src/shared/dockingStatus.js` gains the enrichment, Spearman and redock-failure
figures so docking numbers stay in their own one place.

`MEASURED` had to be declared above `SCORE_CHIPS` and `VALIDATION_SECTIONS`:
reading a module-scope `const` before its declaration is a temporal dead zone
and throws on import, which has bitten this repo before.

This caught real drift: `validationCopy` stated the fitted simplex weights as
**0.814** and **0.018** while the artifact and `/methodology` said **0.8135** and
**0.0175**. Two surfaces, one quantity, two values.

## The refuted claims

### "AI-Powered" — nothing here is AI

Compound ranking is Tanimoto similarity; target ranking is a logistic model
fitted over public evidence counts; triage is a hand-written rule table. The
methodology page already said "Neither is AI" two scrolls below a title that
said the opposite.

It was also in **six places in `public/index.html`** — the shell crawlers and
no-JS readers get before React hydrates: its `<title>`, `<h1>`, and the `og:`
and `twitter:` tags. No test had ever read `public/`, so every one of the seven
generated routes still served an AI-Powered `<h1>` after `seoConfig` was clean.
Fixed there, in `social-preview.svg`, and in the generator script that would
otherwise restore it on the next regen.

### "genetically validated"

Genetic association alone scored **ROC-AUC 0.497** on cohort 1 and **0.500** on
cohort 2 — chance in both — and the fitted model gave it **0.0175** of the
simplex. Open Targets records the evidence; in this benchmark the evidence did
not predict clinical progression. Criterion 04 now says so with the figures.

### "underexplored opportunities"

Task 8 measured zero prior medicinal-chemistry effort as predicting **against**
progression. The neglect screen's register — "They are not opportunities" — is
reused.

### "novelty score" leftovers

Not just the name: `NoveltyInfoTip` still **described the removed formula as
live**, including "Drug penalty: 1 / (1 + existing drug count)" and a toxicity
penalty. Replaced by `EvidenceInfoTip`, which renders the measured figures and
states that the drug-count term took the whole score to **0.361**, below chance.

## Methodology page rewrites

**Criterion 03** now leads with measured performance — `heuristic-v2` at
**0.523** against **0.520** for a seeded random ranker, rule table alone at
**0.482** because its drug-name regexes fire on 0% of held-out molecules. The
score bands stay, as documentation of the arithmetic rather than a ranking to
act on.

**Criterion 04** rewritten around the understudy/progression split, Task 4's
**+0.054** (95% CI +0.021 to +0.089 pairs; **+0.003 to +0.112** diseases), Task
7's oncology scope — including that **publication count alone scores higher
(0.730 vs 0.722)** on the single non-cancer held-out disease, and that
generalisation is **underpowered to tell** — and Task 8's null gene-property
result (**−0.002**, CI −0.026 to +0.022) with compound count at **0.772** and
why no score was shipped on it.

**Criterion 06**'s "~0.35" and "3 of 15 … in progress" bullets quoted the
superseded Task 1 run as current.

**Criterion 05 is deliberately not rewritten from `TASK10_REPURPOSING.md`**, and
I think the premise there was mistaken. Two different things are called
repurposing: this criterion is the **compound screen**, which ranks by
`heuristic-v2` (0.523), while Task 10 measures which **targets** acquire a
clinical drug and is the discovery page's repurposing profile (0.910). Rewriting
Criterion 05 from Task 10 would transfer the strongest result in the repository
onto the weakest component. Each is now stated with its own engine, and the page
says explicitly that the target-side model "does not score compounds".

**ADME location contradiction resolved as backend.** `server/rdkitLoader.js`
says RDKit runs exclusively on the server and no `src/` module imports it. The
same wrong "in-browser" claim was also in `OrganToxicityPanel`.

## New sections

The neglect screen (Task 9) with its "not opportunities" framing and the
oncology-vs-burden scope tension stated first; the IDG/Pharos prior-art
disclosure linking `pharos.nih.gov`; and a prominent pointer to `/validation` as
authoritative. Plus table-of-contents entries and scroll-spy ids.

## Enforcement

In `src/methodologyProvenance.test.js`:

- the four refuted phrases in no user-facing string, across `src/`, `seoConfig`
  and `public/index.html`, with comments stripped first so the note explaining a
  removal doesn't trip the guard that removed it
- "opportunity" only where it is denied
- no three-decimal literal in a page file, and every `MEASURED` figure traced
  back to a committed artifact
- the same quantity never stated two ways across the two pages

The phrase guard uses a **two-entry allowlist** of withdrawal sentences rather
than a regex for "was" or "previously": a heuristic would admit any new copy
phrased in the past tense, which is exactly how the original comes back. A test
asserts each entry reads as withdrawn and that the six original strings are not
covered by it.

**Figure assertions now read the rendered DOM**, not page source — grepping
source passes vacuously on an interpolation that resolves to `undefined`.

Six guards were verified by reintroducing the original copy one at a time. All
six fail.

## Also fixed, found on the way

- `.novelty-badge.undrugged` was **green** and `tr.high-novelty` had a green
  left-edge marker, styling evidence-with-no-drug as a good find on the one
  state Task 8 points away from. Both neutral. The `.recommend` "winner" callout
  heading that group is now a plain grouping note.
- `server/repurposingScreen.js` generated **"shows strong/moderate/limited
  structural fit"** per drug, banding `heuristic-v2` at 70 and 50. A chance-level
  filter cannot support that at any band.
- The **"Novel Discovery"** evidence-profile label asserted the one thing no
  surface may assert. Renamed; the `id` is untouched as it is API contract.
- The empty state sold "little existing drug coverage".
- `TargetDiscoveryPage` JSX text contained literal `🆕` and `·`
  escapes, so users were shown the escape sequences.
- **`TargetDiscoveryPage` had no render test**, which is why an illegally placed
  JSX comment passed the entire Jest suite and failed `npm run build`. Added,
  scoped honestly: the results table and tooltip need a live search, so their
  wiring to the shared constants is checked rather than their rendered form.

## Verification

609 tests pass (from 601 at the branch point). Full build pipeline green
including the post-build `inject-seo-html.mjs` step, and the generated HTML for
all seven routes carries none of the refuted claims.

## Not covered

`/neglect-screen` has still not been viewed at 360px — the browser pane was
blocked throughout this work, so its layout is covered by render tests only.
