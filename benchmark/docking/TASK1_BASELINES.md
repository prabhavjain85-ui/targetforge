# Task 1 — Four-Ranker Baseline Evaluation

- **Generated at:** `2026-11-16T07:47:13.906Z`
- **Benchmark file:** `task1_chembl_weak_binder_benchmark`
- **Split protocol:** `molecule_chembl_id_md5`
- **Decoy protocol:** `chembl_weak_binders_pchembl_lt_5`
- **Targets passing full decoy sanity checks (count + ratio + 1D property balance):** **3 / 15** (EGFR, JAK2, HDAC1)
- **Targets passing sample-count checks only (≥15 actives, ≥30 decoys, ratio ≥1.5):** **11 / 15**

## Primary Finding

> **Finding:** heuristic-v2 DOES NOT beat (c) Tanimoto to the staged co-crystal ligand on ROC-AUC (0.583 vs 0.777 on the 3/15 sanity-passing targets; 0.457 vs 0.673 on the 11/15 count-passing targets; 0.513 vs 0.684 across all 15 targets) or BEDROC(alpha=20) (0.631 vs 0.854 on sanity-passing; 0.345 vs 0.545 on count-passing). Furthermore, without pre-staged co-crystal similarity annotation, heuristic-v2 (rule table only) DOES NOT beat (b) drug-likeness only (0.344 vs 0.344 on count-passing targets; 0.464 vs 0.464 on sanity-passing targets; 0.407 vs 0.407 across all 15 targets), scoring below random chance (~0.34–0.46 AUC) because hardcoded drug-name rules never fire on held-out molecules and Lipinski/Veber points favor smaller weak binders over potent actives.

### Why `heuristic-v2` Fails to Beat Continuous Tanimoto (c) and Collapses Toward Drug-Likeness Only (b)

1. **Name-matched rules cannot fire on held-out chemistry:** `TARGET_RULES` in `server/scoreCandidates.js` matches compounds by generic drug name (`onTargetRe`) or pre-labeled indication string (`drugClass`). On held-out ChEMBL molecules (`CHEMBL...`), the `+55` on-target name bonus and `+20` co-crystal name bonus fire on **0%** of test compounds.
2. **Rule-table-only `heuristic-v2` (`d-0`) is algebraically identical to drug-likeness only (`b`) on held-out compounds:** Without pre-staged co-crystal Tanimoto similarity, `targetBonus = 0` and `ligandBonus = 0` for every novel molecule, reducing `heuristic-v2` to `druglikePts - alertPenalty`. Because potent ChEMBL actives (`pChEMBL >= 6`) have higher molecular weight and lipophilicity on average than weak binders (`pChEMBL < 5`), `druglikePts` scores actives *lower* than decoys (**mean ROC-AUC 0.344** across the 11 count-passing targets; **0.464** on the 3 sanity-passing targets; **0.407** across all 15 targets — below random chance).
3. **Even with staged co-crystal similarity (`d`), the 0.25 floor and 24-pt drug-likeness term degrade ranking relative to pure Tanimoto (`c`):** `scoreCandidates.js` zeroes out all Tanimoto similarities `<= 0.25` (`SIMILARITY_FLOOR = 0.25`) and adds up to `+24` points of generic drug-likeness (`druglikePts`). As a result, `heuristic-v2` (**mean ROC-AUC 0.583** on the 3 sanity-passing targets, **0.457** on the 11 count-passing targets, **0.513** across all 15 targets) **does not beat** pure Tanimoto to the staged co-crystal ligand `(c)` (**mean ROC-AUC 0.777** on the 3 sanity-passing targets, **0.673** on the 11 count-passing targets, **0.684** across all 15 targets).

## Table 1A — Summary Across Sanity-Passing Targets (3/15 targets: EGFR, JAK2, HDAC1)

| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |
|---|---:|---:|---:|---:|:---:|:---:|
| (a) Random (seeded uniform) | 0.439 (0.284–0.603) | 2.56 | 1.59 | 0.348 | No | No |
| (b) Drug-likeness only (no target term) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |
| (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.777 (0.611–0.913) | 3.78 | 3.78 | 0.854 | Yes | No |
| (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.583 (0.430–0.740) | 2.82 | 2.82 | 0.631 | Yes | No |
| (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |

## Table 1B — Summary Across Count-Passing Targets (11/15 targets with ≥15 Actives & ≥30 Decoys)

| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |
|---|---:|---:|---:|---:|:---:|:---:|
| (a) Random (seeded uniform) | 0.486 (0.329–0.649) | 1.68 | 1.49 | 0.331 | Yes | No |
| (b) Drug-likeness only (no target term) | 0.344 (0.213–0.486) | 0.60 | 0.60 | 0.167 | No | No |
| (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.673 (0.549–0.793) | 1.96 | 1.97 | 0.545 | Yes | No |
| (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.457 (0.322–0.593) | 1.20 | 1.31 | 0.345 | Yes | No |
| (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.344 (0.213–0.486) | 0.60 | 0.60 | 0.167 | No | No |

## Table 1C — Summary Across All Evaluable Targets in 15-Target Panel (15/15 targets)

| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |
|---|---:|---:|---:|---:|:---:|:---:|
| (a) Random (seeded uniform) | 0.502 (0.336–0.670) | 1.37 | 1.42 | 0.341 | Yes | No |
| (b) Drug-likeness only (no target term) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |
| (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.684 (0.542–0.817) | 2.37 | 2.18 | 0.613 | Yes | No |
| (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.513 (0.374–0.649) | 1.58 | 1.66 | 0.437 | Yes | No |
| (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |

## Table 2 — Per-Target Four-Ranker Breakdown (All 15 Targets)

| Target (Gene / PDB) | Sanity Pass | Test Act / Dec | Ranker | ROC-AUC (95% CI) | EF@1% | EF@5% | BEDROC(α=20) |
|---|:---:|---:|---|---:|---:|---:|---:|
| egfr (EGFR / 1M17) | PASS | 15 / 50 | (a) Random (seeded uniform) | 0.411 (0.234–0.585) | 4.33 | 1.44 | 0.363 |
| egfr (EGFR / 1M17) | PASS | 15 / 50 | (b) Drug-likeness only (no target term) | 0.387 (0.237–0.558) | 0.65 | 0.65 | 0.151 |
| egfr (EGFR / 1M17) | PASS | 15 / 50 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.795 (0.588–0.943) | 4.33 | 4.33 | 0.747 |
| egfr (EGFR / 1M17) | PASS | 15 / 50 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.518 (0.332–0.712) | 4.33 | 4.33 | 0.723 |
| egfr (EGFR / 1M17) | PASS | 15 / 50 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.387 (0.237–0.558) | 0.65 | 0.65 | 0.151 |
| erbb2 (ERBB2 / 3PP0) | FAIL | 18 / 38 | (a) Random (seeded uniform) | 0.434 (0.284–0.607) | 0.00 | 1.04 | 0.204 |
| erbb2 (ERBB2 / 3PP0) | FAIL | 18 / 38 | (b) Drug-likeness only (no target term) | 0.169 (0.065–0.295) | 0.00 | 0.00 | 0.003 |
| erbb2 (ERBB2 / 3PP0) | FAIL | 18 / 38 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.902 (0.818–0.977) | 3.11 | 2.07 | 0.724 |
| erbb2 (ERBB2 / 3PP0) | FAIL | 18 / 38 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.170 (0.068–0.294) | 0.00 | 0.00 | 0.003 |
| erbb2 (ERBB2 / 3PP0) | FAIL | 18 / 38 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.169 (0.065–0.295) | 0.00 | 0.00 | 0.003 |
| abl1 (ABL1 / 1IEP) | FAIL | 14 / 43 | (a) Random (seeded uniform) | 0.527 (0.344–0.698) | 0.00 | 1.36 | 0.241 |
| abl1 (ABL1 / 1IEP) | FAIL | 14 / 43 | (b) Drug-likeness only (no target term) | 0.516 (0.377–0.655) | 0.25 | 0.25 | 0.064 |
| abl1 (ABL1 / 1IEP) | FAIL | 14 / 43 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.804 (0.651–0.928) | 4.07 | 4.07 | 0.907 |
| abl1 (ABL1 / 1IEP) | FAIL | 14 / 43 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.763 (0.594–0.909) | 4.07 | 4.07 | 0.929 |
| abl1 (ABL1 / 1IEP) | FAIL | 14 / 43 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.516 (0.377–0.655) | 0.25 | 0.25 | 0.064 |
| braf (BRAF / 4XV2) | FAIL | 18 / 38 | (a) Random (seeded uniform) | 0.515 (0.358–0.682) | 0.00 | 1.04 | 0.202 |
| braf (BRAF / 4XV2) | FAIL | 18 / 38 | (b) Drug-likeness only (no target term) | 0.313 (0.161–0.468) | 0.72 | 0.72 | 0.230 |
| braf (BRAF / 4XV2) | FAIL | 18 / 38 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.623 (0.470–0.785) | 0.00 | 0.00 | 0.164 |
| braf (BRAF / 4XV2) | FAIL | 18 / 38 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.313 (0.161–0.468) | 0.72 | 0.72 | 0.230 |
| braf (BRAF / 4XV2) | FAIL | 18 / 38 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.313 (0.161–0.468) | 0.72 | 0.72 | 0.230 |
| jak2 (JAK2 / 4JI9) | PASS | 16 / 43 | (a) Random (seeded uniform) | 0.326 (0.192–0.491) | 0.00 | 0.00 | 0.030 |
| jak2 (JAK2 / 4JI9) | PASS | 16 / 43 | (b) Drug-likeness only (no target term) | 0.395 (0.238–0.562) | 0.78 | 0.78 | 0.213 |
| jak2 (JAK2 / 4JI9) | PASS | 16 / 43 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.762 (0.619–0.886) | 3.69 | 3.69 | 0.886 |
| jak2 (JAK2 / 4JI9) | PASS | 16 / 43 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.395 (0.238–0.562) | 0.78 | 0.78 | 0.213 |
| jak2 (JAK2 / 4JI9) | PASS | 16 / 43 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.395 (0.238–0.562) | 0.78 | 0.78 | 0.213 |
| adrb2 (ADRB2 / 3SN6) | FAIL | 15 / 43 | (a) Random (seeded uniform) | 0.584 (0.404–0.754) | 3.87 | 2.58 | 0.587 |
| adrb2 (ADRB2 / 3SN6) | FAIL | 15 / 43 | (b) Drug-likeness only (no target term) | 0.278 (0.151–0.421) | 0.00 | 0.00 | 0.016 |
| adrb2 (ADRB2 / 3SN6) | FAIL | 15 / 43 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.290 (0.139–0.451) | 0.00 | 0.00 | 0.020 |
| adrb2 (ADRB2 / 3SN6) | FAIL | 15 / 43 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.278 (0.151–0.421) | 0.00 | 0.00 | 0.016 |
| adrb2 (ADRB2 / 3SN6) | FAIL | 15 / 43 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.278 (0.151–0.421) | 0.00 | 0.00 | 0.016 |
| ptgs2 (PTGS2 / 1CX2) | FAIL | 18 / 43 | (a) Random (seeded uniform) | 0.548 (0.393–0.706) | 0.00 | 1.13 | 0.279 |
| ptgs2 (PTGS2 / 1CX2) | FAIL | 18 / 43 | (b) Drug-likeness only (no target term) | 0.287 (0.164–0.435) | 0.48 | 0.48 | 0.143 |
| ptgs2 (PTGS2 / 1CX2) | FAIL | 18 / 43 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.628 (0.488–0.778) | 0.00 | 0.00 | 0.236 |
| ptgs2 (PTGS2 / 1CX2) | FAIL | 18 / 43 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.488 (0.313–0.674) | 0.00 | 0.00 | 0.174 |
| ptgs2 (PTGS2 / 1CX2) | FAIL | 18 / 43 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.287 (0.164–0.435) | 0.48 | 0.48 | 0.143 |
| hmgcr (HMGCR / 1HWK) | FAIL | 13 / 13 | (a) Random (seeded uniform) | 0.710 (0.494–0.899) | 2.00 | 2.00 | 0.945 |
| hmgcr (HMGCR / 1HWK) | FAIL | 13 / 13 | (b) Drug-likeness only (no target term) | 0.967 (0.893–1.000) | 2.00 | 2.00 | 1.000 |
| hmgcr (HMGCR / 1HWK) | FAIL | 13 / 13 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.846 (0.650–1.000) | 2.00 | 2.00 | 0.983 |
| hmgcr (HMGCR / 1HWK) | FAIL | 13 / 13 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.964 (0.889–1.000) | 2.00 | 2.00 | 1.000 |
| hmgcr (HMGCR / 1HWK) | FAIL | 13 / 13 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.967 (0.893–1.000) | 2.00 | 2.00 | 1.000 |
| dpp4 (DPP4 / 4A5S) | FAIL | 18 / 46 | (a) Random (seeded uniform) | 0.500 (0.319–0.662) | 3.56 | 2.37 | 0.499 |
| dpp4 (DPP4 / 4A5S) | FAIL | 18 / 46 | (b) Drug-likeness only (no target term) | 0.231 (0.105–0.370) | 0.42 | 0.42 | 0.118 |
| dpp4 (DPP4 / 4A5S) | FAIL | 18 / 46 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.565 (0.420–0.707) | 0.00 | 1.19 | 0.257 |
| dpp4 (DPP4 / 4A5S) | FAIL | 18 / 46 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.231 (0.105–0.370) | 0.42 | 0.42 | 0.118 |
| dpp4 (DPP4 / 4A5S) | FAIL | 18 / 46 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.231 (0.105–0.370) | 0.42 | 0.42 | 0.118 |
| hivpr (HIV1PR / 1HVR) | FAIL | 14 / 34 | (a) Random (seeded uniform) | 0.468 (0.301–0.647) | 0.00 | 0.00 | 0.120 |
| hivpr (HIV1PR / 1HVR) | FAIL | 14 / 34 | (b) Drug-likeness only (no target term) | 0.236 (0.112–0.371) | 0.00 | 0.00 | 0.000 |
| hivpr (HIV1PR / 1HVR) | FAIL | 14 / 34 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.622 (0.416–0.824) | 3.43 | 3.43 | 0.773 |
| hivpr (HIV1PR / 1HVR) | FAIL | 14 / 34 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.298 (0.159–0.445) | 0.00 | 0.00 | 0.002 |
| hivpr (HIV1PR / 1HVR) | FAIL | 14 / 34 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.236 (0.112–0.371) | 0.00 | 0.00 | 0.000 |
| sars_mpro (MPRO / 7BQY) | FAIL | 16 / 49 | (a) Random (seeded uniform) | 0.565 (0.418–0.725) | 0.00 | 0.00 | 0.161 |
| sars_mpro (MPRO / 7BQY) | FAIL | 16 / 49 | (b) Drug-likeness only (no target term) | 0.758 (0.621–0.871) | 1.81 | 1.81 | 0.448 |
| sars_mpro (MPRO / 7BQY) | FAIL | 16 / 49 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.152 (0.035–0.308) | 0.00 | 0.00 | 0.051 |
| sars_mpro (MPRO / 7BQY) | FAIL | 16 / 49 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.738 (0.592–0.859) | 0.00 | 1.20 | 0.329 |
| sars_mpro (MPRO / 7BQY) | FAIL | 16 / 49 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.758 (0.621–0.871) | 1.81 | 1.81 | 0.448 |
| pde5a (PDE5A / 1UDT) | FAIL | 18 / 44 | (a) Random (seeded uniform) | 0.578 (0.406–0.740) | 3.44 | 3.44 | 0.662 |
| pde5a (PDE5A / 1UDT) | FAIL | 18 / 44 | (b) Drug-likeness only (no target term) | 0.235 (0.095–0.390) | 0.51 | 0.51 | 0.149 |
| pde5a (PDE5A / 1UDT) | FAIL | 18 / 44 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 1.000 (1.000–1.000) | 3.44 | 3.44 | 1.000 |
| pde5a (PDE5A / 1UDT) | FAIL | 18 / 44 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.944 (0.827–1.000) | 3.44 | 3.44 | 0.998 |
| pde5a (PDE5A / 1UDT) | FAIL | 18 / 44 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.235 (0.095–0.390) | 0.51 | 0.51 | 0.149 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 18 / 42 | (a) Random (seeded uniform) | 0.579 (0.425–0.733) | 3.33 | 3.33 | 0.651 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 18 / 42 | (b) Drug-likeness only (no target term) | 0.609 (0.466–0.754) | 1.11 | 1.11 | 0.334 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 18 / 42 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.773 (0.627–0.908) | 3.33 | 3.33 | 0.929 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 18 / 42 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.835 (0.719–0.945) | 3.33 | 3.33 | 0.957 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 18 / 42 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.609 (0.466–0.754) | 1.11 | 1.11 | 0.334 |
| esr1 (ESR1 / 3ERT) | FAIL | 18 / 47 | (a) Random (seeded uniform) | 0.311 (0.187–0.454) | 0.00 | 0.00 | 0.003 |
| esr1 (ESR1 / 3ERT) | FAIL | 18 / 47 | (b) Drug-likeness only (no target term) | 0.116 (0.034–0.224) | 0.12 | 0.12 | 0.035 |
| esr1 (ESR1 / 3ERT) | FAIL | 18 / 47 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.913 (0.835–0.974) | 3.61 | 3.61 | 0.981 |
| esr1 (ESR1 / 3ERT) | FAIL | 18 / 47 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.116 (0.034–0.224) | 0.12 | 0.12 | 0.035 |
| esr1 (ESR1 / 3ERT) | FAIL | 18 / 47 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.116 (0.034–0.224) | 0.12 | 0.12 | 0.035 |
| thrombin (F2 / 1PPB) | FAIL | 12 / 42 | (a) Random (seeded uniform) | 0.476 (0.285–0.662) | 0.00 | 1.50 | 0.166 |
| thrombin (F2 / 1PPB) | FAIL | 12 / 42 | (b) Drug-likeness only (no target term) | 0.608 (0.404–0.790) | 2.25 | 1.95 | 0.409 |
| thrombin (F2 / 1PPB) | FAIL | 12 / 42 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.585 (0.383–0.782) | 4.50 | 1.50 | 0.537 |
| thrombin (F2 / 1PPB) | FAIL | 12 / 42 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.646 (0.423–0.856) | 4.50 | 4.50 | 0.832 |
| thrombin (F2 / 1PPB) | FAIL | 12 / 42 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.608 (0.404–0.790) | 2.25 | 1.95 | 0.409 |

## Table 3 — Decoy Sanity Audit (15-Target Panel)

| Target ID | Gene | ChEMBL ID | PDB | Lig | Test Actives | Test Decoys | Ratio | ΔMW (Da) | ΔcLogP | Sanity Check | Failure Reason |
|---|---|---|---|---|---:|---:|---:|---:|---:|:---:|---|
| egfr | EGFR | CHEMBL203 | 1M17 | AQ4 | 15 | 50 | 3.33 | +29 | -0.12 | PASS | — |
| erbb2 | ERBB2 | CHEMBL1824 | 3PP0 | 03Q | 18 | 38 | 2.11 | +121.4 | +0.43 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.169, |AUC-0.5|=0.331 > 0.15; ΔMW=+121.4 Da, ΔcLogP=+0.43) |
| abl1 | ABL1 | CHEMBL1862 | 1IEP | STI | 14 | 43 | 3.07 | -74.9 | +1.17 | FAIL | insufficient_test_actives (14 < 15) |
| braf | BRAF | CHEMBL5145 | 4XV2 | P06 | 18 | 38 | 2.11 | +32.5 | +0.38 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.313, |AUC-0.5|=0.187 > 0.15; ΔMW=+32.5 Da, ΔcLogP=+0.38) |
| jak2 | JAK2 | CHEMBL2971 | 4JI9 | 1M3 | 16 | 43 | 2.69 | +91.1 | +0.69 | PASS | — |
| adrb2 | ADRB2 | CHEMBL210 | 3SN6 | P0G | 15 | 43 | 2.87 | +90.8 | +1.51 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.278, |AUC-0.5|=0.222 > 0.15; ΔMW=+90.8 Da, ΔcLogP=+1.51) |
| ptgs2 | PTGS2 | CHEMBL230 | 1CX2 | S58 | 18 | 43 | 2.39 | +10.4 | +0.8 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.287, |AUC-0.5|=0.213 > 0.15; ΔMW=+10.4 Da, ΔcLogP=+0.8) |
| hmgcr | HMGCR | CHEMBL402 | 1HWK | 117 | 13 | 13 | 1.00 | -86.7 | +1.1 | FAIL | insufficient_test_actives (13 < 15) |
| dpp4 | DPP4 | CHEMBL284 | 4A5S | N7F | 18 | 46 | 2.56 | +84.7 | -0.63 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.231, |AUC-0.5|=0.269 > 0.15; ΔMW=+84.7 Da, ΔcLogP=-0.63) |
| hivpr | HIV1PR | CHEMBL243 | 1HVR | XK2 | 14 | 34 | 2.43 | +76.6 | -0.33 | FAIL | insufficient_test_actives (14 < 15) |
| sars_mpro | MPRO | CHEMBL4523582 | 7BQY | N3 | 16 | 49 | 3.06 | -139.6 | -1.95 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.758, |AUC-0.5|=0.258 > 0.15; ΔMW=-139.6 Da, ΔcLogP=-1.95) |
| pde5a | PDE5A | CHEMBL1827 | 1UDT | VIA | 18 | 44 | 2.44 | +119 | -1.48 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.235, |AUC-0.5|=0.265 > 0.15; ΔMW=+119 Da, ΔcLogP=-1.48) |
| hdac1 | HDAC1 | CHEMBL325 | 4LXZ | SHH | 18 | 42 | 2.33 | -58 | -0.02 | PASS | — |
| esr1 | ESR1 | CHEMBL206 | 3ERT | OHT | 18 | 47 | 2.61 | +90.7 | +2.25 | FAIL | property_mismatch_1d_bias (druglikeness_only AUC=0.116, |AUC-0.5|=0.384 > 0.15; ΔMW=+90.7 Da, ΔcLogP=+2.25) |
| thrombin | F2 | CHEMBL204 | 1PPB | 0G6 | 12 | 42 | 3.50 | -3.8 | +1 | FAIL | insufficient_test_actives (12 < 15) |
