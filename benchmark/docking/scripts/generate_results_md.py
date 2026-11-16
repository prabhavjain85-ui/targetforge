#!/usr/bin/env python3
"""Render benchmark/docking/RESULTS.md from results/*.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    redock = json.loads((ROOT / "results" / "redock_multiseed.json").read_text())
    drugs = json.loads((ROOT / "results" / "approved_25.json").read_text())
    enrich_path = ROOT / "results" / "enrichment.json"
    enrich = json.loads(enrich_path.read_text()) if enrich_path.exists() else {"targets": []}
    sanity_path = ROOT / "results" / "pair_sanity_checks.json"
    sanity = json.loads(sanity_path.read_text()) if sanity_path.exists() else None

    n_pass = redock.get("n_targets_pass", 0)
    n_total = redock.get("n_targets", len(redock.get("rows", [])))
    panel_ok = redock.get("panel_overall_pass", False)

    lines = [
        "# Molecular docking benchmark results (TargetForge / pocketlink)",
        "",
        "Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),",
        "waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko**,",
        "symmetry-corrected in-place **spyrmsd**. **Exhaustiveness=16**; seeds in `config.json`.",
        "",
        "> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`).",
        "",
        f"Generated: {redock.get('generated_at', 'n/a')}",
        "",
        "## Redocking validation",
        "",
        f"**Per target:** {redock.get('per_target_pass_rule', 'best seed spyrmsd ≤ 2.0 Å')}.",
        f"**Panel acceptance:** {redock.get('panel_pass_rule', '≥60% targets pass')} → "
        f"**{n_pass}/{n_total} ({100 * redock.get('panel_pass_rate', n_pass / max(1, n_total)):.0f}%)** "
        f"— **{'PASS' if panel_ok else 'FAIL'}**.",
        "",
        "| Target | PDB | Best RMSD (Å) | Median RMSD (Å) | ≤2 Å | Failure reason |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in redock["rows"]:
        best = r.get("best_rmsd_angstrom")
        med = r.get("median_rmsd_angstrom")
        lines.append(
            f"| {r['target_id']} | {r['pdb_id']}/{r['ligand_resn']} | "
            f"{f'{best:.2f}' if best is not None else '—'} | "
            f"{f'{med:.2f}' if med is not None else '—'} | "
            f"{'yes' if r.get('pass_rmsd_2A') else 'no'} | {r.get('failure_reason') or '—'} |"
        )

    if sanity:
        lines.extend(
            [
                "",
                "## 25-drug pair sanity checks",
                "",
                f"Automated checks: co-crystal ligand present (PDB/chain), embeddable SMILES, "
                f"Vina score in **{sanity['vina_score_band_kcal_mol'][0]} to {sanity['vina_score_band_kcal_mol'][1]} kcal/mol**, "
                f"redock spyrmsd ≤ 2 Å. **Reliable: {sanity['n_reliable']}/{sanity['n_total']}**.",
                "",
                "| Drug | PDB/ligand | Ligand in PDB | Vina | RMSD (Å) | Reliable | Issues |",
                "| --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        by_id = {c["drug_id"]: c for c in sanity["checks"]}
        for r in drugs["rows"]:
            c = by_id.get(r["drug_id"], {})
            issues = "; ".join(c.get("issues") or [])[:80] or "—"
            lines.append(
                f"| {r['name']} | {r['pdb_id']}/{c.get('ligand_resn','?')} | "
                f"{c.get('ligand_atoms_in_pdb', 0)} atoms | {r['vina_score_kcal_mol']} | "
                f"{r['redock_rmsd_angstrom']} | "
                f"{'yes' if c.get('reliable_for_benchmark') else '**no**'} | {issues} |"
            )
        lines.append("")
        lines.append(
            "_Unreliable pairs must not be presented as validated binding modes (see app docking notice)._"
        )

    lines.extend(
        [
            "",
            "## 25 approved drugs (co-crystal redock)",
            "",
            f"Redock success (native ligand, best seed ≤ 2 Å): **{drugs['n_redock_pass_2A']}/{drugs['n_drugs']}** "
            f"(includes pairs marked unreliable above).",
            "",
        ]
    )
    sp = drugs.get("spearman_vina_vs_pchembl") or {}
    rho = sp.get("rho")
    if rho is not None:
        lines.append(
            f"Spearman ρ (inverted Vina score vs ChEMBL pChEMBL median): **{rho:.3f}** "
            f"(95% bootstrap CI {sp.get('ci_low'):.3f}–{sp.get('ci_high'):.3f})."
        )
    else:
        lines.append("Spearman correlation: insufficient paired measurements.")
    lines.extend(
        [
            "",
            "| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for r in drugs["rows"]:
        lines.append(
            f"| {r['name']} | {r['gene']} | {r['pdb_id']} | {r['redock_rmsd_angstrom']} | "
            f"{r['vina_score_kcal_mol']} | {r['pchembl_median']} | {'yes' if r['pass_redock_2A'] else 'no'} |"
        )

    lines.extend(["", "## Enrichment (test split only)", ""])
    if not enrich.get("targets"):
        lines.append("_Enrichment not run._")
    else:
        lines.append("| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |")
        lines.append("| --- | --- | --- | --- | --- |")
        for t in enrich["targets"]:
            ci = t.get("roc_auc_ci_95") or [None, None]
            lines.append(
                f"| {t['target_id']} | {t['n_test_actives']} | {t['n_test_decoys']} | "
                f"{t['roc_auc']:.3f} ({ci[0]:.3f}–{ci[1]:.3f}) | {t['ef1pct']:.2f} |"
            )

    task1_path = ROOT / "results" / "task1_four_rankers.json"
    if task1_path.exists():
        t1 = json.loads(task1_path.read_text())
        s_sane = t1.get("summary_sanity_passing_targets") or {}
        s_count = t1.get("summary_count_passing_targets") or {}
        s_all = t1.get("summary_all_evaluable_targets") or {}
        ranker_rows = [
            ("random", "(a) Random (seeded uniform)"),
            ("druglikeness_only", "(b) Drug-likeness only (no target term)"),
            ("tanimoto_cocrystal", "(c) Tanimoto to staged co-crystal (`structuralSimilarity.js`)"),
            ("heuristic_v2", "(d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal)"),
            ("heuristic_v2_rules_only", "(d-0) `heuristic-v2` (rule table only, no co-crystal sim)"),
        ]
        lines.extend(
            [
                "",
                "## Task 1 — Four-Ranker Triage Baseline (Held-Out Test Split)",
                "",
                f"- **Benchmark:** `{t1.get('benchmark_id')}` (`{t1.get('split_method')}`, `{t1.get('decoy_method')}`)",
                f"- **Decoy sanity pass rate:** **{t1.get('n_targets_passing_sanity')}/{t1.get('n_targets_total')}** "
                f"(sample-count check only: {t1.get('n_targets_passing_count_check')}/{t1.get('n_targets_total')})",
                f"- **Finding:** {t1.get('finding')}",
                "",
                "### Mean Metrics Across Sanity-Passing Targets (3/15) vs Count-Passing Targets (11/15) vs All Targets (15/15)",
                "",
                "| Panel Subset | Ranker | Mean ROC-AUC (95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b)? | Beats (c)? |",
                "| --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |",
            ]
        )
        for subset_label, summary_obj in [
            (f"Sanity-passing ({t1.get('n_targets_passing_sanity')}/{t1.get('n_targets_total')})", s_sane),
            (f"Count-passing ({t1.get('n_targets_passing_count_check')}/{t1.get('n_targets_total')})", s_count),
            (f"All targets ({t1.get('n_targets_evaluable')}/{t1.get('n_targets_total')})", s_all),
        ]:
            dl_auc = (summary_obj.get("druglikeness_only") or {}).get("roc_auc")
            tan_auc = (summary_obj.get("tanimoto_cocrystal") or {}).get("roc_auc")
            for rk, rlabel in ranker_rows:
                m = summary_obj.get(rk) or {}
                auc = m.get("roc_auc")
                if auc is None:
                    continue
                beats_b = "Yes" if (dl_auc is not None and auc > dl_auc + 1e-6) else "No"
                beats_c = "Yes" if (tan_auc is not None and auc > tan_auc + 1e-6) else "No"
                lines.append(
                    f"| {subset_label} | {rlabel} | {auc:.3f} ({m.get('ci_low', 0):.3f}–{m.get('ci_high', 0):.3f}) | "
                    f"{m.get('ef_1pct', 0):.2f} | {m.get('ef_5pct', 0):.2f} | {m.get('bedroc_20', 0):.3f} | {beats_b} | {beats_c} |"
                )
        lines.append("")
        lines.append("_Full per-target breakdown and decoy sanity audit in `benchmark/docking/TASK1_BASELINES.md` and `benchmark/docking/results/task1_four_rankers.json`._")

    task2_path = ROOT / "results" / "task2_four_rankers.json"
    if task2_path.exists():
        t2 = json.loads(task2_path.read_text())
        s2_sane = t2.get("summary_sanity_passing_targets") or {}
        s2_all = t2.get("summary_all_evaluable_targets") or {}
        ave_rows = t2.get("ave_before_after") or []
        ranker_rows = [
            ("random", "(a) Random (seeded uniform)"),
            ("druglikeness_only", "(b) Drug-likeness only (no target term)"),
            ("tanimoto_cocrystal", "(c) Tanimoto to staged co-crystal (`structuralSimilarity.js`)"),
            ("heuristic_v2", "(d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal)"),
            ("heuristic_v2_rules_only", "(d-0) `heuristic-v2` (rule table only, no co-crystal sim)"),
        ]
        lines.extend(
            [
                "",
                "## Task 2 — Property-Matched Decoys & Bemis–Murcko Scaffold Split (Before vs After)",
                "",
                f"- **Rebuilt benchmark:** `{t2.get('benchmark_id')}` (`{t2.get('split_method')}`, `{t2.get('decoy_method')}`)",
                f"- **Decoy sanity pass rate:** **{t2.get('n_targets_passing_sanity')}/{t2.get('n_targets_total')}** "
                f"(up from **{t1.get('n_targets_passing_sanity')}/{t1.get('n_targets_total')}** in Task 1)",
                f"- **Finding:** {t2.get('finding')}",
                "",
                "### Four-Ranker Comparison on Rebuilt Benchmark",
                "",
                "| Panel Subset | Ranker | Mean ROC-AUC (95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b)? | Beats (c)? |",
                "| --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |",
            ]
        )
        for subset_label, summary_obj in [
            (f"Sanity-passing ({t2.get('n_targets_passing_sanity')}/{t2.get('n_targets_total')})", s2_sane),
            (f"All targets ({t2.get('n_targets_evaluable')}/{t2.get('n_targets_total')})", s2_all),
        ]:
            dl_auc = (summary_obj.get("druglikeness_only") or {}).get("roc_auc")
            tan_auc = (summary_obj.get("tanimoto_cocrystal") or {}).get("roc_auc")
            for rk, rlabel in ranker_rows:
                m = summary_obj.get(rk) or {}
                auc = m.get("roc_auc")
                if auc is None:
                    continue
                beats_b = "Yes" if (dl_auc is not None and auc > dl_auc + 1e-6) else "No"
                beats_c = "Yes" if (tan_auc is not None and auc > tan_auc + 1e-6) else "No"
                lines.append(
                    f"| {subset_label} | {rlabel} | {auc:.3f} ({m.get('ci_low', 0):.3f}–{m.get('ci_high', 0):.3f}) | "
                    f"{m.get('ef_1pct', 0):.2f} | {m.get('ef_5pct', 0):.2f} | {m.get('bedroc_20', 0):.3f} | {beats_b} | {beats_c} |"
                )

        if ave_rows:
            lines.extend(
                [
                    "",
                    "### Per-Target AVE Bias & Scaffold Leakage (Before vs After)",
                    "",
                    "| Target | Before Leaked Scaffolds | After Leaked Scaffolds | Before AVE | After AVE | Max Decoy–Active Tanimoto | Before Sanity | After Sanity |",
                    "| --- | ---: | ---: | ---: | ---: | ---: | :---: | :---: |",
                ]
            )
            for r in ave_rows:
                b = r.get("before") or {}
                a = r.get("after") or {}
                lines.append(
                    f"| {r['target_id']} ({r['gene_symbol']}) | {b.get('shared_scaffolds_train_test', 0)} | "
                    f"{a.get('shared_scaffolds_train_test', 0)} | {b.get('ave_bias', 0):.3f} | {a.get('ave_bias', 0):.3f} | "
                    f"{a.get('max_test_decoy_to_active_tanimoto', 0):.3f} | "
                    f"{'PASS' if r.get('before_sanity') else 'FAIL'} | {'PASS' if r.get('after_sanity') else 'FAIL'} |"
                )
        lines.append("")
        lines.append("_Full before/after tables and per-target AVE decomposition in `benchmark/docking/TASK2_DECOY_BENCHMARK.md` and `benchmark/docking/results/task2_four_rankers.json`._")

    task3_path = ROOT / "results" / "task3_novelty_validation.json"
    if task3_path.exists():
        t3 = json.loads(task3_path.read_text())
        c1_test = ((t3.get("cohort1_disease_undrugged") or {}).get("held_out_test") or {})
        c2_test = ((t3.get("cohort2_globally_undrugged_first_in_class") or {}).get("held_out_test") or {})
        m1_test = c1_test.get("predictors") or {}
        m2_test = c2_test.get("predictors") or {}
        method_order = [
            ("novelty_v1_hyperbolic", "Novelty Score v1 (`biologySignal / (1 + drugCount)`)"),
            ("novelty_v2_current", "Novelty Score v2 (`noveltyScore.js`: `biologySignal * broadDrugDiscount`)"),
            ("biology_signal_handset", "Hand-set `biologySignal` only (`0.50 genetic + 0.12 genlit + ...`)"),
            ("baseline_genetic_only", "Baseline: `genetic_association` alone"),
            ("baseline_drug_count", "Baseline: `drugCount` alone"),
            ("baseline_inv_drug_count", "Baseline: `1 / (1 + drugCount)` alone"),
            ("baseline_publication_count", "Baseline: `publication_count` alone"),
            ("fitted_biology_simplex", "Fitted Simplex Biology Weights (trained on 11 training diseases)"),
            ("fitted_logistic_full", "Fitted Full Logistic Model (trained on 11 training diseases)"),
        ]
        lines.extend(
            [
                "",
                "## Task 3 — Retrospective Novelty Score Validation (Open Targets 21.04 → 26.09)",
                "",
                f"- **Historical snapshot:** Open Targets `{t3.get('historical_release')}` vs current `{t3.get('current_release')}` ({t3.get('years_elapsed')} years elapsed)",
                f"- **Split:** {t3.get('n_train_diseases')} training diseases / {t3.get('n_test_diseases')} held-out test diseases",
                f"- **Finding:** {t3.get('finding')}",
                "",
                f"### Held-Out Test Split — Cohort 1: Disease-Specific Clinical Acquisition (n={c1_test.get('n_total')}, positives={c1_test.get('n_positives')})",
                "",
                "| Predictor / Baseline | Test ROC-AUC (95% CI) | Test PR-AUC (95% CI) | Precision@25 | Recall@25 |",
                "| --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for mk, mlabel in method_order:
            m = m1_test.get(mk)
            if not m:
                continue
            lines.append(
                f"| {mlabel} | {m.get('roc_auc', 0):.3f} ({m.get('roc_ci_low', 0):.3f}–{m.get('roc_ci_high', 0):.3f}) | "
                f"{m.get('pr_auc', 0):.3f} ({m.get('pr_ci_low', 0):.3f}–{m.get('pr_ci_high', 0):.3f}) | "
                f"{m.get('precision_at_25', 0):.3f} | {m.get('recall_at_25', 0):.3f} |"
            )
        lines.extend(
            [
                "",
                f"### Held-Out Test Split — Cohort 2: Strictly Undrugged Targets (`drugCount_2021 == 0`, n={c2_test.get('n_total')}, positives={c2_test.get('n_positives')})",
                "",
                "| Predictor / Baseline | Test ROC-AUC (95% CI) | Test PR-AUC (95% CI) | Precision@25 | Recall@25 |",
                "| --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for mk, mlabel in method_order:
            m = m2_test.get(mk)
            if not m:
                continue
            lines.append(
                f"| {mlabel} | {m.get('roc_auc', 0):.3f} ({m.get('roc_ci_low', 0):.3f}–{m.get('roc_ci_high', 0):.3f}) | "
                f"{m.get('pr_auc', 0):.3f} ({m.get('pr_ci_low', 0):.3f}–{m.get('pr_ci_high', 0):.3f}) | "
                f"{m.get('precision_at_25', 0):.3f} | {m.get('recall_at_25', 0):.3f} |"
            )
        lines.append("")
        lines.append("_Full retrospective cohort analysis, fitted vs hand-set weight comparison, and per-disease metrics in `benchmark/docking/TASK3_NOVELTY_VALIDATION.md` and `benchmark/docking/results/task3_novelty_validation.json`._")

    lines.extend(["", "## Failures and limitations", ""])
    for r in redock["rows"]:
        if not r.get("pass_rmsd_2A"):
            lines.append(f"- **Redock {r['target_id']}** ({r['pdb_id']}): {r.get('failure_reason')}")
    for r in drugs["rows"]:
        if not r.get("pass_redock_2A") or r.get("failure"):
            lines.append(
                f"- **{r['name']}**: RMSD={r['redock_rmsd_angstrom']}, note={r.get('failure')}"
            )
    lines.extend(
        [
            "- Panel and per-drug metrics use the same Vina prep; failures are not tuned away by swapping PDB entries.",
            "- Vina scores are not calibrated affinities; Spearman uses sparse ChEMBL pairings across heterogeneous targets.",
            "- Legacy Vina 3-target enrichment decoys (`enrichment.json`) used ChEMBL weak binders split by molecule ID; Task 2 (`task2_four_rankers.json`) replaces this with 6-property-matched decoys (Tanimoto ≤ 0.35 ceiling) and Bemis–Murcko scaffold splitting.",
        ]
    )

    (ROOT / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print("Wrote RESULTS.md")


if __name__ == "__main__":
    main()
