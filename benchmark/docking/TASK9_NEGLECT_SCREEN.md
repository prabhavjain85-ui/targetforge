# Task 9 — The Neglect Screen

Targets with strong biological evidence and near-zero prior medicinal-chemistry
effort, weighted by disease burden in India.

**Note on this document.** The brief that specified this screen referred to
"TASK9 section 4" for what the screen cannot know, but the text I was given was
truncated mid-sentence in section 3 and contained no section 4. Section 4 below
is therefore written from what the committed benchmarks actually establish,
rather than reproducing a specification I did not receive. It should be checked
against the intended version.

## 1. Why this screen exists

Task 8 measured that prior effort predicts clinical progression better than
anything else available: the number of high-quality compounds already known for
a target scored a solo held-out **ROC-AUC 0.772**, higher than any fitted model
in Tasks 3, 4 or 8. Task 8 then declined to promote a production score using it,
because a score dominated by compound count ranks highest exactly the targets
the field has already chosen.

This screen inverts that finding instead of exploiting it. If effort predicts
progression, the zero-effort tail is what the field has passed over. Most of
that tail is passed over for good reasons. The screen's job is to surface it
with the caveats attached, not to declare opportunities.

## 2. The two axes

### Evidence (ranks the table)

The fitted **M1** feature set: `log1p(publication_count)` plus the eight Open
Targets biology datatype scores. Coefficients are lifted from
`results/task4_attention_control.json` into
`server/data/novelty/fitted-m1-weights.json` by `scripts/build-screen-assets.mjs`,
so there is one place the numbers live.

| | Held-out ROC-AUC | PR-AUC |
|---|---:|---:|
| Publication count alone (M0) | 0.667 | 0.057 |
| **M1 — the evidence axis** | **0.721** | **0.069** |
| Biology features alone (M2) | 0.683 | 0.049 |

M1 vs M0: +0.054 (95% CI +0.021 to +0.089 resampling pairs, +0.003 to +0.112
resampling diseases).

**Scope limit.** Task 7 stratified the held-out set: of the 10 diseases
contributing cohort-2 data, **9 were cancers and 1 was not**. The cancer stratum
reproduces the pooled result (+0.057), and on the single non-cancer disease
publication count alone scored **higher** than M1 (0.730 against 0.722). This is
an oncology result. Applying it outside cancer is untested, and the screen says
so on the page.

### Effort (filters the table, never ranks it)

Effort is never a positive term. `server/neglectScreen.js` carries a runtime
guard, `assertNoEffortTermInEvidence`, that throws if any feature name matching
drugs, compounds, precedence, tractability, ligands or ChEMBL ever reaches the
evidence model. A test asserts the guard fires.

| Tier | Meaning |
|---|---|
| `none` | no high-quality compounds and no clinical precedence recorded |
| `minimal` | 1–5 high-quality compounds, no clinical precedence |
| `active` | any current drug or clinical candidate, or any precedence, or >5 compounds |
| `unknown` | **no Open Targets 21.04 tractability record at all** |

`unknown` is the tier that matters. Open Targets 21.04 tractability joined only
**72.8%** of cohort-2 targets in the Task 8 benchmark, so an absent compound
count means nobody recorded one, not that nobody has made a compound. Rendering
that as "no effort" would manufacture precisely the neglected targets this
screen claims to find. `unknown` rows are excluded from the results and counted
separately, and the compound column renders the word "unknown" rather than `0`.

Pre-2021 compound counts are shipped in `server/data/effort/pre2021-effort.json`
because current Open Targets does not expose the 21.04 ETL's
`high_quality_compounds` field. 12,155 of 60,607 genes in the feature table have
a tractability record.

### Burden (shown per disease, does not multiply the score)

Burden is not folded into the ranking: a DALY count and a fitted probability
have no common scale, and multiplying them would invent a quantity neither
source supports. It is reported per disease so a multi-disease run can be
ordered by it explicitly.

**Source substitution, stated plainly.** The brief asked for the India
State-Level Disease Burden Initiative / GBD India estimates (ICMR, PHFI, IHME).
Those are not available in machine-readable form: the IHME GBD Results Tool
serves data through an interactive query UI with no open bulk endpoint, and the
ICMR/PHFI "India: Health of the Nation's States" output is a 22MB PDF of typeset
tables. Transcribing DALYs out of a PDF by eye would put unverifiable numbers
into a repository whose whole premise is that every number is traceable, so it
was not done.

What is used instead: **WHO Global Health Estimates 2023**, country-level DALYs
by cause, India column — 514,949 thousand DALYs across all causes, population
1,438,070 thousand. This is a different producer from the one requested. It is
national, not state-level, and it will not match published GBD India figures.

GHE cause labels are not ontology terms, so they are resolved against Open
Targets disease search and accepted **only** on an exact normalised label match
to an `EFO_` or `MONDO_` id. Top-hit-wins was tried and rejected: it maps
"Cervix uteri cancer" to "uterine cervix neoplasm" and "Iron-deficiency anaemia"
to an HP phenotype term. Mapping coverage is **82 of 189** non-aggregate causes
(**43.4%**). An unmapped disease shows burden as **unavailable** — never a
default, never an interpolation, never a nearest-ancestor guess.

No per-capita income, market size, willingness-to-pay or any other commercial
proxy enters the screen at any point. A test asserts none of those words appears
in the burden asset.

## 3. The screen

Route `/neglect-screen`. Input is a disease or a list of diseases. Output is
targets ranked by evidence score, filtered to effort tier `none` or `minimal`,
with columns: evidence score, effort tier, compound count, publication count,
India DALY burden, and — as **context only** — the Task 8 gene-property fields.

Those four context columns are rendered recessed and italic, with a note that
Task 8 measured them as adding nothing over evidence plus attention: keeping
only the gene properties gave ROC-AUC **0.719** against **0.721** without them, a
paired difference of **−0.002** (95% CI −0.026 to +0.022, including zero). They
do not enter the ranking.

Each disease block reports how many targets were considered, how many are shown,
how many were filtered out as active, and how many were excluded as unknown
effort.

## 4. What the screen cannot know

Written from the measured results, since the specified section did not arrive.
The page renders this list in full, from `screenLimitations()`.

1. **The evidence score is an oncology result.** 9 of the 10 contributing
   held-out diseases were cancers; on the one non-cancer disease the model gave
   no benefit over counting papers.

2. **Missing effort data is not zero effort.** 72.8% join rate; unknown rows are
   excluded rather than shown as neglected.

3. **It cannot tell you why a target was passed over.** No tractable pocket, no
   assay, no tool compound, a mechanism that failed in unpublished work, a
   target nobody can make a selective molecule against — none of this is in any
   public dataset. Absence of effort is not evidence of a missed opportunity,
   and this is the single most important limitation on the page.

4. **The evidence score is partly a measure of attention.** Publication count
   alone reaches 0.667 against M1's 0.721, and the gain does not survive
   disease-level resampling for PR-AUC. A high evidence score partly means a
   well-studied target, which is in direct tension with looking for neglected
   ones. Measured on the shipped model: weak evidence with 500 publications
   scores 73.3 while strong evidence with none scores 67.2.

5. **Burden is WHO national data, not the ICMR/PHFI/IHME state-level series,**
   and most causes are unmapped.

6. **The model was fitted on 2021 data and is applied to today's.** M1 was
   fitted on Open Targets 21.04 against outcomes to 26.09. Scoring current data
   assumes the relationship has not moved since, which has not been tested.

7. **There is no commercial axis, deliberately.** Burden is DALYs only.

## 5. Reproducing

```
node benchmark/burden/scripts/build_india_burden.mjs
```

```
node scripts/build-screen-assets.mjs
```

`scripts/build-screen-assets.mjs --check` fails if any shipped asset has drifted
from its benchmark source, and runs as part of `npm run build`.
