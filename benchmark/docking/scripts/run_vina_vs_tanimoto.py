#!/usr/bin/env python3
"""
Task 6 — AutoDock Vina against Tanimoto-to-co-crystal, head to head on all 14
sanity-passing targets of the Task 2 benchmark.

WHY THIS EXISTS
`results/enrichment.json` covers three targets (egfr 0.636, jak2 0.744, pde5a
0.800) and re-fetches its own compounds from ChEMBL, so it is not comparable
with the Task 2 ranker table. Task 2 established that Tanimoto to the staged
co-crystal ligand is the best ranker measured there (mean ROC-AUC 0.662,
BEDROC20 0.617) and that heuristic-v2 does not beat it (0.523 against 0.520 for
random). Vina has never been measured on that benchmark, so the claim that
docking adds anything over a fingerprint comparison is untested.

This scores every test compound of every sanity-passing target with both
rankers on the SAME property-matched, scaffold-split compound sets, and reports
ROC-AUC, EF@1%, EF@5% and BEDROC(20) per target and in aggregate, plus the
paired delta-AUC with a bootstrap CI.

PROMOTION RULE
Vina becomes the default ranker only if it beats Tanimoto with a paired CI
excluding zero. Otherwise Tanimoto stays default and the result is recorded.
This script does not change any production default; it writes the measurement.

PREREQUISITES — this script refuses to write a result without them
  - A working Python 3 with RDKit (`rdkit.Chem`).
  - The AutoDock Vina binary named by benchmark/docking/config.json
    (`vina_binary`), on PATH.
  - A receptor-preparation toolchain (Open Babel / ADFR) as used by
    lib/receptor_prep.py.
Exits non-zero with a prerequisite report if any are missing, rather than
emitting a partial or placeholder result.

COST
928 test compounds across 14 targets at exhaustiveness 16. Expect hours, and
run it with --target to do one at a time if that is easier to supervise.

Outputs:
  benchmark/docking/results/task6_vina_vs_tanimoto.json
  benchmark/docking/TASK6_VINA_VS_TANIMOTO.md
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BENCHMARK = ROOT / "data" / "task2_scaffold_property_matched_benchmark.json"
OUT_JSON = ROOT / "results" / "task6_vina_vs_tanimoto.json"
OUT_MD = ROOT / "TASK6_VINA_VS_TANIMOTO.md"

BEDROC_ALPHA = 20.0


def check_prerequisites(cfg: dict) -> list[str]:
    """Collect every missing prerequisite, so one run reports them all."""
    missing: list[str] = []
    try:
        import rdkit  # noqa: F401
        from rdkit import Chem  # noqa: F401
    except Exception as exc:
        missing.append(f"RDKit is not importable ({exc.__class__.__name__}: {exc})")

    vina = cfg.get("vina_binary", "vina")
    if shutil.which(vina) is None:
        missing.append(
            f"the AutoDock Vina binary {vina!r} (config.json: vina_binary) is not on PATH"
        )

    # receptor_prep shells out to one of these.
    if shutil.which("obabel") is None and shutil.which("prepare_receptor") is None:
        missing.append(
            "neither 'obabel' (Open Babel) nor 'prepare_receptor' (ADFR) is on PATH, "
            "so receptors cannot be converted to PDBQT"
        )

    if not BENCHMARK.exists():
        missing.append(f"the Task 2 benchmark is missing at {BENCHMARK}")

    return missing


def tanimoto_scores(cocrystal_smiles: str, compounds: list[dict]) -> list[float | None]:
    """
    Morgan radius 2, 2048 bits, the same fingerprint the app uses for its
    structuralSimilarity ranker, so this is the shipped ranker and not a
    re-implementation of it.
    """
    from rdkit import Chem, DataStructs
    from rdkit.Chem import AllChem

    ref = Chem.MolFromSmiles(cocrystal_smiles)
    if ref is None:
        return [None] * len(compounds)
    ref_fp = AllChem.GetMorganFingerprintAsBitVect(ref, 2, nBits=2048)

    out: list[float | None] = []
    for c in compounds:
        mol = Chem.MolFromSmiles(c["smiles"])
        if mol is None:
            out.append(None)
            continue
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
        out.append(float(DataStructs.TanimotoSimilarity(ref_fp, fp)))
    return out


def paired_delta_auc_ci(
    labels: list[bool],
    scores_a: list[float],
    scores_b: list[float],
    n_boot: int,
    seed: int,
) -> dict:
    """
    Paired bootstrap on the difference between two rankers.

    Both rankers are rescored on the same resampled compounds, so the
    per-resample delta cancels the shared variance from which compounds were
    drawn. That is the interval that answers "does B beat A"; two overlapping
    marginal CIs do not.
    """
    from lib.metrics import roc_auc

    n = len(labels)
    rng = random.Random(seed)
    deltas: list[float] = []
    skipped = 0

    for _ in range(n_boot):
        idx = [rng.randrange(n) for _ in range(n)]
        yb = [labels[i] for i in idx]
        if not any(yb) or all(yb):
            skipped += 1
            continue
        ab = [scores_a[i] for i in idx]
        bb = [scores_b[i] for i in idx]
        auc_a = roc_auc(yb, ab)
        auc_b = roc_auc(yb, bb)
        if auc_a is None or auc_b is None:
            skipped += 1
            continue
        deltas.append(auc_b - auc_a)

    point_a = roc_auc(labels, scores_a)
    point_b = roc_auc(labels, scores_b)
    point = None if point_a is None or point_b is None else point_b - point_a

    if not deltas:
        return {
            "delta": point,
            "ci_low": None,
            "ci_high": None,
            "includes_zero": None,
            "n_resamples_used": 0,
            "n_resamples_skipped": skipped,
        }

    deltas.sort()

    def q(p: float) -> float:
        pos = (len(deltas) - 1) * p
        lo, hi = int(pos), min(int(pos) + 1, len(deltas) - 1)
        return deltas[lo] + (deltas[hi] - deltas[lo]) * (pos - lo)

    low, high = q(0.025), q(0.975)
    return {
        "delta": None if point is None else round(point, 4),
        "ci_low": round(low, 4),
        "ci_high": round(high, 4),
        "includes_zero": bool(low <= 0 <= high),
        "n_resamples_used": len(deltas),
        "n_resamples_skipped": skipped,
    }


def metrics_for(labels: list[bool], scores: list[float], cfg: dict) -> dict:
    from lib.metrics import bedroc, bootstrap_auc_ci, enrichment_factor

    ci = bootstrap_auc_ci(
        labels, scores, n_boot=int(cfg["bootstrap_n"]), seed=int(cfg["bootstrap_seed"])
    )
    return {
        "roc_auc": ci["auc"],
        "roc_auc_ci_95": [ci["ci_low"], ci["ci_high"]],
        "ef_1pct": enrichment_factor(labels, scores, fraction=0.01),
        "ef_5pct": enrichment_factor(labels, scores, fraction=0.05),
        "bedroc_20": bedroc(labels, scores, alpha=BEDROC_ALPHA),
        "n_actives": sum(1 for x in labels if x),
        "n_decoys": sum(1 for x in labels if not x),
    }


def run(only_target: str | None, limit: int | None) -> dict:
    from lib.session import DockingSession, load_config

    cfg = load_config()
    missing = check_prerequisites(cfg)
    if missing:
        print("Task 6 cannot run. Missing prerequisites:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        print(
            "\nNo result file was written. Install the prerequisites and rerun;\n"
            "Tanimoto remains the default ranker until this measurement exists.",
            file=sys.stderr,
        )
        sys.exit(2)

    bench = json.loads(BENCHMARK.read_text())
    targets = [t for t in bench["targets"] if t.get("passes_sanity")]
    if only_target:
        targets = [t for t in targets if t["target_id"] == only_target]
        if not targets:
            print(f"no sanity-passing target named {only_target!r}", file=sys.stderr)
            sys.exit(2)

    work = ROOT / "cache" / "runs"
    per_target = []
    pooled_labels: list[bool] = []
    pooled_vina: list[float] = []
    pooled_tanimoto: list[float] = []

    for t in targets:
        compounds = [c for c in t["test_compounds"] if c.get("split") == "test"] or t["test_compounds"]
        if limit:
            compounds = compounds[:limit]

        tani = tanimoto_scores(t["cocrystal_smiles"], compounds)

        panel = {
            "target_id": t["target_id"],
            "gene": t["gene_symbol"],
            "pdb_id": t["pdb_id"],
            "ligand_resn": t["ligand_resname"],
            "ligand_chain": t.get("ligand_chain", "A"),
            "reference_smiles": t["cocrystal_smiles"],
        }
        sess = DockingSession(panel, work)

        labels: list[bool] = []
        vina_scores: list[float] = []
        tani_scores: list[float] = []
        n_dock_fail = 0

        for compound, tscore in zip(compounds, tani):
            if tscore is None:
                continue
            pose, score, err = sess.dock_smiles(
                compound["smiles"],
                seed=int(cfg["redock_seeds"][0]),
                work_subdir=f"t6_{t['target_id']}_{compound['molecule_chembl_id']}",
            )
            if score is None:
                # A compound Vina cannot score is dropped from BOTH rankers, so
                # the comparison stays paired on an identical compound set.
                n_dock_fail += 1
                continue
            labels.append(bool(compound["is_active"]))
            vina_scores.append(-float(score))  # more negative affinity = better
            tani_scores.append(float(tscore))

        if sum(labels) < 3 or len(labels) - sum(labels) < 6:
            per_target.append(
                {
                    "target_id": t["target_id"],
                    "gene": t["gene_symbol"],
                    "skipped": True,
                    "reason": f"too few scorable compounds ({sum(labels)} actives, "
                    f"{len(labels) - sum(labels)} decoys) after {n_dock_fail} docking failures",
                }
            )
            continue

        row = {
            "target_id": t["target_id"],
            "gene": t["gene_symbol"],
            "pdb_id": t["pdb_id"],
            "skipped": False,
            "n_scored": len(labels),
            "n_docking_failures": n_dock_fail,
            "ave_bias": t.get("ave_bias"),
            "vina": metrics_for(labels, vina_scores, cfg),
            "tanimoto": metrics_for(labels, tani_scores, cfg),
            "paired_delta_roc_auc_vina_minus_tanimoto": paired_delta_auc_ci(
                labels, tani_scores, vina_scores,
                n_boot=int(cfg["bootstrap_n"]), seed=int(cfg["bootstrap_seed"]),
            ),
        }
        per_target.append(row)
        pooled_labels.extend(labels)
        pooled_vina.extend(vina_scores)
        pooled_tanimoto.extend(tani_scores)

        print(
            f"[task6] {t['target_id']:<10} vina {row['vina']['roc_auc']:.3f} "
            f"tanimoto {row['tanimoto']['roc_auc']:.3f} "
            f"delta {row['paired_delta_roc_auc_vina_minus_tanimoto']['delta']}",
            flush=True,
        )

    scored = [r for r in per_target if not r["skipped"]]
    if not scored:
        print("no target produced a scorable set; nothing written", file=sys.stderr)
        sys.exit(2)

    def mean(key: str, ranker: str) -> float | None:
        vals = [r[ranker][key] for r in scored if r[ranker][key] is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    pooled_delta = paired_delta_auc_ci(
        pooled_labels, pooled_tanimoto, pooled_vina,
        n_boot=int(cfg["bootstrap_n"]), seed=int(cfg["bootstrap_seed"]),
    )

    # Per-target deltas resampled as clusters: the honest aggregate when the
    # pooled set mixes targets with different base rates and score scales.
    rng = random.Random(int(cfg["bootstrap_seed"]) ^ 0x5EED)
    per_target_deltas = [
        r["vina"]["roc_auc"] - r["tanimoto"]["roc_auc"]
        for r in scored
        if r["vina"]["roc_auc"] is not None and r["tanimoto"]["roc_auc"] is not None
    ]
    cluster_means = []
    for _ in range(int(cfg["bootstrap_n"])):
        sample = [per_target_deltas[rng.randrange(len(per_target_deltas))] for _ in per_target_deltas]
        cluster_means.append(sum(sample) / len(sample))
    cluster_means.sort()
    ci_lo = cluster_means[int(0.025 * (len(cluster_means) - 1))]
    ci_hi = cluster_means[int(0.975 * (len(cluster_means) - 1))]

    aggregate = {
        "n_targets_scored": len(scored),
        "vina_mean": {
            "roc_auc": mean("roc_auc", "vina"),
            "ef_1pct": mean("ef_1pct", "vina"),
            "ef_5pct": mean("ef_5pct", "vina"),
            "bedroc_20": mean("bedroc_20", "vina"),
        },
        "tanimoto_mean": {
            "roc_auc": mean("roc_auc", "tanimoto"),
            "ef_1pct": mean("ef_1pct", "tanimoto"),
            "ef_5pct": mean("ef_5pct", "tanimoto"),
            "bedroc_20": mean("bedroc_20", "tanimoto"),
        },
        "pooled_paired_delta_roc_auc": pooled_delta,
        "per_target_mean_delta_roc_auc": {
            "delta": round(sum(per_target_deltas) / len(per_target_deltas), 4),
            "ci_low": round(ci_lo, 4),
            "ci_high": round(ci_hi, 4),
            "includes_zero": bool(ci_lo <= 0 <= ci_hi),
            "resampling_unit": "target",
        },
    }

    promote = (
        aggregate["per_target_mean_delta_roc_auc"]["includes_zero"] is False
        and aggregate["per_target_mean_delta_roc_auc"]["delta"] > 0
    )

    if promote:
        finding = (
            f"**Vina beats Tanimoto on this benchmark.** Mean ROC-AUC "
            f"{aggregate['vina_mean']['roc_auc']} against {aggregate['tanimoto_mean']['roc_auc']}; "
            f"mean per-target delta {aggregate['per_target_mean_delta_roc_auc']['delta']} "
            f"(95% CI {aggregate['per_target_mean_delta_roc_auc']['ci_low']} to "
            f"{aggregate['per_target_mean_delta_roc_auc']['ci_high']}), excluding zero. "
            f"The promotion criterion is met. Promotion is a separate decision and is not "
            f"applied by this script."
        )
    else:
        finding = (
            f"**Vina does not beat Tanimoto on this benchmark, so Tanimoto stays the default "
            f"ranker.** Mean ROC-AUC {aggregate['vina_mean']['roc_auc']} against "
            f"{aggregate['tanimoto_mean']['roc_auc']}; mean per-target delta "
            f"{aggregate['per_target_mean_delta_roc_auc']['delta']} (95% CI "
            f"{aggregate['per_target_mean_delta_roc_auc']['ci_low']} to "
            f"{aggregate['per_target_mean_delta_roc_auc']['ci_high']}), which includes zero. "
            f"Docking every compound costs orders of magnitude more compute than a fingerprint "
            f"comparison and buys no measurable ranking improvement here."
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "task": "Task 6 — Vina vs Tanimoto on the Task 2 scaffold-split, property-matched benchmark",
        "benchmark_id": bench.get("benchmark_id"),
        "engine": cfg.get("engine"),
        "exhaustiveness": cfg.get("exhaustiveness"),
        "bootstrap_n": cfg.get("bootstrap_n"),
        "bootstrap_seed": cfg.get("bootstrap_seed"),
        "bedroc_alpha": BEDROC_ALPHA,
        "tanimoto_fingerprint": "Morgan radius 2, 2048 bits (the shipped structuralSimilarity ranker)",
        "promotion": {
            "criterion": "Vina must beat Tanimoto with a paired CI excluding zero",
            "criterion_met": promote,
            "default_ranker_after_this_run": "vina" if promote else "tanimoto",
            "promoted_in_code": False,
        },
        "finding": finding,
        "aggregate": aggregate,
        "per_target": per_target,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2))
    OUT_MD.write_text(render_markdown(report))
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")
    return report


def render_markdown(r: dict) -> str:
    L: list[str] = []
    agg = r["aggregate"]
    L.append("# Task 6 — AutoDock Vina against Tanimoto-to-Co-Crystal")
    L.append("")
    L.append(f"Generated: {r['generated_at']}")
    L.append("")
    L.append(
        f"{r['engine']}, exhaustiveness {r['exhaustiveness']}, on the Task 2 "
        f"property-matched scaffold-split benchmark (`{r['benchmark_id']}`), "
        f"{agg['n_targets_scored']} sanity-passing targets scored. "
        f"Tanimoto ranker: {r['tanimoto_fingerprint']}."
    )
    L.append("")
    L.append("## Headline finding")
    L.append("")
    L.append(r["finding"])
    L.append("")
    L.append("## Table 1 — Per target")
    L.append("")
    L.append(
        "| Target | PDB | n scored | Vina ROC-AUC | Tanimoto ROC-AUC | Delta (95% CI) | "
        "Vina EF@1% | Tani EF@1% | Vina BEDROC20 | Tani BEDROC20 |"
    )
    L.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for row in r["per_target"]:
        if row["skipped"]:
            L.append(f"| `{row['target_id']}` | — | — | — | — | skipped: {row['reason']} | — | — | — | — |")
            continue
        d = row["paired_delta_roc_auc_vina_minus_tanimoto"]
        L.append(
            f"| `{row['target_id']}` | {row['pdb_id']} | {row['n_scored']} | "
            f"{row['vina']['roc_auc']} | {row['tanimoto']['roc_auc']} | "
            f"{d['delta']} ({d['ci_low']} to {d['ci_high']}) | "
            f"{row['vina']['ef_1pct']} | {row['tanimoto']['ef_1pct']} | "
            f"{row['vina']['bedroc_20']} | {row['tanimoto']['bedroc_20']} |"
        )
    L.append("")
    L.append("## Table 2 — Aggregate")
    L.append("")
    L.append("| Ranker | Mean ROC-AUC | Mean EF@1% | Mean EF@5% | Mean BEDROC(20) |")
    L.append("|---|---:|---:|---:|---:|")
    for name, key in (("AutoDock Vina", "vina_mean"), ("Tanimoto to co-crystal", "tanimoto_mean")):
        m = agg[key]
        L.append(f"| {name} | {m['roc_auc']} | {m['ef_1pct']} | {m['ef_5pct']} | {m['bedroc_20']} |")
    L.append("")
    pooled = agg["pooled_paired_delta_roc_auc"]
    mean_d = agg["per_target_mean_delta_roc_auc"]
    L.append("| Paired delta (Vina − Tanimoto) | Delta | 95% CI | Includes zero? |")
    L.append("|---|---:|---:|:---:|")
    L.append(
        f"| Pooled over all compounds | {pooled['delta']} | {pooled['ci_low']} to {pooled['ci_high']} | "
        f"{'yes' if pooled['includes_zero'] else 'no'} |"
    )
    L.append(
        f"| Mean per-target, resampling targets | {mean_d['delta']} | {mean_d['ci_low']} to {mean_d['ci_high']} | "
        f"{'yes' if mean_d['includes_zero'] else 'no'} |"
    )
    L.append("")
    L.append(
        "The per-target resampling is the one that governs the promotion decision: the pooled "
        "set mixes targets with different base rates and different score scales, which the "
        "pooled interval does not account for."
    )
    L.append("")
    L.append("## Ranking is not affinity prediction")
    L.append("")
    L.append(
        "Whatever this table shows, it is a statement about **ranking actives above decoys**, "
        "not about predicting binding affinity. On the earlier 25-drug run, Vina's correlation "
        "with measured potency was Spearman **-0.291** (95% CI **-0.681 to 0.478**) — an interval "
        "spanning zero and most of both directions, i.e. no measurable relationship. A ranking "
        "win here would not license any claim that the scores estimate affinity, and the two "
        "results must not be used to support each other. Separating actives from "
        "property-matched decoys and ordering actives by potency are different tasks, and this "
        "benchmark only measures the first."
    )
    L.append("")
    L.append("## Promotion decision")
    L.append("")
    L.append(f"- Criterion: {r['promotion']['criterion']}")
    L.append(f"- Criterion met: **{'yes' if r['promotion']['criterion_met'] else 'no'}**")
    L.append(f"- Default ranker: **{r['promotion']['default_ranker_after_this_run']}**")
    L.append(f"- Changed in code by this run: **{'yes' if r['promotion']['promoted_in_code'] else 'no'}**")
    L.append("")
    L.append("## Reproducing")
    L.append("")
    L.append("```")
    L.append("python benchmark/docking/scripts/run_vina_vs_tanimoto.py")
    L.append("```")
    L.append("")
    return "\n".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", help="run one target_id only")
    ap.add_argument("--limit", type=int, help="cap compounds per target (smoke test only)")
    ap.add_argument(
        "--check",
        action="store_true",
        help="report prerequisites and exit without docking",
    )
    args = ap.parse_args()

    if args.check:
        from lib.session import load_config

        missing = check_prerequisites(load_config())
        if missing:
            print("Missing prerequisites:")
            for m in missing:
                print(f"  - {m}")
            sys.exit(2)
        print("All prerequisites present.")
        return

    run(args.target, args.limit)


if __name__ == "__main__":
    main()
