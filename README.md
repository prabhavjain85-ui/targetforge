# TargetForge

**TargetForge** is a computational drug-discovery and repurposing workbench. It integrates target identification from public evidence, crystallographic structure selection, compound triage, ADME profiling, and a docking service into one workflow.

Nothing here is AI. Compound ranking is Tanimoto similarity to the co-crystallised ligand; target ranking is a logistic model fitted on public evidence counts; compound triage is a hand-written rule table.

## Measured performance

Every score has been validated on held-out data, and the results are published in full — including the scores that failed and were removed. The authoritative page is [`/validation`](https://www.targetforge.in/validation); every figure there traces to a committed file under `benchmark/`.

| Score | Held-out ROC-AUC | Status |
| --- | --- | --- |
| Repurposing model (drug + publication count) | **0.910** | Shipped — strongest result here |
| Tanimoto to the co-crystallised ligand | **0.662** | Shipped — the compound ranker |
| Progression score (fitted) | **0.708** | Shipped |
| Publication count (baseline) | 0.667 | Shown as its own column |
| Evidence strength score | 0.637 undrugged / 0.555 all | Shipped |
| `heuristic-v2` triage | 0.523 | **At chance** (random = 0.520). A filter, not a ranker |
| Gene/PDB rule table alone | 0.482 | Below random — its rules name specific drugs |
| Genetic association alone | 0.497 / 0.500 | **Chance in both cohorts** |
| Old novelty score, `biology / (1 + drugCount)` | 0.361 | **Below chance — removed** |

Retrospective on Open Targets 21.04 → 26.09, 22 diseases split 11 train / 11 held out. Two consequences worth stating plainly:

- **No score here ranks targets by novelty.** The formula that did scored below chance and was deleted. The evidence score *rises* with evidence, so the best-studied targets score highest.
- **Read every figure as an oncology result.** 9 of the 11 held-out diseases are cancers. On the single non-cancer held-out disease, publication count alone scored higher than the model (0.730 vs 0.722), and one disease with 22 positives cannot settle the question either way.

---

## Application Navigation & Modules

TargetForge is structured across dedicated routes:

| Route | Module | Core Functionality |
| --- | --- | --- |
| `/` | **Staging Bench** | Search PDB structures, evaluate Target Selection Scores, search PubChem compounds, run PAINS/toxicophore screens, and rank candidates using `heuristic-v2`. |
| `/target-discovery` | **Target Discovery** | Query Open Targets GraphQL for a disease and rank the targets it records evidence for, with drug count shown as its own column rather than folded into the score. |
| `/repurposing` | **Drug Repurposing Screen** | Screen a target against a library of 2,983 approved small-molecule drugs. Ordering is `heuristic-v2`, which scores at chance; Tanimoto similarity to the bound ligand is a separate sortable column and is the better-measured signal. |
| `/adme` | **ADME Profiling** | Physicochemical descriptors, BOILED-Egg GI and BBB permeation, ESOL solubility, Lipinski/Veber/Ghose rules, and organ toxicity alerts. RDKit runs on the backend, not in the browser. |
| `/docking` | **Molecular Docking** | AutoDock Vina as a service. Not configured in production, so no poses or scores are produced. The legacy in-browser engine is permanently disabled — it failed redocking. |
| `/validation` | **Validation** | The authoritative record of every score's measured held-out performance, generated from the committed benchmark artifacts. |
| `/neglect-screen` | **Strong evidence, no chemistry** | Targets with substantial evidence and no recorded medicinal chemistry, weighted by India's disease burden. Explicitly *not* a list of opportunities — see below. |
| `/evolution` | **Local molecular search** | Mutates a seed with curated RDKit reaction SMARTS and ranks survivors by multi-objective scoring plus diversity picking. No generative SMILES from language models. |
| `/history` | **Session History** | Past staging sessions, target discoveries and screening runs, saved in browser storage. |
| `/methodology` | **Scientific Methodology** | Scoring formulas, rule tables, thresholds, measured performance and limitations for every subsystem. |
| `/contact` | **Contact & Inquiries** | Support and feedback form with multi-tier delivery (Resend, Formspree, FormSubmit, dry-run). |

---

## 1. Staging Bench (`/`)

The Staging Bench provides a multi-station workspace for evaluating specific protein-ligand pairs:

### Station 1: Target Selection Score (RCSB PDB)
Ranks crystallographic PDB entries to identify the most reliable experimental structure for computational analysis:
- **Scoring Engine:** Deterministic 100-point composite score based on experimental resolution ($\le 2.0$ Å optimal), structural completeness, presence of an authentic co-crystallized small-molecule ligand (excluding crystallization salts and cryoprotectants), binding pocket proximity (~5 Å), and experimental method (X-ray/cryo-EM).
- **Data Ingestion:** Batched from RCSB PDB (`data.rcsb.org/graphql` with REST fallback). Missing metrics display as `N/A` and contribute zero points.

### Station 2: PAINS and Toxicophore Screening
Screens chemical structures against recognized pan-assay interference and reactive chemotypes prior to ranking:
- **PAINS Filters:** Substructure pattern matching corresponding to `PAINS_A`, `PAINS_B`, and `PAINS_C` filter catalogs (Baell & Holloway).
- **Reactive Toxicophores:** Screening for reactive functional groups not covered by PAINS, including Michael acceptors, aliphatic aldehydes, epoxides, and alkyl halides.
- **Reporting:** Flagged compounds display actionable warnings and structural liability descriptions. Flagged molecules remain selectable, and alerts are factored into downstream candidate scoring as deductions rather than arbitrary exclusions.

### Station 3: Compound Triage Filter (`heuristic-v2`)
Scores 2–5 staged molecules specifically against the selected PDB target.

> **Measured first, because the bands below read as meaningful and are not.** On a property-matched, Bemis–Murcko scaffold-split decoy benchmark (14/15 targets passing decoy sanity checks, mean AVE bias 0.099, zero leaked scaffolds), `heuristic-v2` scores held-out **ROC-AUC 0.523 against 0.520 for a seeded random ranker**. The gene/PDB rule table alone scores **0.482**, below random, because its hardcoded drug-name rules fire on **0%** of held-out molecules. Tanimoto to the staged co-crystal ligand scores **0.662** and is what the app actually ranks by. So `heuristic-v2` is a drug-likeness and liability **filter**, not a ranker: the bands document what the number is composed of, not pharmacological relevance.

- **Triage engine (`heuristic-v2`):** A 0–100 score built from curated target rules and drug-likeness — not a predictor of binding or clinical activity. It evaluates target context (protein name, gene symbol, family classification, co-crystal ligand functional groups, binding pocket size/hydrophobicity) alongside Lipinski/Veber properties and PAINS flags.
- **Pharmacological Rule Table:** Specific rules match recognized target genes and families (e.g., EGFR, ABL1, BRAF, HER2, $\beta_2$-AR, COX-1/2, HMGCR, DPP4, HIV Protease, SARS-CoV-2 Mpro, PDE5, HDACs) into calibrated score bands:
  - **On-target canonical chemotypes:** $\sim 67$ base points
  - **Same-family chemotypes:** $\sim 24$ base points
  - **Generic / off-target drug-like molecules:** $\sim 12$ base points
  - **Co-crystal ligand / pocket geometry match:** up to $+15$ bonus points
  - **Penalties:** Deductions for Lipinski/Veber rule violations and PAINS/toxicophore alerts.
- **Deterministic Calibration:** Numeric scores are governed by the local deterministic engine to ensure reproducibility across batches.
- **Optional LLM narration:** When `OPENAI_API_KEY` is set, `/api/rank-candidates` calls OpenAI (`gpt-4o-mini` by default) to word the strengths and concerns already derived from the rules. It is labelled as LLM-written wherever it appears, it never changes a score, and it produces no verdict, confidence label or citation. Without a key the app uses local rule-based phrasing and loses nothing quantitative.
- **Isolation:** Scores are cached by `(PDB_ID, CID)`. A score computed against one target is never reused for another.
- **Workflow handoff:** ADME profiling (`/adme`) is available from Station 4. Docking (`/docking`) runs on the Vina service where it is configured; the legacy in-browser engine is permanently disabled.

---

## 2. Target Discovery (`/target-discovery`)

The Target Discovery module ranks the targets Open Targets records evidence for, and shows separately how much medicinal chemistry already exists for each.

> **The single novelty score this section used to document has been removed.** `biologySignal / (1 + drugCount)` scored held-out **ROC-AUC 0.361** — below chance — because dividing by drug count inverts the strongest real predictor of a target entering the clinic. The inverse drug-count term alone scored 0.129. Two separately-named scores replaced it.

- **Open Targets GraphQL API:** Live queries to `https://api.platform.opentargets.org/api/v4/graphql`. Free-text disease searches resolve to EFO/MONDO ontology IDs and retrieve target associations across genetic, somatic, literature, and pathway data types.
- **Clinical Drug Saturation:** Tracks `target.drugAndClinicalCandidates.count` (the count of approved or clinical-stage drugs targeting the gene).
- **Evidence strength score** — the hand-set weighting of the eight Open Targets biology scores, with the drug-count penalty deleted:
  $$100 \times (0.50\,\text{Genetic} + 0.12\,\text{GenLit} + 0.12\,\text{Somatic} + 0.10\,\text{Overall} + 0.08\,\text{Lit} + 0.05\,\text{Pathway} + 0.03\,\text{Animal} + 0.02\,\text{RNA})$$
  Held-out ROC-AUC **0.637** on targets with no existing drug, **0.555** across all targets. It *rises* with evidence, so a well-studied target scores ~72.8 against ~3.7 for a barely-studied one. It is not a novelty score and not a prediction that a target will yield a drug.
- **Progression score** — a logistic model fitted on the 11 training diseases: held-out ROC-AUC **0.708**, precision@25 **0.12**, about 3 true positives in a top-25 list. The fitted weights put **0.8135** of the simplex on the literature feature and **0.0175** on genetic association, so it behaves largely as a publication-count proxy — and publication count alone scores 0.667. Treat the two as near-duplicate signals.
- **Publication count** — shown as its own column so you can see when a target is "novel" only in the sense of being unstudied.
- **Drug count** — its own sortable column, never folded into a score.
- **Evidence weighting profiles:** *Genetic & Somatic Evidence* (the weighting above) and *Repurposing*, the fitted Task 10 model that reaches **0.910** by combining drug count and publication count.
- **Target Segmentation:** rows are grouped by whether a target has an approved or clinical drug *for the searched disease*. That grouping is a filter, not a recommendation: Task 8 measured existing compound count as the strongest single predictor of a target reaching the clinic (0.772), so an absence of chemistry points away from progression, not towards it.
- **Bench Handoff:** 1-click transition transfers the gene to the Staging Bench or Repurposing Screen to locate viable PDB structures.

---

## 3. Drug Repurposing Screen (`/repurposing`)

The Repurposing Screen evaluates existing approved therapeutics against any crystallographic PDB target:

- **Approved Drug Library:** Served from `public/data/approvedDrugs.json` (lazy-loaded at runtime, not in the main JS bundle), containing **2,983 approved small-molecule drugs** with SMILES, PubChem CIDs, indications, and physicochemical properties. `src/data/approvedDrugs.json` remains for scripts and tests.
- **Pre-Qualification Pipeline:**
  1. Filters out entries with missing SMILES, extreme molecular weight ($\text{MW} > 900\text{ g/mol}$), or severe drug-likeness failures ($\ge 5$ Lipinski/Veber violations).
  2. Evaluates pocket geometry (small, large, hydrophobic, hydrophilic) and reference ligand molecular weight.
  3. Pre-qualifies top candidates for deep scoring, while the remaining library is evaluated via the local `heuristic-v2` engine.
- **Client-Side Batching:** Shortlisted compounds are scored in client-side batches of 25 to respect the 30-second execution window of serverless functions.
- **24-Hour Snapshot Cache:** Results for each PDB structure are cached locally for 24 hours, preventing redundant calculations and minimizing serverless traffic.

---

## 4. ADME Profiling (`/adme`)

The ADME module computes physicochemical and pharmacokinetic properties with **RDKit WebAssembly running on the backend**, not in your browser. `server/rdkitLoader.js` is the only place RDKit is initialised, and no module under `src/` imports it. (This README previously described the module as client-side in one section while correctly calling RDKit server-side in another.)

- **BOILED-Egg Passive Permeation:**
  - Calculates topological polar surface area ($\text{TPSA}$) and lipophilicity ($\text{cLogP} / \text{WLogP}$) against the mathematical rotated ellipses defined by Daina & Zoete (*ChemMedChem* 2016).
  - Classifies passive gastrointestinal absorption (HIA, "White") and blood-brain barrier penetration (BBB, "Yolk").
  - Includes clinical non-CNS borderline corrections for hydrophilic analgesics (e.g., Aspirin, Paracetamol) to prevent false-positive BBB classifications.
- **Delaney ESOL Aqueous Solubility:**
  - Computes aqueous solubility ($\text{LogS}$, mol/L and mg/mL) using the Delaney (2004) equation based on cLogP, molecular weight, rotatable bonds, and aromatic proportion.
- **Druglikeness Filters:**
  - **Lipinski's Rule of 5:** MW $\le 500$, cLogP $\le 5.0$, HBD $\le 5$, HBA $\le 10$.
  - **Veber Bioavailability Rules:** Rotatable bonds $\le 10$, TPSA $\le 140\text{ \AA}^2$.
  - **Ghose Filter:** MW $160\text{--}480$, cLogP $-0.4\text{ to }5.6$, MR $40\text{--}130$, total atoms $20\text{--}70$.
- **Pharmacokinetic Rules:**
  - **P-glycoprotein (P-gp) Substrate Liability:** Heuristic rule flagging molecules with $\text{MW} > 400$ and $(\text{N}+\text{O}) \ge 8$, or recognized large kinase inhibitor chemotypes.
  - **CYP Metabolic Risk:** Transparently labeled as **"CYP: not modeled"** rather than fabricating ungrounded 2D risk scores.
  - **Abbott Bioavailability Score:** Implements the Martin (2005) probability score ($0.55$ if Lipinski violations $\le 1$ and $\text{TPSA} \le 140\text{ \AA}^2$; $0.17$ otherwise).
- **Organ Toxicity Structural Alerts:**
  - RDKit SMARTS substructure screening for literature-curated toxicophores across drug-induced liver injury (DILI / quinone-imines / hydrazines / nitroaromatics), hERG cardiotoxicity (basic lipophilic amines / terfenadine-like pharmacophores), nephrotoxicity, and mutagenicity/carcinogenicity (ICH M7 alerts).

---

## 5. Molecular Docking (`/docking`)

Validation is **finished**, not in progress, and the two engines in this repository got very different results.

**The legacy in-browser engine failed and is permanently disabled** (`DOCKING_ENGINE_ENABLED = false`). Redocking a ligand into the structure it was crystallised in returned poses 5.5–11.5 Å from the experimental pose where it returned one at all, and no valid pose on six of eleven targets. That is a completed negative result, so the app never describes it as "under validation" or "paused" — a test fails the build if that phrasing returns. It was also unregistered from `/api/compute`, where it had remained reachable by direct POST.

**AutoDock Vina runs as a service** and passes pose reproduction:

| Measurement | Result |
| --- | --- |
| Redocking within 2 Å | **10 / 11** targets |
| Drug–structure pair reliability | **15 / 25** pairs |
| Correlation with measured potency | Spearman **−0.291** (95% CI −0.681 to 0.478) — none, and the wrong sign |
| Enrichment (3 targets) | ROC-AUC 0.636 / 0.744 / 0.800; no early enrichment at 1% on two of three |

A Vina score is a scoring-function value used to order poses. **It is not a binding free energy, and no Ki or ΔG is derived from it** — exported reports fail a test if they contain "ΔG", "Ki", "Monte Carlo", "Morris" or "in-browser".

In production `serviceConfigured` is `false`, so no poses or scores are produced at all. Experimental co-crystal structures are still shown where they exist, because those are measured rather than computed.

Whether docking ranks compounds better than a fingerprint comparison **has not been measured** — the Task 6 harness is committed but has not run. Until it does, compounds are ranked by Tanimoto.

---

## 6. Neglect Screen (`/neglect-screen`)

Targets with substantial biological evidence for a disease and little or no recorded medicinal chemistry, ranked by evidence and weighted by India's WHO Global Health Estimates DALYs.

**These are not opportunities.** The screen inverts the Task 8 finding: existing compound count was the strongest single predictor of a target entering the clinic (0.772), so this list is deliberately made of targets that signal predicts *against*. A target with good biology and no compounds is usually one the field has already looked at and left, and the reasons — no tractable pocket, no assay, no tool compound, an unpublished failure — are in no public dataset.

It also cannot establish that a target is unpursued: Open Targets records approved and clinical-stage drugs, not failed or abandoned programmes. The page carries a per-target checklist of patent, trial-registry and literature searches, as outbound links only; nothing queries a patent office or registry, and ticks stay in your browser.

The idea is not original here. The NIH Common Fund's **Illuminating the Druggable Genome** programme and its [Pharos](https://pharos.nih.gov/) portal already classify every human protein by target development level (Tclin / Tchem / Tbio / Tdark); "strong evidence, no chemistry" is approximately **Tbio**, and this repository reimplements that classification. What is added is the India burden weighting and an evidence model with measured held-out performance.

Its two axes disagree about scope, which is the first thing the page says: the evidence model is validated on cancers, while India's recorded burden is mostly not cancer — malignant neoplasms are 6.0% of total DALYs.

---

## 7. History & Methodology

- **Session History (`/history`):** Maintains unified local storage of staging bench sessions, target discovery runs, repurposing results, and docking simulations for auditability and session resumption.
- **Scientific Methodology (`/methodology`):** Detailed reference documenting scoring formulas, empirical constants, rule-table mappings, validation data, and scientific limitations across every subsystem.

---

## Environment Variables

TargetForge operates out of the box with local deterministic models. An optional language model writes prose only — it never produces a score, verdict, confidence label or citation, and no scientific claim anywhere in the app is LLM-generated. Email delivery is likewise optional.

| Variable | Required | Service | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Optional | OpenAI | Enables structured qualitative reasoning in `/api/rank-candidates`. |
| `OPENAI_MODEL` | Optional | OpenAI | Model identifier for OpenAI calls (default: `gpt-4o-mini`). |
| `RESEND_API_KEY` | Optional | Resend | API key for transactional email delivery from `/api/contact`. |
| `CONTACT_TO_EMAIL` | Optional | Email | Destination email for contact form submissions (default: `prabhavjain85@gmail.com`). |
| `CONTACT_FROM_EMAIL`| Optional | Resend | Verified sender email header for Resend delivery. |
| `FORMSPREE_ID` | Optional | Formspree | Alternative form endpoint if Resend is not configured. |
| `CONTACT_DRY_RUN` | Optional | Contact API | Set to `1` or `true` to validate payloads without transmitting actual emails (default in local dev). |

*Note: If no email credentials are set, `/api/contact` safely routes submissions through FormSubmit with zero configuration required.*

---

## Live Data Sources & Infrastructure

- **RCSB Protein Data Bank:** Crystallographic structure models, resolution metrics, ligands, and pocket coordinates (`data.rcsb.org`).
- **Open Targets Platform:** Live GraphQL API for genetic associations, somatic mutations, and clinical drug pipelines (`api.platform.opentargets.org`).
- **PubChem PUG-REST:** Chemical structure records, 2D depictions, and compound property retrieval (`pubchem.ncbi.nlm.nih.gov`).
- **RDKit WebAssembly:** Server-side chemical informatics, descriptor generation, and substructure matching (the browser uses RDKit only to draw structures).
- **Approved Drug Pharmacopeia:** Library of 2,983 approved therapeutics (`public/data/approvedDrugs.json`).
- **3Dmol.js:** WebGL-accelerated interactive 3D protein-ligand structural visualization.

---

## Scoring: What Generalises and What Does Not

The curated target rules in `server/scoreCandidates.js` recognise compounds by **name**, so they award the 55-point on-target bonus only to drugs already listed in a rule. They say nothing about an unnamed or newly generated molecule.

`server/structuralSimilarity.js` adds the one target-specific signal that works for any molecule: Morgan fingerprint (radius 2, 2048-bit) Tanimoto similarity to the ligand co-crystallised in the staged PDB entry, fetched from the RCSB chemical-component record. It is continuous, so it also breaks the score ties the discrete bonuses produce.

- Named on-target drugs score exactly as before — similarity only fills in the target and ligand terms when the name lookup finds nothing.
- Similarity contributes at most 35 target points and 20 ligand points, ramping from Tanimoto 0.25 to 0.75. Resembling the bound ligand is deliberately weaker evidence than documented pharmacology.
- It is a 2D fingerprint comparison, not docking, and does not estimate binding.

`src/structuralSimilarity.test.js` includes a held-out check: the same compounds are scored with their names replaced, which removes the curated-rule signal entirely. Without similarity the known inhibitor is indistinguishable from an unrelated stimulant; with it, the co-crystal analogue is recovered without using its name.

Equally scored compounds now share a rank (`tiedWithPrevious`) instead of being ordered by the alphabetical accident of their compound id.

### Compound Libraries

Station 2 of the staging bench works two ways: add up to five compounds by name from PubChem, or screen a whole committed library against the staged structure.

| Library | Contents | Size |
|---|---|---|
| `approved` | Curated marketed small-molecule drugs | ~2,983 |
| `clinical` | ChEMBL small molecules that reached Phase 2 or beyond, one entry per base drug name | ~9,409 |

Both are committed JSON snapshots under `public/data`; nothing is fetched from an external API at request time, so a screen cannot change because someone else's database changed. Rebuild the clinical set with:

```bash
node scripts/build-clinical-library.mjs
```

The screen is the same code path as the Repurposing page, parameterised by `libraryId`, and the daily cache is keyed per target **and** library. A 9.4k screen takes about 12 seconds server-side; 2.9k takes about 4. Roughly 10k is the practical ceiling for loading a library into memory per request — past that, move the compounds and precomputed fingerprints into a database.

Library screening is where structural similarity earns its place. Screening the clinical set against EGFR (1M17) surfaces Icotinib (Tanimoto 0.55) and Theliatinib (0.51) at ranks 8 and 9. Neither is in the approved library, and neither is named in any target rule — the name-based rules report "no established relevance" for both. Only the fingerprint comparison to the bound ligand finds them.

ChEMBL data is released under CC BY-SA 3.0; keep the attribution if you redistribute the snapshot.

### Clinical Activity

Expanding a row in Target Discovery fetches that target's clinical history from Open Targets, scoped to the disease you searched. Three states:

| State | Meaning |
| --- | --- |
| No clinical programme | Nobody has taken this target into the clinic for this disease |
| Trials ongoing | Active programmes, with the highest phase reached |
| Stopped: efficacy or safety | A programme was tested and stopped for a scientific reason |

Two measurements shaped the design:

- **Coverage is low by construction.** Of the top 25 discovered targets, 28% (pancreatic) and 16% (ALS) have any clinical candidate, because the undrugged view selects for targets with no drug for the searched disease. A signal absent from ~75% of rows cannot be a ranking weight without distorting it, so this is shown alongside the scores and never folded in.
- **Most stopped trials did not fail scientifically.** Recorded stop reasons across pancreatic targets: Insufficient_Enrollment 730, Business_Administrative 527, against Negative 189. Only `Negative` and `Safety_Sideeffects` are counted as setbacks; the rest are reported separately.

Candidate counts from Open Targets are global across indications, so they are filtered by ontology id before display — TUBA4A reports 85 candidates overall but only one for ALS. The counts are trials of drugs that list the target, not trials of the target alone, so a broadly used drug inflates them; the panel says so.

Fetched lazily per row: the heaviest target measured pulled 1.55 MB of trial records.

### Auditing the Target Selection Score

```bash
node scripts/audit-target-score-variance.mjs 150
```

Scores a sample of real PDB entries and reports how much each weighted axis varies. On a 150-entry sample, completeness (25 pts) and method (15 pts) together accounted for about 3.6% of the total spread — 40 of 100 points that barely separate structures — while ligand presence (20 pts) accounted for ~25%. Re-run it before changing the weights.

### Historical Phase Transition & Trial Completion Context

`scripts/build-trial-success-rates.mjs` builds `server/data/trialSuccessRates.json` from ClinicalTrials.gov API v2 using intervention queries (`query.intr`) constructed from each category's curated `TARGET_RULES` `onTargetDrugs` list (or the union of family rules' drug lists for broad classes), and post-filters fetched trials so only studies whose listed drug interventions match a drug in that list (case-insensitive, stripping pharmaceutical salt forms such as `hydrochloride` or `mesylate`) are retained. Kept trials are grouped by drug to compute **phase transition rates** (for Phase $k \in \{1, 2\}$, a drug advances if it has any trial at a later phase $> k$; drugs that have not advanced and whose most recent Phase-$k$ trial started fewer than 3 years before generation are right-censored and excluded from the denominator). **Trial completion rates** ($\text{COMPLETED} / (\text{COMPLETED} + \text{TERMINATED} + \text{WITHDRAWN} + \text{SUSPENDED})$) are reported separately as a secondary operational metric, with combined `PHASE1/PHASE2` and `PHASE2/PHASE3` trials isolated in a `COMBINED` bucket, `whyStopped` text classified by transparent keyword rules into `efficacy`, `safety`, `operational`, and `unknown` (alongside an excluding-operational-stops completion rate), and `UNKNOWN`-status trials reported with a sensitivity rate treating `UNKNOWN` as non-completed. Every rate stores its numerator, denominator, and 95% Wilson score confidence interval, and only displays a percentage when $n \ge 30$ drugs (for transitions) or $n \ge 30$ trials (for completion), stratified by oncology vs. non-oncology trial conditions. Known limits: Phase 3 $\rightarrow$ regulatory approval cannot be measured from ClinicalTrials.gov (and is reported as unavailable), curated `onTargetDrugs` lists are mostly small sets of approved drugs ($n < 30$ drugs per target class), and drug-name intervention matching can miss unindexed research codes or non-standard synonyms.

---

## Code Layout: UI in the Browser, Calculations on the Server

All scoring, screening and analysis code lives in `server/` and never ships to the browser. Create React App refuses to bundle files outside `src/`, so nothing in `server/` can leak into the production build by accident.

- `src/` — UI only. Pages call `src/serverApi.js`, which keeps the original function names (`searchPdbTargets`, `screenApprovedLibrary`, `runEvolutionCampaign`, …) but runs them on the server. `src/shared/` holds display-only constants and formatters (example compounds, chart geometry, colour tables); keep algorithms out of it.
- `api/compute.js` — one Vercel function that runs any allow-listed operation and streams progress callbacks back as newline-delimited JSON.
- `server/compute.js` — the allow-list. To expose a new calculation, add it here and a matching export in `src/serverApi.js`.
- `server/runtime.js` — lets server code `fetch("/api/...")` and `fetch("/data/...")` in-process.

Production builds set `GENERATE_SOURCEMAP=false`, so readable source is never published. Requires Node 22+ (see `engines` in `package.json`).

---

## Local Development

```bash
# Install dependencies
npm install

# Start the local dev server (Create React App, port 3000)
npm start

# Build production distribution
npm run build

# Run linting checks
npm run lint

# Run the test suite (612 tests, including the provenance and copy guards)
CI=true npm test
```

`npm run build` is more than `react-scripts build`: it regenerates derived assets, then runs `scripts/inject-seo-html.mjs` to write crawlable HTML and per-route metadata. **Verify with `npm run build`, never `npx react-scripts build`** — a deploy once failed on a Node ESM resolution error in that post-build step that the bundler alone never reached.

---

## Reproducible Benchmarks

Every benchmark harness in `benchmark/docking/scripts/` (Python/AutoDock Vina/RDKit/Open Babel and Node) runs inside a single container defined by `benchmark/Dockerfile` with all tool versions pinned explicitly (Python `3.12.8`, RDKit `2024.9.5`, AutoDock Vina `1.2.5`, Open Babel `3.1.1`, PDB2PQR `3.6.2`, PROPKA `3.5.1`, Meeko `0.8.0`, gemmi `0.7.5`, spyrmsd `0.9.0`, NumPy `1.26.4`, SciPy `1.14.1`, Node `22.14.0`, `@rdkit/rdkit` `2025.3.4-1.0.0`).

The committed Open Targets `21.04` retrospective snapshot (`benchmark/docking/data/task3_ot_21_04_retrospective_snapshot.json.gz`) and pre-2021 target feature table (`benchmark/docking/data/task8_target_features.json.gz`) are bind-mounted from the repository into `/workspace` rather than re-downloaded.

```bash
# 1. Clone
git clone https://github.com/prabhavjain85-ui/targetforge.git
cd targetforge

# 2. Build the pinned benchmark image (optional: `make benchmark` builds automatically if absent)
make benchmark-build
make benchmark-check

# 3. One command to run every harness in benchmark/docking/scripts/
make benchmark
# or:
./run-benchmarks.sh
```

Expected generated files written back into the working tree:
- `benchmark/docking/results/task1_four_rankers.json` & `benchmark/docking/TASK1_BASELINES.md`
- `benchmark/docking/data/task2_scaffold_property_matched_benchmark.json`, `benchmark/docking/results/task2_four_rankers.json` & `benchmark/docking/TASK2_DECOY_BENCHMARK.md`
- `benchmark/docking/results/task3_novelty_validation.json` & `benchmark/docking/TASK3_NOVELTY_VALIDATION.md`
- `benchmark/docking/results/task4_attention_control.json` & `benchmark/docking/TASK4_ATTENTION_CONTROL.md`
- `benchmark/docking/results/task6_vina_vs_tanimoto.json` & `benchmark/docking/TASK6_VINA_VS_TANIMOTO.md`
- `benchmark/docking/results/task7_cancer_stratification.json` & `benchmark/docking/TASK7_CANCER_STRATIFICATION.md`
- `benchmark/docking/results/task8_tractability.json` & `benchmark/docking/TASK8_TRACTABILITY.md`
- `benchmark/docking/results/task10_repurposing_validation.json` & `benchmark/docking/TASK10_REPURPOSING.md`
- `benchmark/docking/results/task12_end_to_end.json` & `benchmark/docking/TASK12_END_TO_END.md`
- `benchmark/docking/results/redock_multiseed.json`, `approved_25.json`, `pair_sanity_checks.json`, `enrichment.json`, and `benchmark/docking/RESULTS.md`

