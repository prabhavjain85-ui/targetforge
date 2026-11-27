# TargetForge molecular docking benchmark (offline)

Reproducible **AutoDock Vina 1.2.5** validation for pocketlink. Production docking UI and the Fly.io service are controlled separately via `src/featureFlags.js`; this folder holds offline benchmarks and shared engine config.

## Engine config (shared with production)

`engine.config.json` is the **single versioned source of truth** for AutoDock Vina settings (pinned tool versions, fixed seed, pH 7.4 receptor prep, co-crystal box, allowed PDB IDs, and limits). The production service (`services/docking/`) and Vercel proxy read the same JSON at deploy time. Update it in place when redocking benchmarks pass.

## Reproducible container (recommended)

Every harness in `benchmark/docking/scripts/` (both Python/Vina and Node) runs inside a single pinned container defined by `benchmark/Dockerfile` (Python 3.12.8, RDKit 2024.9.5, AutoDock Vina 1.2.5, Open Babel 3.1.1, PDB2PQR 3.6.2 / PROPKA 3.5.1, Meeko 0.8.0, gemmi 0.7.5, spyrmsd 0.9.0, NumPy 1.26.4, SciPy 1.14.1, Node 22.14.0, `@rdkit/rdkit` 2025.3.4-1.0.0).

```bash
# Run every harness in benchmark/docking/scripts/ and write results back to the repo
make benchmark
# or directly:
./run-benchmarks.sh

# Verify pinned toolchain & Task 6 prerequisites without running docking
make benchmark-check

# Run a single harness (e.g. Task 6, optionally passing harness flags after --)
make benchmark-task6
./run-benchmarks.sh --only run_vina_vs_tanimoto.py -- --target egfr --limit 10
```

## System dependencies (manual local setup)

- `autodock-vina` 1.2.5 (`vina` on `PATH`)
- `openbabel` 3.1.1 (`obabel` on `PATH`)
- `pdb2pqr` 3.6.2 with PROPKA 3.5.1 (receptor protonation at pH 7.4)
- Python 3.12+ and Node 22.x

## Python environment (manual local setup)

```bash
cd benchmark/docking
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pdb2pqr==3.6.2 propka==3.5.1
```

Pinned versions are listed in `requirements.txt` and `benchmark/Dockerfile`. Large artifacts (PDB cache, Vina poses, PDB2PQR intermediates) go under `cache/` (gitignored).

## Data sources

| Asset | Source |
| --- | --- |
| Receptor coordinates | RCSB PDB (`https://files.rcsb.org/download/<PDB>.pdb`) |
| Ligand templates / bond orders | RCSB chemical component SMILES (`data.rcsb.org`) |
| Experimental potency | ChEMBL REST (`pchembl_value` for Ki/IC50) |
| 25-drug panel | `manifests/approved_25_drugs.json` (FDA-approved drugs + literature co-crystal PDBs) |
| Redocking panel | `manifests/redock_targets.json` |

## Run pipeline

```bash
# Preferred: runs all Python + Node harnesses in dependency order inside the container
./run-benchmarks.sh

# Or locally inside an already-provisioned environment
./run-benchmarks.sh --local
```

Summary tables: `RESULTS.md` and `TASK*.md`. Machine-readable summaries: `results/*.json` (including `pair_sanity_checks.json` for UI notices).

## Configuration

`config.json`: exhaustiveness, seeds, box padding, bootstrap iterations. Edit only with a new results run and updated `RESULTS.md`.
