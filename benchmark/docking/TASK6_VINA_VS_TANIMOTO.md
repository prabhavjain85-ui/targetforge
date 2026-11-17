# Task 6 — AutoDock Vina against Tanimoto-to-Co-Crystal

## Status: NOT RUN. This file contains no measurements.

The harness is written and committed at
`benchmark/docking/scripts/run_vina_vs_tanimoto.py`. It has never been
executed, and it has never even been parsed, because the machine this work was
done on has no Python interpreter. `python`, `python3` and `py` all resolve to
the Windows Store stub, `py -0` reports "No installed Python found", and
`C:\Python314` holds a stray `Lib` directory with no `python.exe`.

Nothing in this file should be read as a result. The script deliberately exits
non-zero and writes nothing when its prerequisites are absent, rather than
emitting a partial or placeholder number, and it will overwrite this file with
real measurements the first time it completes.

## What is missing

| Prerequisite | Status on the machine used |
|---|---|
| Python 3 | absent — `py -0` reports no installed Python |
| RDKit (`rdkit.Chem`) | cannot be checked without Python |
| AutoDock Vina binary (`config.json`: `vina_binary`) | absent — not on PATH |
| Open Babel (`obabel`) or ADFR (`prepare_receptor`) | absent — neither on PATH |
| Task 2 benchmark data | present (`data/task2_scaffold_property_matched_benchmark.json`) |

The hosted docking service is also unavailable: `/api/docking/health` reports
`serviceConfigured: false`, so the validated Vina path does not run in the
deployed app either.

## What the harness does when it can run

Scores every test compound of all 14 sanity-passing Task 2 targets with both
rankers on the same property-matched, scaffold-split compound sets — 928 test
compounds in total — and reports per target and in aggregate:

- ROC-AUC with bootstrap CI
- EF@1% and EF@5%
- BEDROC(α=20)
- the paired delta-AUC (Vina − Tanimoto) with a bootstrap CI, both pooled over
  compounds and as a mean per target resampling targets

A compound Vina cannot score is dropped from **both** rankers, so the
comparison stays paired on an identical compound set.

Expect hours of compute at exhaustiveness 16. `--target <id>` runs one target
at a time and `--check` reports prerequisites without docking.

## Promotion rule, and what holds until the run happens

Vina becomes the default ranker only if it beats Tanimoto with a paired CI
excluding zero. That has not been measured, so **Tanimoto remains the default
ranker**, which is what `server/scoreCandidates.js` already does on the
strength of Task 2 (Tanimoto mean ROC-AUC 0.662 against heuristic-v2's 0.523
and random's 0.520).

The claim this task exists to test — that docking adds ranking power over a
fingerprint comparison — is therefore still untested on this benchmark. The
three-target `results/enrichment.json` (egfr 0.636, jak2 0.744, pde5a 0.800)
does not settle it: it re-fetches its own compounds from ChEMBL rather than
using the Task 2 sets, so its numbers are not comparable with the Task 2 ranker
table, and it includes no Tanimoto arm to compare against.

## Reproducing

```
python benchmark/docking/scripts/run_vina_vs_tanimoto.py --check
```

```
python benchmark/docking/scripts/run_vina_vs_tanimoto.py
```
