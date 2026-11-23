/**
 * Master switch for production docking (Vina service + UI).
 *
 * User-visible docking status is NOT written here. It is derived in
 * src/shared/dockingStatus.js, which is the only place in the repository where
 * docking status is written in English.
 */
export const DOCKING_ENABLED = true;

/**
 * Legacy in-browser empirical engine (src/dockingEngine.js). Permanently off.
 *
 * This is not a pause and not a pending validation. The engine was measured
 * against co-crystal ligands and failed on every target tested: in-place RMSD
 * 5.5-11.5 A, and no valid pose at all on six of eleven. Its compute op has
 * been unregistered so it is unreachable from any route, including a direct
 * call to /api/compute. See benchmark/docking/RESULTS.md.
 */
export const DOCKING_ENGINE_ENABLED = false;

/** Offline 25-drug benchmark: many PDB pairs failed sanity checks — never treat as validated poses. */
export const DOCKING_BENCHMARK_PAIRS_NOTICE =
  "The 25-drug co-crystal benchmark includes pairs flagged unreliable in benchmark/docking/RESULTS.md (wrong ligand, high RMSD, or missing co-crystal). Those results are not shown here.";
