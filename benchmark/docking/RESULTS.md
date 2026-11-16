# Molecular docking benchmark results (TargetForge / pocketlink)

Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),
waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko**,
symmetry-corrected in-place **spyrmsd**. **Exhaustiveness=16**; seeds in `config.json`.

> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`).

Generated: 2026-10-13T13:38:08.611025+00:00

## Redocking validation

**Per target:** best seed spyrmsd <= 2.0 A.
**Panel acceptance:** >=60% of targets pass per-target rule → **10/11 (91%)** — **PASS**.

| Target | PDB | Best RMSD (Å) | Median RMSD (Å) | ≤2 Å | Failure reason |
| --- | --- | --- | --- | --- | --- |
| egfr | 1M17/AQ4 | 1.51 | 5.90 | yes | — |
| braf | 4XV2/P06 | 0.27 | 0.29 | yes | — |
| abl1 | 1IEP/STI | 0.30 | 0.38 | yes | — |
| erbb2 | 3PP0/03Q | 0.50 | 0.52 | yes | — |
| ptgs2 | 1CX2/S58 | 0.78 | 0.79 | yes | — |
| pde5a | 1UDT/VIA | 1.07 | 1.09 | yes | — |
| esr1 | 3ERT/OHT | 1.01 | 1.16 | yes | — |
| dpp4 | 4A5S/N7F | 0.82 | 0.83 | yes | — |
| adrb2 | 3SN6/P0G | 5.80 | 7.95 | no | GPCR fusion construct; pocket definition sensitive to chain/strip choices. |
| jak2 | 4JI9/1M3 | 1.51 | 1.55 | yes | — |
| thrombin | 1PPB/0G6 | 1.05 | 1.81 | yes | — |

## 25-drug pair sanity checks

Automated checks: co-crystal ligand present (PDB/chain), embeddable SMILES, Vina score in **-14.0 to -5.0 kcal/mol**, redock spyrmsd ≤ 2 Å. **Reliable: 15/25**.

| Drug | PDB/ligand | Ligand in PDB | Vina | RMSD (Å) | Reliable | Issues |
| --- | --- | --- | --- | --- | --- | --- |
| Imatinib | 1IEP/STI | 37 atoms | -13.109 | 0.2960055688819872 | yes | — |
| Gefitinib | 4I23/1C9 | 22 atoms | -8.183 | 0.5610946080486491 | yes | — |
| Erlotinib | 1M17/AQ4 | 29 atoms | -7.068 | 5.881488855753779 | **no** | redock_rmsd_above_2A:5.88 |
| Lapatinib | 3PP0/03Q | 34 atoms | -11.414 | 0.5177458352650501 | yes | — |
| Vemurafenib | 3OG7/032 | 33 atoms | -11.471 | 0.6027878182754643 | yes | — |
| Ruxolitinib | 4IVB/1J5 | 23 atoms | -9.969 | 0.2644021121752579 | yes | — |
| Sildenafil | 1UDT/VIA | 33 atoms | -9.746 | 1.0884062615872114 | yes | — |
| Celecoxib | 1CX2/S58 | 28 atoms | -11.056 | 0.7884867696832052 | yes | — |
| Tamoxifen (4-OH metabolite) | 3ERT/OHT | 29 atoms | -9.762 | 1.0733456492660771 | yes | — |
| Linagliptin | 4A5S/N7F | 37 atoms | -11.115 | 0.834893372476651 | yes | — |
| Carazolol | 3P0G/P0G | 27 atoms | -10.77 | 1.4892904805512692 | yes | — |
| Losartan | 4YAY/ZD7 | 33 atoms | -11.794 | 0.2639294571401897 | yes | — |
| Ritonavir | 1HXW/RIT | 50 atoms | -6.924 | 10.605056257960976 | **no** | redock_rmsd_above_2A:10.61 |
| Saquinavir | 1HXB/ROC | 49 atoms | -8.197 | 8.712546995379046 | **no** | redock_rmsd_above_2A:8.71 |
| Atazanavir | 2AQU/DR7 | 51 atoms | -7.34 | 8.363825552063245 | **no** | redock_rmsd_above_2A:8.36 |
| Nirmatrelvir | 7VH8/4WI | 35 atoms | -7.412 | 1.5678784503381131 | yes | — |
| Vorinostat (SAHA) | 1T69/SHH | 19 atoms | -6.851 | 4.28562505791226 | **no** | redock_rmsd_above_2A:4.29 |
| Raloxifene | 2G5O/DRQ | 24 atoms | -10.538 | 0.6385781992842886 | yes | — |
| Progesterone | 1A28/STR | 23 atoms | -11.414 | 0.3471226069348402 | yes | — |
| Dexamethasone | 1M2Z/DEX | 29 atoms | -12.145 | 0.28289278844802346 | yes | — |
| Warfarin | 1QBG/WAR | 0 atoms | None | None | **no** | ligand_missing:resn_WAR_not_in_pdb;het_examples=['FAD']; no_vina_score_in_benchm |
| Methotrexate | 1U72/MTX | 33 atoms | -9.35 | 5.83694010366946 | **no** | redock_rmsd_above_2A:5.84 |
| Indinavir | 2BPV/1IN | 45 atoms | -6.908 | 8.644641354269424 | **no** | redock_rmsd_above_2A:8.64 |
| Dabrafenib | 4XV2/P06 | 35 atoms | -9.825 | 8.74539079342276 | **no** | redock_rmsd_above_2A:8.75 |
| Osimertinib | 4ZAU/YY3 | 37 atoms | -7.837 | 8.7946971209959 | **no** | redock_rmsd_above_2A:8.79 |

_Unreliable pairs must not be presented as validated binding modes (see app docking notice)._

## 25 approved drugs (co-crystal redock)

Redock success (native ligand, best seed ≤ 2 Å): **15/25** (includes pairs marked unreliable above).

Spearman ρ (inverted Vina score vs ChEMBL pChEMBL median): **-0.291** (95% bootstrap CI -0.681–0.478).

| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Imatinib | ABL1 | 1IEP | 0.2960055688819872 | -13.109 | 6.7 | yes |
| Gefitinib | EGFR | 4I23 | 0.5610946080486491 | -8.183 | 7.64 | yes |
| Erlotinib | EGFR | 1M17 | 5.881488855753779 | -7.068 | 7.52 | no |
| Lapatinib | ERBB2 | 3PP0 | 0.5177458352650501 | -11.414 | 5.025 | yes |
| Vemurafenib | BRAF | 3OG7 | 0.6027878182754643 | -11.471 | 6.44 | yes |
| Ruxolitinib | JAK2 | 4IVB | 0.2644021121752579 | -9.969 | None | yes |
| Sildenafil | PDE5A | 1UDT | 1.0884062615872114 | -9.746 | 8.45 | yes |
| Celecoxib | PTGS2 | 1CX2 | 0.7884867696832052 | -11.056 | 7.13 | yes |
| Tamoxifen (4-OH metabolite) | ESR1 | 3ERT | 1.0733456492660771 | -9.762 | 7.0 | yes |
| Linagliptin | DPP4 | 4A5S | 0.834893372476651 | -11.115 | None | yes |
| Carazolol | ADRB2 | 3P0G | 1.4892904805512692 | -10.77 | None | yes |
| Losartan | AGTR1 | 4YAY | 0.2639294571401897 | -11.794 | 7.875 | yes |
| Ritonavir | HIVPR | 1HXW | 10.605056257960976 | -6.924 | None | no |
| Saquinavir | HIVPR | 1HXB | 8.712546995379046 | -8.197 | None | no |
| Atazanavir | HIVPR | 2AQU | 8.363825552063245 | -7.34 | None | no |
| Nirmatrelvir | Mpro | 7VH8 | 1.5678784503381131 | -7.412 | None | yes |
| Vorinostat (SAHA) | HDAC1 | 1T69 | 4.28562505791226 | -6.851 | 6.89 | no |
| Raloxifene | ESR1 | 2G5O | 0.6385781992842886 | -10.538 | 8.74 | yes |
| Progesterone | PGR | 1A28 | 0.3471226069348402 | -11.414 | None | yes |
| Dexamethasone | NR3C1 | 1M2Z | 0.28289278844802346 | -12.145 | None | yes |
| Warfarin | VKORC1 | 1QBG | None | None | None | no |
| Methotrexate | DHFR | 1U72 | 5.83694010366946 | -9.35 | 7.7 | no |
| Indinavir | HIVPR | 2BPV | 8.644641354269424 | -6.908 | None | no |
| Dabrafenib | BRAF | 4XV2 | 8.74539079342276 | -9.825 | None | no |
| Osimertinib | EGFR | 4ZAU | 8.7946971209959 | -7.837 | 8.055 | no |

## Enrichment (test split only)

| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |
| --- | --- | --- | --- | --- |
| egfr | 15 | 50 | 0.636 (0.459–0.791) | 0.00 |
| jak2 | 16 | 40 | 0.744 (0.589–0.870) | 3.50 |
| pde5a | 18 | 38 | 0.800 (0.668–0.911) | 0.00 |

## Task 1 — Four-Ranker Triage Baseline (Held-Out Test Split)

- **Benchmark:** `task1_chembl_weak_binder_benchmark` (`molecule_chembl_id_md5`, `chembl_weak_binders_pchembl_lt_5`)
- **Decoy sanity pass rate:** **3/15** (sample-count check only: 11/15)
- **Finding:** heuristic-v2 DOES NOT beat (c) Tanimoto to the staged co-crystal ligand on ROC-AUC (0.583 vs 0.777 on the 3/15 sanity-passing targets; 0.457 vs 0.673 on the 11/15 count-passing targets; 0.513 vs 0.684 across all 15 targets) or BEDROC(alpha=20) (0.631 vs 0.854 on sanity-passing; 0.345 vs 0.545 on count-passing). Furthermore, without pre-staged co-crystal similarity annotation, heuristic-v2 (rule table only) DOES NOT beat (b) drug-likeness only (0.344 vs 0.344 on count-passing targets; 0.464 vs 0.464 on sanity-passing targets; 0.407 vs 0.407 across all 15 targets), scoring below random chance (~0.34–0.46 AUC) because hardcoded drug-name rules never fire on held-out molecules and Lipinski/Veber points favor smaller weak binders over potent actives.

### Mean Metrics Across Sanity-Passing Targets (3/15) vs Count-Passing Targets (11/15) vs All Targets (15/15)

| Panel Subset | Ranker | Mean ROC-AUC (95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b)? | Beats (c)? |
| --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |
| Sanity-passing (3/15) | (a) Random (seeded uniform) | 0.439 (0.284–0.603) | 2.56 | 1.59 | 0.348 | No | No |
| Sanity-passing (3/15) | (b) Drug-likeness only (no target term) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |
| Sanity-passing (3/15) | (c) Tanimoto to staged co-crystal (`structuralSimilarity.js`) | 0.777 (0.611–0.913) | 3.78 | 3.78 | 0.854 | Yes | No |
| Sanity-passing (3/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.583 (0.430–0.740) | 2.82 | 2.82 | 0.631 | Yes | No |
| Sanity-passing (3/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.464 (0.314–0.625) | 0.85 | 0.85 | 0.233 | No | No |
| Count-passing (11/15) | (a) Random (seeded uniform) | 0.486 (0.329–0.649) | 1.68 | 1.49 | 0.331 | Yes | No |
| Count-passing (11/15) | (b) Drug-likeness only (no target term) | 0.344 (0.213–0.486) | 0.60 | 0.60 | 0.167 | No | No |
| Count-passing (11/15) | (c) Tanimoto to staged co-crystal (`structuralSimilarity.js`) | 0.673 (0.549–0.793) | 1.96 | 1.97 | 0.545 | Yes | No |
| Count-passing (11/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.457 (0.322–0.593) | 1.20 | 1.31 | 0.345 | Yes | No |
| Count-passing (11/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.344 (0.213–0.486) | 0.60 | 0.60 | 0.167 | No | No |
| All targets (15/15) | (a) Random (seeded uniform) | 0.502 (0.336–0.670) | 1.37 | 1.42 | 0.341 | Yes | No |
| All targets (15/15) | (b) Drug-likeness only (no target term) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |
| All targets (15/15) | (c) Tanimoto to staged co-crystal (`structuralSimilarity.js`) | 0.684 (0.542–0.817) | 2.37 | 2.18 | 0.613 | Yes | No |
| All targets (15/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.513 (0.374–0.649) | 1.58 | 1.66 | 0.437 | Yes | No |
| All targets (15/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.407 (0.275–0.544) | 0.74 | 0.72 | 0.221 | No | No |

_Full per-target breakdown and decoy sanity audit in `benchmark/docking/TASK1_BASELINES.md` and `benchmark/docking/results/task1_four_rankers.json`._

## Task 2 — Property-Matched Decoys & Bemis–Murcko Scaffold Split (Before vs After)

- **Rebuilt benchmark:** `task2_scaffold_property_matched_benchmark` (`bemis_murcko_scaffold_split`, `dude_dekois_6prop_matched_tanimoto_ceiling_0.35`)
- **Decoy sanity pass rate:** **14/15** (up from **3/15** in Task 1)
- **Finding:** heuristic-v2 DOES NOT beat (c) Tanimoto to the staged co-crystal ligand on ROC-AUC (0.523 vs 0.662 on the 14/15 sanity-passing targets; 0.520 vs 0.653 on the 15/15 count-passing targets; 0.520 vs 0.653 across all 15 targets) or BEDROC(alpha=20) (0.436 vs 0.617 on sanity-passing; 0.422 vs 0.619 on count-passing). Furthermore, without pre-staged co-crystal similarity annotation, heuristic-v2 (rule table only) DOES NOT beat (b) drug-likeness only (0.482 vs 0.482 on count-passing targets; 0.482 vs 0.482 on sanity-passing targets; 0.482 vs 0.482 across all 15 targets), scoring below random chance (~0.34–0.46 AUC) because hardcoded drug-name rules never fire on held-out molecules and Lipinski/Veber points favor smaller weak binders over potent actives.

### Four-Ranker Comparison on Rebuilt Benchmark

| Panel Subset | Ranker | Mean ROC-AUC (95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b)? | Beats (c)? |
| --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |
| Sanity-passing (14/15) | (a) Random (seeded uniform) | 0.520 (0.361–0.681) | 1.14 | 1.38 | 0.330 | Yes | No |
| Sanity-passing (14/15) | (b) Drug-likeness only (no target term) | 0.482 (0.325–0.642) | 0.95 | 0.95 | 0.238 | No | No |
| Sanity-passing (14/15) | (c) Tanimoto to staged co-crystal (`structuralSimilarity.js`) | 0.662 (0.505–0.805) | 2.57 | 2.71 | 0.617 | Yes | No |
| Sanity-passing (14/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.523 (0.356–0.687) | 2.41 | 2.13 | 0.436 | Yes | No |
| Sanity-passing (14/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.482 (0.325–0.642) | 0.95 | 0.95 | 0.238 | No | No |
| All targets (15/15) | (a) Random (seeded uniform) | 0.519 (0.358–0.681) | 1.07 | 1.38 | 0.327 | Yes | No |
| All targets (15/15) | (b) Drug-likeness only (no target term) | 0.482 (0.323–0.642) | 0.95 | 0.95 | 0.237 | No | No |
| All targets (15/15) | (c) Tanimoto to staged co-crystal (`structuralSimilarity.js`) | 0.653 (0.494–0.798) | 2.67 | 2.80 | 0.619 | Yes | No |
| All targets (15/15) | (d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal) | 0.520 (0.353–0.684) | 2.32 | 2.05 | 0.422 | Yes | No |
| All targets (15/15) | (d-0) `heuristic-v2` (rule table only, no co-crystal sim) | 0.482 (0.323–0.642) | 0.95 | 0.95 | 0.237 | No | No |

### Per-Target AVE Bias & Scaffold Leakage (Before vs After)

| Target | Before Leaked Scaffolds | After Leaked Scaffolds | Before AVE | After AVE | Max Decoy–Active Tanimoto | Before Sanity | After Sanity |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | :---: |
| egfr (EGFR) | 16 | 0 | 0.650 | 0.085 | 0.329 | PASS | PASS |
| erbb2 (ERBB2) | 16 | 0 | 0.600 | 0.096 | 0.288 | FAIL | PASS |
| abl1 (ABL1) | 15 | 0 | 0.467 | 0.027 | 0.302 | FAIL | PASS |
| braf (BRAF) | 15 | 0 | 0.735 | 0.038 | 0.323 | FAIL | PASS |
| jak2 (JAK2) | 10 | 0 | 0.628 | -0.004 | 0.347 | PASS | PASS |
| adrb2 (ADRB2) | 10 | 0 | 0.565 | 0.237 | 0.288 | FAIL | PASS |
| ptgs2 (PTGS2) | 14 | 0 | 0.299 | 0.091 | 0.259 | FAIL | PASS |
| hmgcr (HMGCR) | 11 | 0 | 0.743 | 0.058 | 0.350 | FAIL | PASS |
| dpp4 (DPP4) | 18 | 0 | 0.311 | 0.144 | 0.272 | FAIL | PASS |
| hivpr (HIV1PR) | 15 | 0 | 0.608 | 0.311 | 0.257 | FAIL | FAIL |
| sars_mpro (MPRO) | 10 | 0 | 0.401 | 0.019 | 0.225 | FAIL | PASS |
| pde5a (PDE5A) | 15 | 0 | 0.774 | 0.136 | 0.235 | FAIL | PASS |
| hdac1 (HDAC1) | 13 | 0 | 0.586 | 0.129 | 0.323 | PASS | PASS |
| esr1 (ESR1) | 11 | 0 | 0.723 | 0.068 | 0.306 | FAIL | PASS |
| thrombin (F2) | 14 | 0 | 0.657 | 0.046 | 0.260 | FAIL | PASS |

_Full before/after tables and per-target AVE decomposition in `benchmark/docking/TASK2_DECOY_BENCHMARK.md` and `benchmark/docking/results/task2_four_rankers.json`._

## Task 3 — Retrospective Novelty Score Validation (Open Targets 21.04 → 26.09)

- **Historical snapshot:** Open Targets `21.04 (2021-05-05)` vs current `26.09 (2026-09)` (5.4 years elapsed)
- **Split:** 11 training diseases / 11 held-out test diseases
- **Finding:** On held-out diseases (Open Targets 21.04 -> 26.09, 5.4-year prospective window), the hand-set Novelty Score fails to beat simple baselines: for predicting which disease-undrugged targets in 2021 acquire a clinical/approved drug for that disease by 2026 (Cohort 1, n=13601 held-out pairs, 300 positives), the original 1/(1+drugCount) formula (novelty_v1) scores BELOW random chance (ROC-AUC 0.361, PR-AUC 0.018) and current novelty_v2 scores ROC-AUC 0.510 (PR-AUC 0.025), because dividing by drugCount penalizes existing clinical tractability — whereas drugCount_2021 alone achieves ROC-AUC 0.872 (PR-AUC 0.177), publication_count alone achieves ROC-AUC 0.707, and a logistic model fit on training diseases achieves held-out ROC-AUC 0.887 (PR-AUC 0.169). Even when restricted strictly to globally undrugged targets in 2021 (drugCount_2021 == 0, Cohort 2: first-in-class progression, n=11711 held-out pairs, 258 positives), the hand-set biology weights (0.50 genetic + 0.12 genlit + ...) achieve held-out ROC-AUC 0.637 (PR-AUC 0.038), failing to beat publication_count alone (ROC-AUC 0.667, PR-AUC 0.057) or fitted simplex weights (held-out ROC-AUC 0.708, PR-AUC 0.052; genetic_association alone = 0.497 on Cohort 1 / 0.500 on Cohort 2).

### Held-Out Test Split — Cohort 1: Disease-Specific Clinical Acquisition (n=13601, positives=300)

| Predictor / Baseline | Test ROC-AUC (95% CI) | Test PR-AUC (95% CI) | Precision@25 | Recall@25 |
| --- | ---: | ---: | ---: | ---: |
| Novelty Score v1 (`biologySignal / (1 + drugCount)`) | 0.361 (0.326–0.397) | 0.018 (0.015–0.024) | 0.040 | 0.003 |
| Novelty Score v2 (`noveltyScore.js`: `biologySignal * broadDrugDiscount`) | 0.510 (0.478–0.546) | 0.025 (0.020–0.036) | 0.080 | 0.007 |
| Hand-set `biologySignal` only (`0.50 genetic + 0.12 genlit + ...`) | 0.555 (0.524–0.588) | 0.030 (0.024–0.044) | 0.160 | 0.013 |
| Baseline: `genetic_association` alone | 0.497 (0.489–0.506) | 0.023 (0.020–0.030) | 0.120 | 0.010 |
| Baseline: `drugCount` alone | 0.872 (0.848–0.894) | 0.177 (0.149–0.216) | 0.240 | 0.020 |
| Baseline: `1 / (1 + drugCount)` alone | 0.129 (0.106–0.152) | 0.012 (0.011–0.013) | 0.040 | 0.003 |
| Baseline: `publication_count` alone | 0.707 (0.673–0.738) | 0.070 (0.055–0.090) | 0.160 | 0.013 |
| Fitted Simplex Biology Weights (trained on 11 training diseases) | 0.577 (0.548–0.606) | 0.031 (0.023–0.044) | 0.120 | 0.010 |
| Fitted Full Logistic Model (trained on 11 training diseases) | 0.887 (0.869–0.907) | 0.169 (0.144–0.204) | 0.160 | 0.013 |

### Held-Out Test Split — Cohort 2: Strictly Undrugged Targets (`drugCount_2021 == 0`, n=11711, positives=258)

| Predictor / Baseline | Test ROC-AUC (95% CI) | Test PR-AUC (95% CI) | Precision@25 | Recall@25 |
| --- | ---: | ---: | ---: | ---: |
| Novelty Score v1 (`biologySignal / (1 + drugCount)`) | 0.637 (0.605–0.674) | 0.038 (0.031–0.049) | 0.040 | 0.004 |
| Novelty Score v2 (`noveltyScore.js`: `biologySignal * broadDrugDiscount`) | 0.637 (0.604–0.674) | 0.038 (0.030–0.048) | 0.040 | 0.004 |
| Hand-set `biologySignal` only (`0.50 genetic + 0.12 genlit + ...`) | 0.637 (0.604–0.674) | 0.038 (0.031–0.049) | 0.040 | 0.004 |
| Baseline: `genetic_association` alone | 0.500 (0.490–0.511) | 0.022 (0.019–0.027) | 0.040 | 0.004 |
| Baseline: `drugCount` alone | 0.500 (0.500–0.500) | 0.022 (0.020–0.025) | 0.040 | 0.004 |
| Baseline: `1 / (1 + drugCount)` alone | 0.500 (0.500–0.500) | 0.022 (0.020–0.025) | 0.040 | 0.004 |
| Baseline: `publication_count` alone | 0.667 (0.629–0.706) | 0.057 (0.045–0.074) | 0.040 | 0.004 |
| Fitted Simplex Biology Weights (trained on 11 training diseases) | 0.708 (0.678–0.739) | 0.052 (0.042–0.064) | 0.120 | 0.012 |
| Fitted Full Logistic Model (trained on 11 training diseases) | 0.721 (0.689–0.756) | 0.069 (0.053–0.092) | 0.240 | 0.023 |

_Full retrospective cohort analysis, fitted vs hand-set weight comparison, and per-disease metrics in `benchmark/docking/TASK3_NOVELTY_VALIDATION.md` and `benchmark/docking/results/task3_novelty_validation.json`._

## Failures and limitations

- **Redock adrb2** (3SN6): GPCR fusion construct; pocket definition sensitive to chain/strip choices.
- **Erlotinib**: RMSD=5.881488855753779, note=None
- **Ritonavir**: RMSD=10.605056257960976, note=None
- **Saquinavir**: RMSD=8.712546995379046, note=None
- **Atazanavir**: RMSD=8.363825552063245, note=None
- **Vorinostat (SAHA)**: RMSD=4.28562505791226, note=None
- **Warfarin**: RMSD=None, note=No reference ligand for 1QBG/WAR
- **Methotrexate**: RMSD=5.83694010366946, note=None
- **Indinavir**: RMSD=8.644641354269424, note=None
- **Dabrafenib**: RMSD=8.74539079342276, note=None
- **Osimertinib**: RMSD=8.7946971209959, note=None
- Panel and per-drug metrics use the same Vina prep; failures are not tuned away by swapping PDB entries.
- Vina scores are not calibrated affinities; Spearman uses sparse ChEMBL pairings across heterogeneous targets.
- Legacy Vina 3-target enrichment decoys (`enrichment.json`) used ChEMBL weak binders split by molecule ID; Task 2 (`task2_four_rankers.json`) replaces this with 6-property-matched decoys (Tanimoto ≤ 0.35 ceiling) and Bemis–Murcko scaffold splitting.
