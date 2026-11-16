# Task 2 — Property-Matched Decoy Benchmark, Bemis–Murcko Scaffold Split & AVE Bias Report

- **Generated at:** `2026-11-16T08:54:59.237Z`
- **Before (Task 1):** `task1_chembl_weak_binder_benchmark` — ChEMBL weak binders (`pChEMBL < 5.0`), MD5 molecule-ID split (**3/15** targets passing decoy sanity checks)
- **After (Task 2):** `task2_scaffold_property_matched_benchmark` — DUD-E/DEKOIS 6-property-matched decoys (MW, cLogP, RotB, HBD, HBA, formal charge) with ECFP4 Tanimoto ceiling `<= 0.35` to all target actives, Bemis–Murcko scaffold splitting (**14/15** targets passing all decoy sanity checks)

## Key Findings (Before vs After Fixing the Benchmark)

1. **Decoy sanity pass rate increased from 3/15 to 14/15 targets:** Matching MW, cLogP, rotatable bonds, HBD, HBA, and formal charge per active eliminates the 1D physicochemical mismatch present in ChEMBL weak binders (where `druglikeness_only` deviated strongly from 0.50 on 8/11 targets and 4/15 targets lacked sufficient test actives). On the rebuilt benchmark, `(b) Drug-likeness only` sits at **mean ROC-AUC 0.482** (near random 0.500, as required for property-matched decoys).
2. **Eliminating molecule-ID analog leakage via Bemis–Murcko scaffold splitting reduces AVE bias and removes leaked scaffolds:** Removing shared scaffolds between train and test reduces mean per-target AVE bias from **0.583** (with up to 18 leaked scaffolds per target) to **0.099** (with **0** leaked scaffolds across all 15 targets).
3. **`heuristic-v2` STILL fails to beat `(c) Tanimoto to the staged co-crystal ligand` on the fixed benchmark:** On the rebuilt scaffold-split benchmark (14/15 sanity-passing targets), `(c) Tanimoto to the staged co-crystal ligand` achieves **mean ROC-AUC 0.662** (**EF@1% 2.57**, **EF@5% 2.71**, **BEDROC(20) 0.617**), whereas `(d) heuristic-v2` scores **mean ROC-AUC 0.523** (**EF@1% 2.41**, **EF@5% 2.13**, **BEDROC(20) 0.436**) — and rule-table-only `heuristic-v2 (d-0)` scores **0.482** (identical to `(b) drug-likeness only` at **0.482** and random chance).

## Table 1 — Before vs After Four-Ranker Comparison (Task 1 Legacy vs Task 2 Rebuilt Benchmark)

| Benchmark & Subset | Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b)? | Beats (c)? |
|---|---|---:|---:|---:|---:|:---:|:---:|
| BEFORE: Legacy ChEMBL Weak Binders — Sanity-Passing (3/15) | (a) Random (seeded uniform) | 0.439 (0.284–0.603) | 2.56 | 1.59 | 0.348 | No | No |
| BEFORE: Legacy ChEMBL Weak Binders — Sanity-Passing (3/15) | (b) Drug-likeness only (no target term) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |
| BEFORE: Legacy ChEMBL Weak Binders — Sanity-Passing (3/15) | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.777 (0.611–0.913) | 3.78 | 3.78 | 0.854 | Yes | No |
| BEFORE: Legacy ChEMBL Weak Binders — Sanity-Passing (3/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.583 (0.430–0.740) | 2.82 | 2.82 | 0.631 | Yes | No |
| BEFORE: Legacy ChEMBL Weak Binders — Sanity-Passing (3/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |
| BEFORE: Legacy ChEMBL Weak Binders — All Targets (15/15) | (a) Random (seeded uniform) | 0.502 (0.336–0.670) | 1.37 | 1.42 | 0.341 | Yes | No |
| BEFORE: Legacy ChEMBL Weak Binders — All Targets (15/15) | (b) Drug-likeness only (no target term) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |
| BEFORE: Legacy ChEMBL Weak Binders — All Targets (15/15) | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.684 (0.542–0.817) | 2.37 | 2.18 | 0.613 | Yes | No |
| BEFORE: Legacy ChEMBL Weak Binders — All Targets (15/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.513 (0.374–0.649) | 1.58 | 1.66 | 0.437 | Yes | No |
| BEFORE: Legacy ChEMBL Weak Binders — All Targets (15/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |
| AFTER: Property-Matched + Scaffold Split — Sanity-Passing (14/15) | (a) Random (seeded uniform) | 0.520 (0.361–0.681) | 1.14 | 1.38 | 0.330 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — Sanity-Passing (14/15) | (b) Drug-likeness only (no target term) | 0.482 (0.325–0.642) | 0.95 | 0.95 | 0.238 | No | No |
| AFTER: Property-Matched + Scaffold Split — Sanity-Passing (14/15) | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.662 (0.505–0.805) | 2.57 | 2.71 | 0.617 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — Sanity-Passing (14/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.523 (0.356–0.687) | 2.41 | 2.13 | 0.436 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — Sanity-Passing (14/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.482 (0.325–0.642) | 0.95 | 0.95 | 0.238 | No | No |
| AFTER: Property-Matched + Scaffold Split — All Targets (15/15) | (a) Random (seeded uniform) | 0.519 (0.358–0.681) | 1.07 | 1.38 | 0.327 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — All Targets (15/15) | (b) Drug-likeness only (no target term) | 0.482 (0.323–0.642) | 0.95 | 0.95 | 0.237 | No | No |
| AFTER: Property-Matched + Scaffold Split — All Targets (15/15) | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.653 (0.494–0.798) | 2.67 | 2.80 | 0.619 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — All Targets (15/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.520 (0.353–0.684) | 2.32 | 2.05 | 0.422 | Yes | No |
| AFTER: Property-Matched + Scaffold Split — All Targets (15/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.482 (0.323–0.642) | 0.95 | 0.95 | 0.237 | No | No |

## Table 2 — Per-Target AVE Analog-Bias & Decoy Sanity Audit (Before vs After)

| Target (Gene) | Before: Leaked Scaffolds | After: Leaked Scaffolds | Before: AVE Bias (AA−AI / II−IA) | After: AVE Bias (AA−AI / II−IA) | After: Max Decoy–Active Tanimoto | After: ΔMW (Da) / ΔcLogP | Before Sanity | After Sanity |
|---|---:|---:|---:|---:|---:|---:|:---:|:---:|
| egfr (EGFR) | 16 | 0 | 0.650 (0.351 / 0.299) | 0.085 (0.028 / 0.057) | 0.329 | -1 / +0.14 | PASS | PASS |
| erbb2 (ERBB2) | 16 | 0 | 0.600 (0.226 / 0.375) | 0.096 (0.061 / 0.035) | 0.288 | +1.2 / +0.07 | FAIL | PASS |
| abl1 (ABL1) | 15 | 0 | 0.467 (0.101 / 0.366) | 0.027 (-0.012 / 0.039) | 0.302 | -1.2 / +0.2 | FAIL | PASS |
| braf (BRAF) | 15 | 0 | 0.735 (0.247 / 0.489) | 0.038 (-0.001 / 0.039) | 0.323 | -4.7 / +0.14 | FAIL | PASS |
| jak2 (JAK2) | 10 | 0 | 0.628 (0.395 / 0.233) | -0.004 (-0.030 / 0.027) | 0.347 | -8.8 / +0.08 | PASS | PASS |
| adrb2 (ADRB2) | 10 | 0 | 0.565 (0.230 / 0.335) | 0.237 (0.179 / 0.058) | 0.288 | +5.5 / +0.11 | FAIL | PASS |
| ptgs2 (PTGS2) | 14 | 0 | 0.299 (0.052 / 0.247) | 0.091 (0.032 / 0.059) | 0.259 | -4.3 / -0.02 | FAIL | PASS |
| hmgcr (HMGCR) | 11 | 0 | 0.743 (0.343 / 0.400) | 0.058 (0.026 / 0.032) | 0.350 | +8.9 / -0.47 | FAIL | PASS |
| dpp4 (DPP4) | 18 | 0 | 0.311 (0.012 / 0.299) | 0.144 (0.105 / 0.039) | 0.272 | +22.6 / -0.28 | FAIL | PASS |
| hivpr (HIV1PR) | 15 | 0 | 0.608 (0.266 / 0.343) | 0.311 (0.251 / 0.060) | 0.257 | +12 / -0.17 | FAIL | FAIL |
| sars_mpro (MPRO) | 10 | 0 | 0.401 (0.014 / 0.387) | 0.019 (-0.021 / 0.040) | 0.225 | -9.5 / -0.02 | FAIL | PASS |
| pde5a (PDE5A) | 15 | 0 | 0.774 (0.428 / 0.346) | 0.136 (0.090 / 0.046) | 0.235 | +4 / -0.12 | FAIL | PASS |
| hdac1 (HDAC1) | 13 | 0 | 0.586 (0.262 / 0.324) | 0.129 (0.086 / 0.043) | 0.323 | -5.9 / +0.04 | PASS | PASS |
| esr1 (ESR1) | 11 | 0 | 0.723 (0.477 / 0.246) | 0.068 (0.019 / 0.049) | 0.306 | -7.4 / +0.25 | FAIL | PASS |
| thrombin (F2) | 14 | 0 | 0.657 (0.311 / 0.346) | 0.046 (0.006 / 0.040) | 0.260 | +3.6 / -0.29 | FAIL | PASS |

## Table 3 — Per-Target Four-Ranker Breakdown on Rebuilt Task 2 Benchmark

| Target (Gene / PDB) | Sanity | AVE Bias | Test Act / Dec | Ranker | ROC-AUC (95% CI) | EF@1% | EF@5% | BEDROC(α=20) |
|---|:---:|---:|---:|---|---:|---:|---:|---:|
| egfr (EGFR / 1M17) | PASS | 0.085 | 17 / 51 | (a) Random (seeded uniform) | 0.448 (0.301–0.611) | 0.00 | 1.33 | 0.273 |
| egfr (EGFR / 1M17) | PASS | 0.085 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.460 (0.300–0.610) | 0.77 | 0.77 | 0.194 |
| egfr (EGFR / 1M17) | PASS | 0.085 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.710 (0.527–0.892) | 4.00 | 4.00 | 0.916 |
| egfr (EGFR / 1M17) | PASS | 0.085 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.623 (0.439–0.805) | 4.00 | 4.00 | 0.850 |
| egfr (EGFR / 1M17) | PASS | 0.085 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.460 (0.300–0.610) | 0.77 | 0.77 | 0.194 |
| erbb2 (ERBB2 / 3PP0) | PASS | 0.096 | 16 / 48 | (a) Random (seeded uniform) | 0.490 (0.320–0.657) | 0.00 | 1.33 | 0.295 |
| erbb2 (ERBB2 / 3PP0) | PASS | 0.096 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.485 (0.311–0.654) | 0.80 | 0.80 | 0.204 |
| erbb2 (ERBB2 / 3PP0) | PASS | 0.096 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.778 (0.628–0.910) | 4.00 | 4.00 | 0.853 |
| erbb2 (ERBB2 / 3PP0) | PASS | 0.096 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.488 (0.318–0.654) | 0.80 | 0.80 | 0.204 |
| erbb2 (ERBB2 / 3PP0) | PASS | 0.096 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.485 (0.311–0.654) | 0.80 | 0.80 | 0.204 |
| abl1 (ABL1 / 1IEP) | PASS | 0.027 | 17 / 51 | (a) Random (seeded uniform) | 0.512 (0.350–0.679) | 4.00 | 1.33 | 0.365 |
| abl1 (ABL1 / 1IEP) | PASS | 0.027 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.495 (0.344–0.659) | 1.00 | 1.00 | 0.247 |
| abl1 (ABL1 / 1IEP) | PASS | 0.027 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.453 (0.291–0.624) | 0.00 | 1.33 | 0.281 |
| abl1 (ABL1 / 1IEP) | PASS | 0.027 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.495 (0.344–0.659) | 1.00 | 1.00 | 0.247 |
| abl1 (ABL1 / 1IEP) | PASS | 0.027 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.495 (0.344–0.659) | 1.00 | 1.00 | 0.247 |
| braf (BRAF / 4XV2) | PASS | 0.038 | 16 / 48 | (a) Random (seeded uniform) | 0.549 (0.382–0.723) | 0.00 | 0.00 | 0.281 |
| braf (BRAF / 4XV2) | PASS | 0.038 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.494 (0.339–0.668) | 1.33 | 1.33 | 0.317 |
| braf (BRAF / 4XV2) | PASS | 0.038 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.805 (0.674–0.915) | 4.00 | 4.00 | 0.862 |
| braf (BRAF / 4XV2) | PASS | 0.038 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.494 (0.339–0.668) | 1.33 | 1.33 | 0.317 |
| braf (BRAF / 4XV2) | PASS | 0.038 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.494 (0.339–0.668) | 1.33 | 1.33 | 0.317 |
| jak2 (JAK2 / 4JI9) | PASS | -0.004 | 16 / 48 | (a) Random (seeded uniform) | 0.668 (0.500–0.822) | 4.00 | 4.00 | 0.719 |
| jak2 (JAK2 / 4JI9) | PASS | -0.004 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.440 (0.286–0.576) | 0.71 | 0.71 | 0.180 |
| jak2 (JAK2 / 4JI9) | PASS | -0.004 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.508 (0.326–0.661) | 0.00 | 1.33 | 0.218 |
| jak2 (JAK2 / 4JI9) | PASS | -0.004 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.440 (0.286–0.576) | 0.71 | 0.71 | 0.180 |
| jak2 (JAK2 / 4JI9) | PASS | -0.004 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.440 (0.286–0.576) | 0.71 | 0.71 | 0.180 |
| adrb2 (ADRB2 / 3SN6) | PASS | 0.237 | 17 / 51 | (a) Random (seeded uniform) | 0.414 (0.272–0.575) | 0.00 | 1.33 | 0.220 |
| adrb2 (ADRB2 / 3SN6) | PASS | 0.237 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.477 (0.314–0.638) | 0.89 | 0.89 | 0.227 |
| adrb2 (ADRB2 / 3SN6) | PASS | 0.237 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.606 (0.419–0.779) | 0.00 | 1.33 | 0.386 |
| adrb2 (ADRB2 / 3SN6) | PASS | 0.237 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.471 (0.312–0.630) | 0.00 | 0.30 | 0.131 |
| adrb2 (ADRB2 / 3SN6) | PASS | 0.237 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.477 (0.314–0.638) | 0.89 | 0.89 | 0.227 |
| ptgs2 (PTGS2 / 1CX2) | PASS | 0.091 | 16 / 48 | (a) Random (seeded uniform) | 0.643 (0.486–0.800) | 0.00 | 0.00 | 0.241 |
| ptgs2 (PTGS2 / 1CX2) | PASS | 0.091 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.490 (0.343–0.637) | 0.98 | 0.98 | 0.246 |
| ptgs2 (PTGS2 / 1CX2) | PASS | 0.091 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.740 (0.573–0.891) | 4.00 | 4.00 | 0.874 |
| ptgs2 (PTGS2 / 1CX2) | PASS | 0.091 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.551 (0.373–0.714) | 4.00 | 4.00 | 0.685 |
| ptgs2 (PTGS2 / 1CX2) | PASS | 0.091 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.490 (0.343–0.637) | 0.98 | 0.98 | 0.246 |
| hmgcr (HMGCR / 1HWK) | PASS | 0.058 | 16 / 48 | (a) Random (seeded uniform) | 0.508 (0.323–0.679) | 0.00 | 1.33 | 0.204 |
| hmgcr (HMGCR / 1HWK) | PASS | 0.058 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.493 (0.341–0.647) | 1.00 | 1.00 | 0.249 |
| hmgcr (HMGCR / 1HWK) | PASS | 0.058 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.678 (0.483–0.843) | 4.00 | 4.00 | 0.874 |
| hmgcr (HMGCR / 1HWK) | PASS | 0.058 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.544 (0.370–0.718) | 4.00 | 3.00 | 0.600 |
| hmgcr (HMGCR / 1HWK) | PASS | 0.058 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.493 (0.341–0.647) | 1.00 | 1.00 | 0.249 |
| dpp4 (DPP4 / 4A5S) | PASS | 0.144 | 16 / 48 | (a) Random (seeded uniform) | 0.383 (0.231–0.541) | 0.00 | 1.33 | 0.212 |
| dpp4 (DPP4 / 4A5S) | PASS | 0.144 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.490 (0.331–0.661) | 1.07 | 1.07 | 0.267 |
| dpp4 (DPP4 / 4A5S) | PASS | 0.144 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.723 (0.590–0.842) | 0.00 | 0.00 | 0.211 |
| dpp4 (DPP4 / 4A5S) | PASS | 0.144 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.490 (0.331–0.661) | 1.07 | 1.07 | 0.267 |
| dpp4 (DPP4 / 4A5S) | PASS | 0.144 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.490 (0.331–0.661) | 1.07 | 1.07 | 0.267 |
| hivpr (HIV1PR / 1HVR) | FAIL | 0.311 | 16 / 48 | (a) Random (seeded uniform) | 0.496 (0.316–0.685) | 0.00 | 1.33 | 0.289 |
| hivpr (HIV1PR / 1HVR) | FAIL | 0.311 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.475 (0.303–0.642) | 1.00 | 1.00 | 0.226 |
| hivpr (HIV1PR / 1HVR) | FAIL | 0.311 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.527 (0.351–0.707) | 4.00 | 4.00 | 0.638 |
| hivpr (HIV1PR / 1HVR) | FAIL | 0.311 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.478 (0.306–0.645) | 1.00 | 1.00 | 0.226 |
| hivpr (HIV1PR / 1HVR) | FAIL | 0.311 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.475 (0.303–0.642) | 1.00 | 1.00 | 0.226 |
| sars_mpro (MPRO / 7BQY) | PASS | 0.019 | 16 / 48 | (a) Random (seeded uniform) | 0.576 (0.407–0.759) | 4.00 | 2.67 | 0.568 |
| sars_mpro (MPRO / 7BQY) | PASS | 0.019 | 16 / 48 | (b) Drug-likeness only (no target term) | 0.452 (0.286–0.617) | 0.89 | 0.89 | 0.224 |
| sars_mpro (MPRO / 7BQY) | PASS | 0.019 | 16 / 48 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.232 (0.091–0.394) | 0.00 | 0.00 | 0.012 |
| sars_mpro (MPRO / 7BQY) | PASS | 0.019 | 16 / 48 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.452 (0.286–0.617) | 0.89 | 0.89 | 0.224 |
| sars_mpro (MPRO / 7BQY) | PASS | 0.019 | 16 / 48 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.452 (0.286–0.617) | 0.89 | 0.89 | 0.224 |
| pde5a (PDE5A / 1UDT) | PASS | 0.136 | 17 / 51 | (a) Random (seeded uniform) | 0.469 (0.323–0.614) | 0.00 | 0.00 | 0.114 |
| pde5a (PDE5A / 1UDT) | PASS | 0.136 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.504 (0.355–0.665) | 0.92 | 0.92 | 0.233 |
| pde5a (PDE5A / 1UDT) | PASS | 0.136 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.495 (0.311–0.679) | 4.00 | 4.00 | 0.673 |
| pde5a (PDE5A / 1UDT) | PASS | 0.136 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.573 (0.405–0.726) | 4.00 | 4.00 | 0.631 |
| pde5a (PDE5A / 1UDT) | PASS | 0.136 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.504 (0.355–0.665) | 0.92 | 0.92 | 0.233 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 0.129 | 17 / 51 | (a) Random (seeded uniform) | 0.423 (0.261–0.581) | 0.00 | 0.00 | 0.234 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 0.129 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.502 (0.346–0.662) | 1.08 | 1.08 | 0.271 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 0.129 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.886 (0.751–0.985) | 4.00 | 4.00 | 0.968 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 0.129 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.637 (0.464–0.808) | 4.00 | 4.00 | 0.771 |
| hdac1 (HDAC1 / 4LXZ) | PASS | 0.129 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.502 (0.346–0.662) | 1.08 | 1.08 | 0.271 |
| esr1 (ESR1 / 3ERT) | PASS | 0.068 | 17 / 51 | (a) Random (seeded uniform) | 0.648 (0.491–0.788) | 4.00 | 2.67 | 0.548 |
| esr1 (ESR1 / 3ERT) | PASS | 0.068 | 17 / 51 | (b) Drug-likeness only (no target term) | 0.472 (0.318–0.633) | 0.87 | 0.87 | 0.219 |
| esr1 (ESR1 / 3ERT) | PASS | 0.068 | 17 / 51 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.892 (0.782–0.971) | 4.00 | 4.00 | 0.914 |
| esr1 (ESR1 / 3ERT) | PASS | 0.068 | 17 / 51 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.543 (0.369–0.709) | 4.00 | 2.96 | 0.569 |
| esr1 (ESR1 / 3ERT) | PASS | 0.068 | 17 / 51 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.472 (0.318–0.633) | 0.87 | 0.87 | 0.219 |
| thrombin (F2 / 1PPB) | PASS | 0.046 | 18 / 54 | (a) Random (seeded uniform) | 0.555 (0.407–0.707) | 0.00 | 2.00 | 0.340 |
| thrombin (F2 / 1PPB) | PASS | 0.046 | 18 / 54 | (b) Drug-likeness only (no target term) | 0.502 (0.334–0.659) | 1.00 | 1.00 | 0.252 |
| thrombin (F2 / 1PPB) | PASS | 0.046 | 18 / 54 | (c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`) | 0.758 (0.619–0.882) | 4.00 | 2.00 | 0.599 |
| thrombin (F2 / 1PPB) | PASS | 0.046 | 18 / 54 | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.520 (0.349–0.672) | 4.00 | 1.75 | 0.435 |
| thrombin (F2 / 1PPB) | PASS | 0.046 | 18 / 54 | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.502 (0.334–0.659) | 1.00 | 1.00 | 0.252 |
