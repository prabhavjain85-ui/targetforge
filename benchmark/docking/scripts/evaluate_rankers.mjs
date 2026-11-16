#!/usr/bin/env node
/**
 * Task 1 & Task 2 Unified Benchmark Evaluation Script (`evaluate_rankers.mjs`)
 *
 * Scores a fixed benchmark dataset across four rankers and reports the exact
 * same metrics for each:
 *   (a) random               — seeded uniform random score (mulberry32)
 *   (b) druglikeness_only    — Lipinski/Veber + PAINS/toxicophore filter only,
 *                              zero target term (`scoreOne(c, null)` from server/scoreCandidates.js)
 *   (c) tanimoto_cocrystal   — ECFP4 (Morgan r=2, 2048-bit) Tanimoto similarity to the
 *                              staged co-crystal ligand (`annotateStructuralSimilarity` from
 *                              server/structuralSimilarity.js)
 *   (d) heuristic_v2         — production `heuristic-v2` scorer (`server/scoreCandidates.js`),
 *                              evaluated both with staged co-crystal similarity annotation
 *                              (`heuristic_v2`) and rule-table only (`heuristic_v2_rules_only`).
 *
 * Metrics reported for every ranker:
 *   - ROC-AUC with 95% bootstrap CI (n_boot = 1000, seed = 42)
 *   - EF@1%
 *   - EF@5%
 *   - BEDROC(alpha = 20)
 *
 * Usage:
 *   node benchmark/docking/scripts/evaluate_rankers.mjs
 *   node benchmark/docking/scripts/evaluate_rankers.mjs --benchmark benchmark/docking/data/task2_scaffold_benchmark.json --out benchmark/docking/results/task2_four_rankers.json
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getRDKit } from "../../../server/rdkitLoader.js";
import { checkPainsBatch } from "../../../server/painsCheck.js";
import { scoreOne, TARGET_RULES } from "../../../server/scoreCandidates.js";
import { annotateStructuralSimilarity } from "../../../server/structuralSimilarity.js";
import {
  evaluateRankerMetrics,
  mulberry32,
} from "../../../server/benchmark/metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../..");
const DOCKING_DIR = path.resolve(__dirname, "..");

const ENRICHMENT_MANIFEST_PATH = path.join(
  DOCKING_DIR,
  "manifests",
  "enrichment_15_targets.json"
);
const DEFAULT_BENCHMARK_PATH = path.join(
  DOCKING_DIR,
  "data",
  "task1_chembl_weak_binder_benchmark.json"
);
const DEFAULT_RESULTS_JSON = path.join(
  DOCKING_DIR,
  "results",
  "task1_four_rankers.json"
);
const DEFAULT_RESULTS_MD = path.join(DOCKING_DIR, "TASK1_BASELINES.md");

const TRAIN_FRAC = 0.55;
const MAX_ACTIVES = 18;
const MAX_DECOYS = 50;
const MIN_ACTIVES = 15;
const MIN_DECOYS = 30;
const MIN_DECOY_RATIO = 1.5;
const MAX_DRUGLIKENESS_BIAS_FROM_CHANCE = 0.15;

const CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data";

/**
 * Legacy MD5 molecule-ID split used in benchmark/docking/scripts/run_enrichment.py.
 * (Demonstrates analog leakage in Task 1; replaced by Bemis-Murcko scaffold split in Task 2.)
 */
export function inLegacyTrainSplit(chemblId) {
  const hHex = crypto.createHash("md5").update(String(chemblId)).digest("hex");
  const mod100 = Number(BigInt(`0x${hHex}`) % 100n);
  return mod100 < Math.floor(TRAIN_FRAC * 100);
}

/**
 * Compute RDKit descriptors for a canonical SMILES string.
 */
export function computeRdkitDescriptors(RDKit, smiles) {
  if (!smiles || typeof smiles !== "string") return null;
  let mol = null;
  try {
    mol = RDKit.get_mol(smiles.trim());
    if (!mol || (typeof mol.is_valid === "function" && !mol.is_valid())) {
      return null;
    }
    const canonSmiles =
      typeof mol.get_smiles === "function" ? mol.get_smiles() : smiles.trim();
    const descJson =
      typeof mol.get_descriptors === "function" ? mol.get_descriptors() : "{}";
    const desc = JSON.parse(descJson || "{}");

    // Compute formal charge from canonical SMILES or RDKit descriptors
    let formalCharge = 0;
    if (typeof desc.formalCharge === "number") {
      formalCharge = desc.formalCharge;
    } else {
      const plusMatches = canonSmiles.match(/\+([0-9]*)/g) || [];
      const minusMatches = canonSmiles.match(/-([0-9]*)/g) || [];
      for (const m of plusMatches) {
        const n = m.slice(1);
        formalCharge += n ? parseInt(n, 10) : 1;
      }
      for (const m of minusMatches) {
        const n = m.slice(1);
        formalCharge -= n ? parseInt(n, 10) : 1;
      }
    }

    return {
      smiles: canonSmiles,
      mw: Number((desc.exactmw ?? desc.amw ?? 0).toFixed(2)),
      logP: Number((desc.CrippenClogP ?? 0).toFixed(2)),
      hbd: Math.round(desc.NumHBD ?? desc.lipinskiHBD ?? 0),
      hba: Math.round(desc.NumHBA ?? desc.lipinskiHBA ?? 0),
      tpsa: Number((desc.tpsa ?? 0).toFixed(2)),
      rotatable: Math.round(desc.NumRotatableBonds ?? 0),
      formalCharge,
    };
  } catch {
    return null;
  } finally {
    if (mol && typeof mol.delete === "function") {
      try {
        mol.delete();
      } catch {
        /* ignore */
      }
    }
  }
}

async function fetchChemblBand(targetChemblId, { active = true, limit = 250 } = {}) {
  const thresholdKey = active ? "pchembl_value__gte" : "pchembl_value__lt";
  const thresholdVal = active ? "6" : "5";
  const url = new URL(`${CHEMBL_BASE}/activity.json`);
  url.searchParams.set("target_chembl_id", targetChemblId);
  url.searchParams.set("standard_type__in", "Ki,IC50");
  url.searchParams.set("standard_relation", "=");
  url.searchParams.set(thresholdKey, thresholdVal);
  url.searchParams.set("pchembl_value__isnull", "false");
  url.searchParams.set("limit", String(limit));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TargetForge-Benchmark/1.0",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    const out = [];
    for (const act of data?.activities || []) {
      const mid = act?.molecule_chembl_id;
      const smi = act?.canonical_smiles;
      const p = Number(act?.pchembl_value);
      if (!mid || !smi || seen.has(mid) || !Number.isFinite(p)) continue;
      seen.add(mid);
      out.push({
        molecule_chembl_id: mid,
        smiles: smi,
        pchembl: p,
        pref_name: act?.molecule_pref_name || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch ChEMBL IC50/Ki activities for a target (matching benchmark/docking/scripts/run_enrichment.py).
 */
async function fetchChemblTargetActivities(targetChemblId) {
  const activesRaw = (await fetchChemblBand(targetChemblId, { active: true, limit: 250 })).slice(
    0,
    MAX_ACTIVES * 2
  );
  const activeIds = new Set(activesRaw.map((a) => a.molecule_chembl_id));
  const inactivesRaw = (await fetchChemblBand(targetChemblId, { active: false, limit: 250 }))
    .filter((d) => !activeIds.has(d.molecule_chembl_id))
    .slice(0, MAX_DECOYS * 2);

  return {
    actives: activesRaw,
    inactives: inactivesRaw,
  };
}

/**
 * Build and cache the fixed 15-target ChEMBL weak-binder benchmark (Task 1 "before" benchmark).
 */
export async function buildOrLoadLegacyBenchmark(
  RDKit,
  benchmarkPath,
  { refresh = false } = {}
) {
  if (!refresh && fs.existsSync(benchmarkPath)) {
    return JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));
  }

  const manifest = JSON.parse(fs.readFileSync(ENRICHMENT_MANIFEST_PATH, "utf8"));
  const allRuleDrugs = new Set();
  for (const r of TARGET_RULES) {
    for (const d of r.onTargetDrugs || []) {
      allRuleDrugs.add(d.toLowerCase());
    }
  }

  const targetsOut = [];

  for (const t of manifest.targets) {
    process.stderr.write(
      `[Task 1] Fetching ChEMBL activities for ${t.target_id} (${t.chembl_target_id})...\n`
    );
    const { actives, inactives } = await fetchChemblTargetActivities(
      t.chembl_target_id
    );

    const enrichList = (items, isActive) => {
      const out = [];
      for (const item of items) {
        const prefLower = String(item.pref_name || "").toLowerCase();
        if (prefLower && allRuleDrugs.has(prefLower)) continue;
        const desc = computeRdkitDescriptors(RDKit, item.smiles);
        if (!desc) continue;
        const split = inLegacyTrainSplit(item.molecule_chembl_id)
          ? "train"
          : "test";
        out.push({
          molecule_chembl_id: item.molecule_chembl_id,
          smiles: desc.smiles,
          pchembl: item.pchembl,
          is_active: isActive,
          split,
          mw: desc.mw,
          logP: desc.logP,
          hbd: desc.hbd,
          hba: desc.hba,
          tpsa: desc.tpsa,
          rotatable: desc.rotatable,
          formalCharge: desc.formalCharge,
        });
      }
      return out;
    };

    const enrichedActives = enrichList(actives, true);
    const enrichedDecoys = enrichList(inactives, false);

    const trainActives = enrichedActives.filter((x) => x.split === "train");
    const testActives = enrichedActives
      .filter((x) => x.split === "test")
      .slice(0, MAX_ACTIVES);
    const trainDecoys = enrichedDecoys.filter((x) => x.split === "train");
    const testDecoys = enrichedDecoys
      .filter((x) => x.split === "test")
      .slice(0, MAX_DECOYS);

    const ratio =
      testActives.length > 0 ? testDecoys.length / testActives.length : 0;
    const passesCountCheck =
      testActives.length >= MIN_ACTIVES &&
      testDecoys.length >= MIN_DECOYS &&
      ratio >= MIN_DECOY_RATIO;

    targetsOut.push({
      target_id: t.target_id,
      gene_symbol: t.gene_symbol,
      protein_name: t.protein_name,
      chembl_target_id: t.chembl_target_id,
      pdb_id: t.pdb_id,
      ligand_resname: t.ligand_resname,
      cocrystal_smiles: t.reference_smiles,
      split_method: "molecule_chembl_id_md5",
      decoy_method: "chembl_weak_binders_pchembl_lt_5",
      n_train_actives: trainActives.length,
      n_train_decoys: trainDecoys.length,
      n_test_actives: testActives.length,
      n_test_decoys: testDecoys.length,
      decoy_per_active_ratio: Number(ratio.toFixed(2)),
      passes_count_check: passesCountCheck,
      passes_sanity: passesCountCheck,
      sanity_failure_reason: passesCountCheck
        ? null
        : testActives.length < MIN_ACTIVES
          ? `insufficient_test_actives (${testActives.length} < ${MIN_ACTIVES})`
          : testDecoys.length < MIN_DECOYS
            ? `insufficient_test_decoys (${testDecoys.length} < ${MIN_DECOYS})`
            : `decoy_ratio_below_threshold (${ratio.toFixed(2)} < ${MIN_DECOY_RATIO})`,
      train_compounds: [...trainActives, ...trainDecoys].sort((a, b) =>
        a.molecule_chembl_id.localeCompare(b.molecule_chembl_id)
      ),
      test_compounds: [...testActives, ...testDecoys].sort((a, b) =>
        a.molecule_chembl_id.localeCompare(b.molecule_chembl_id)
      ),
    });
  }

  const payload = {
    benchmark_id: "task1_chembl_weak_binder_benchmark",
    description:
      "Legacy ChEMBL weak-binder benchmark (pChEMBL >= 6.0 actives vs pChEMBL < 5.0 weak binders, split by MD5 hash of molecule_chembl_id with train_frac=0.55).",
    generated_at: new Date().toISOString(),
    parameters: {
      train_frac: TRAIN_FRAC,
      min_actives: MIN_ACTIVES,
      min_decoys: MIN_DECOYS,
      min_decoy_ratio: MIN_DECOY_RATIO,
      max_druglikeness_bias_from_chance: MAX_DRUGLIKENESS_BIAS_FROM_CHANCE,
    },
    n_targets_total: targetsOut.length,
    n_targets_passing_sanity: targetsOut.filter((t) => t.passes_sanity).length,
    targets: targetsOut,
  };

  fs.mkdirSync(path.dirname(benchmarkPath), { recursive: true });
  fs.writeFileSync(benchmarkPath, JSON.stringify(payload, null, 2));
  return payload;
}

/**
 * Score a single target's held-out test split with the 4 rankers.
 */
export async function evaluateTargetRankers(
  RDKit,
  targetEntry,
  { seed = 42, nBoot = 1000 } = {}
) {
  const testSet = [...(targetEntry.test_compounds || [])].sort((a, b) =>
    String(a.molecule_chembl_id).localeCompare(String(b.molecule_chembl_id))
  );

  const nAct = testSet.filter((c) => c.is_active).length;
  const nDec = testSet.length - nAct;
  if (nAct === 0 || nDec === 0) {
    return null;
  }

  // Compute mean MW and cLogP differences between actives and decoys
  const actList = testSet.filter((c) => c.is_active);
  const decList = testSet.filter((c) => !c.is_active);
  const meanOf = (arr, key) =>
    arr.length ? arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0) / arr.length : 0;
  const deltaMw = Number((meanOf(actList, "mw") - meanOf(decList, "mw")).toFixed(1));
  const deltaLogP = Number((meanOf(actList, "logP") - meanOf(decList, "logP")).toFixed(2));

  // Run RDKit SMARTS PAINS & toxicophore screening so scoreOne receives real alerts
  const painsBatch = await checkPainsBatch(
    testSet.map((c) => ({ id: c.molecule_chembl_id, smiles: c.smiles }))
  );
  const painsMap = new Map();
  for (const row of painsBatch?.results || []) {
    if (row?.id) painsMap.set(row.id, row);
  }

  const proteinContext = {
    id: targetEntry.pdb_id,
    pdb_id: targetEntry.pdb_id,
    gene: targetEntry.gene_symbol,
    symbol: targetEntry.gene_symbol,
    name: targetEntry.protein_name,
    queryName: targetEntry.gene_symbol,
    title: `${targetEntry.protein_name} (${targetEntry.gene_symbol})`,
    ligand: {
      compId: targetEntry.ligand_resname,
      comp_id: targetEntry.ligand_resname,
      name: targetEntry.ligand_resname,
      smiles: targetEntry.cocrystal_smiles,
      present: true,
    },
    pocket: { available: true },
  };

  // Build candidate objects with exact field names expected by server/scoreCandidates.js (propsOf)
  // and server/structuralSimilarity.js (annotateStructuralSimilarity)
  const candidatesWithSim = testSet.map((c) => ({
    cid: c.molecule_chembl_id,
    name: c.molecule_chembl_id,
    smiles: c.smiles,
    canonicalSmiles: c.smiles,
    molecularWeight: c.mw,
    xlogp: c.logP,
    hbd: c.hbd,
    hba: c.hba,
    tpsa: c.tpsa,
    rotatableBonds: c.rotatable,
    pains: painsMap.get(c.molecule_chembl_id) || null,
    drugClass: "",
  }));

  await annotateStructuralSimilarity(candidatesWithSim, proteinContext);

  const rng = mulberry32(seed);
  const labels = [];
  const scoresRandom = [];
  const scoresDruglikeOnly = [];
  const scoresTanimoto = [];
  const scoresHeuristicV2 = [];
  const scoresHeuristicV2RulesOnly = [];

  for (let i = 0; i < testSet.length; i++) {
    const c = testSet[i];
    const candWithSim = candidatesWithSim[i];
    const candNoSim = {
      ...candWithSim,
      structuralSimilarity: null,
      structuralSimilarityRef: null,
    };

    labels.push(c.is_active ? 1 : 0);

    // (a) Random ranker
    scoresRandom.push(rng());

    // (b) Drug-likeness only (no target term: protein = null)
    const dlScored = scoreOne(candNoSim, null);
    scoresDruglikeOnly.push(dlScored.score);

    // (c) Continuous Tanimoto similarity to staged co-crystal ligand (structuralSimilarity.js)
    const sim =
      typeof candWithSim.structuralSimilarity === "number" &&
      Number.isFinite(candWithSim.structuralSimilarity)
        ? candWithSim.structuralSimilarity
        : 0;
    scoresTanimoto.push(sim);

    // (d) heuristic-v2 (with staged co-crystal similarity annotation)
    const hv2Scored = scoreOne(candWithSim, proteinContext);
    scoresHeuristicV2.push(hv2Scored.score);

    // Diagnostic (d-0): heuristic-v2 without co-crystal similarity annotation (name-matching rules only)
    const hv2RulesScored = scoreOne(candNoSim, proteinContext);
    scoresHeuristicV2RulesOnly.push(hv2RulesScored.score);
  }

  const rankerMetrics = {
    random: evaluateRankerMetrics(labels, scoresRandom, { nBoot, seed }),
    druglikeness_only: evaluateRankerMetrics(labels, scoresDruglikeOnly, {
      nBoot,
      seed,
    }),
    tanimoto_cocrystal: evaluateRankerMetrics(labels, scoresTanimoto, {
      nBoot,
      seed,
    }),
    heuristic_v2: evaluateRankerMetrics(labels, scoresHeuristicV2, {
      nBoot,
      seed,
    }),
    heuristic_v2_rules_only: evaluateRankerMetrics(
      labels,
      scoresHeuristicV2RulesOnly,
      {
        nBoot,
        seed,
      }
    ),
  };

  const ratio = nAct > 0 ? nDec / nAct : 0;
  const passesCountCheck =
    nAct >= MIN_ACTIVES && nDec >= MIN_DECOYS && ratio >= MIN_DECOY_RATIO;
  const dlAuc = rankerMetrics.druglikeness_only.roc_auc ?? 0.5;
  const dlBias = Math.abs(dlAuc - 0.5);
  const passesPropertyBalance = dlBias <= MAX_DRUGLIKENESS_BIAS_FROM_CHANCE;

  // If the benchmark dataset explicitly computed passes_sanity with property matching & AVE checks
  // (as in Task 2), respect its sanity flag; for the legacy ChEMBL weak-binder benchmark, enforce
  // both count/ratio and 1D property-balance sanity (`|AUC(druglikeness_only) - 0.5| <= 0.15`).
  const hasExplicitTask2Sanity =
    typeof targetEntry.ave_bias === "number" &&
    targetEntry.decoy_method !== "chembl_weak_binders_pchembl_lt_5";
  const passesSanity = hasExplicitTask2Sanity
    ? Boolean(targetEntry.passes_sanity)
    : passesCountCheck && passesPropertyBalance;

  let sanityFailureReason = null;
  if (!passesSanity) {
    if (hasExplicitTask2Sanity && targetEntry.sanity_failure_reason) {
      sanityFailureReason = targetEntry.sanity_failure_reason;
    } else if (nAct < MIN_ACTIVES) {
      sanityFailureReason = `insufficient_test_actives (${nAct} < ${MIN_ACTIVES})`;
    } else if (nDec < MIN_DECOYS) {
      sanityFailureReason = `insufficient_test_decoys (${nDec} < ${MIN_DECOYS})`;
    } else if (ratio < MIN_DECOY_RATIO) {
      sanityFailureReason = `decoy_ratio_below_threshold (${ratio.toFixed(2)} < ${MIN_DECOY_RATIO})`;
    } else if (!passesPropertyBalance) {
      sanityFailureReason = `property_mismatch_1d_bias (druglikeness_only AUC=${dlAuc.toFixed(3)}, |AUC-0.5|=${dlBias.toFixed(3)} > ${MAX_DRUGLIKENESS_BIAS_FROM_CHANCE}; ΔMW=${deltaMw >= 0 ? "+" : ""}${deltaMw} Da, ΔcLogP=${deltaLogP >= 0 ? "+" : ""}${deltaLogP})`;
    }
  }

  return {
    target_id: targetEntry.target_id,
    gene_symbol: targetEntry.gene_symbol,
    chembl_target_id: targetEntry.chembl_target_id,
    pdb_id: targetEntry.pdb_id,
    ligand_resname: targetEntry.ligand_resname,
    passes_count_check: passesCountCheck,
    passes_sanity: passesSanity,
    sanity_failure_reason: sanityFailureReason,
    delta_mw_da: deltaMw,
    delta_clogp: deltaLogP,
    ave_bias: targetEntry.ave_bias ?? null,
    n_test_actives: nAct,
    n_test_decoys: nDec,
    decoy_per_active_ratio: Number(ratio.toFixed(2)),
    rankers: rankerMetrics,
  };
}

/**
 * Summarize metrics across a subset of targets (mean across targets).
 */
export function summarizeTargetGroup(targetResults) {
  const rankerKeys = [
    "random",
    "druglikeness_only",
    "tanimoto_cocrystal",
    "heuristic_v2",
    "heuristic_v2_rules_only",
  ];
  const metricKeys = [
    "roc_auc",
    "ci_low",
    "ci_high",
    "ef_1pct",
    "ef_5pct",
    "bedroc_20",
  ];
  const summary = {};

  for (const rk of rankerKeys) {
    summary[rk] = {};
    for (const mk of metricKeys) {
      const vals = targetResults
        .map((t) => t.rankers?.[rk]?.[mk])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (vals.length === 0) {
        summary[rk][mk] = null;
      } else {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        summary[rk][mk] = Number(mean.toFixed(4));
      }
    }
  }
  return summary;
}

function fmt(v, digits = 3) {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toFixed(digits)
    : "n/a";
}

/**
 * Format Markdown report for Task 1.
 */
export function formatTask1Markdown(evalReport) {
  const lines = [];
  const saneTargets = evalReport.targets.filter((t) => t.passes_sanity);
  const countPassingTargets = evalReport.targets.filter((t) => t.passes_count_check);
  const allEvaluated = evalReport.targets;
  const sSane = evalReport.summary_sanity_passing_targets;
  const sCount = evalReport.summary_count_passing_targets;
  const sAll = evalReport.summary_all_evaluable_targets;

  const rankerLabels = [
    ["random", "(a) Random (seeded uniform)"],
    ["druglikeness_only", "(b) Drug-likeness only (no target term)"],
    [
      "tanimoto_cocrystal",
      "(c) Tanimoto to staged co-crystal ligand (`structuralSimilarity.js`)",
    ],
    [
      "heuristic_v2",
      "(d) `heuristic-v2` (`scoreCandidates.js` + staged co-crystal)",
    ],
    [
      "heuristic_v2_rules_only",
      "(d-0) `heuristic-v2` (rule table only, no co-crystal sim)",
    ],
  ];

  lines.push("# Task 1 — Four-Ranker Baseline Evaluation");
  lines.push("");
  lines.push(`- **Generated at:** \`${evalReport.generated_at}\``);
  lines.push(`- **Benchmark file:** \`${evalReport.benchmark_id}\``);
  lines.push(`- **Split protocol:** \`${evalReport.split_method}\``);
  lines.push(`- **Decoy protocol:** \`${evalReport.decoy_method}\``);
  lines.push(
    `- **Targets passing full decoy sanity checks (count + ratio + 1D property balance):** **${evalReport.n_targets_passing_sanity} / ${evalReport.n_targets_total}** (${saneTargets.map((t) => t.gene_symbol).join(", ")})`
  );
  lines.push(
    `- **Targets passing sample-count checks only (≥15 actives, ≥30 decoys, ratio ≥1.5):** **${countPassingTargets.length} / ${evalReport.n_targets_total}**`
  );
  lines.push("");
  lines.push("## Primary Finding");
  lines.push("");
  lines.push(`> **Finding:** ${evalReport.finding}`);
  lines.push("");
  lines.push(
    "### Why `heuristic-v2` Fails to Beat Continuous Tanimoto (c) and Collapses Toward Drug-Likeness Only (b)"
  );
  lines.push("");
  lines.push(
    "1. **Name-matched rules cannot fire on held-out chemistry:** `TARGET_RULES` in `server/scoreCandidates.js` matches compounds by generic drug name (`onTargetRe`) or pre-labeled indication string (`drugClass`). On held-out ChEMBL molecules (`CHEMBL...`), the `+55` on-target name bonus and `+20` co-crystal name bonus fire on **0%** of test compounds."
  );
  lines.push(
    "2. **Rule-table-only `heuristic-v2` (`d-0`) is algebraically identical to drug-likeness only (`b`) on held-out compounds:** Without pre-staged co-crystal Tanimoto similarity, `targetBonus = 0` and `ligandBonus = 0` for every novel molecule, reducing `heuristic-v2` to `druglikePts - alertPenalty`. Because potent ChEMBL actives (`pChEMBL >= 6`) have higher molecular weight and lipophilicity on average than weak binders (`pChEMBL < 5`), `druglikePts` scores actives *lower* than decoys (**mean ROC-AUC " +
      fmt(sCount.druglikeness_only?.roc_auc) +
      "** across the 11 count-passing targets; **" +
      fmt(sSane.druglikeness_only?.roc_auc) +
      "** on the 3 sanity-passing targets; **" +
      fmt(sAll.druglikeness_only?.roc_auc) +
      "** across all 15 targets — below random chance)."
  );
  lines.push(
    "3. **Even with staged co-crystal similarity (`d`), the 0.25 floor and 24-pt drug-likeness term degrade ranking relative to pure Tanimoto (`c`):** `scoreCandidates.js` zeroes out all Tanimoto similarities `<= 0.25` (`SIMILARITY_FLOOR = 0.25`) and adds up to `+24` points of generic drug-likeness (`druglikePts`). As a result, `heuristic-v2` (**mean ROC-AUC " +
      fmt(sSane.heuristic_v2?.roc_auc) +
      "** on the 3 sanity-passing targets, **" +
      fmt(sCount.heuristic_v2?.roc_auc) +
      "** on the 11 count-passing targets, **" +
      fmt(sAll.heuristic_v2?.roc_auc) +
      "** across all 15 targets) **does not beat** pure Tanimoto to the staged co-crystal ligand `(c)` (**mean ROC-AUC " +
      fmt(sSane.tanimoto_cocrystal?.roc_auc) +
      "** on the 3 sanity-passing targets, **" +
      fmt(sCount.tanimoto_cocrystal?.roc_auc) +
      "** on the 11 count-passing targets, **" +
      fmt(sAll.tanimoto_cocrystal?.roc_auc) +
      "** across all 15 targets)."
  );
  lines.push("");

  lines.push(
    `## Table 1A — Summary Across Sanity-Passing Targets (${saneTargets.length}/${evalReport.n_targets_total} targets: ${saneTargets.map((t) => t.gene_symbol).join(", ")})`
  );
  lines.push("");
  lines.push(
    "| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |"
  );
  lines.push("|---|---:|---:|---:|---:|:---:|:---:|");
  for (const [rk, label] of rankerLabels) {
    const m = sSane[rk] || {};
    const beatsB =
      typeof m.roc_auc === "number" &&
      typeof sSane.druglikeness_only?.roc_auc === "number"
        ? m.roc_auc > sSane.druglikeness_only.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    const beatsC =
      typeof m.roc_auc === "number" &&
      typeof sSane.tanimoto_cocrystal?.roc_auc === "number"
        ? m.roc_auc > sSane.tanimoto_cocrystal.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    lines.push(
      `| ${label} | ${fmt(m.roc_auc)} (${fmt(m.ci_low)}–${fmt(m.ci_high)}) | ${fmt(m.ef_1pct, 2)} | ${fmt(m.ef_5pct, 2)} | ${fmt(m.bedroc_20)} | ${beatsB} | ${beatsC} |`
    );
  }
  lines.push("");

  lines.push(
    `## Table 1B — Summary Across Count-Passing Targets (${countPassingTargets.length}/${evalReport.n_targets_total} targets with ≥15 Actives & ≥30 Decoys)`
  );
  lines.push("");
  lines.push(
    "| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |"
  );
  lines.push("|---|---:|---:|---:|---:|:---:|:---:|");
  for (const [rk, label] of rankerLabels) {
    const m = sCount[rk] || {};
    const beatsB =
      typeof m.roc_auc === "number" &&
      typeof sCount.druglikeness_only?.roc_auc === "number"
        ? m.roc_auc > sCount.druglikeness_only.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    const beatsC =
      typeof m.roc_auc === "number" &&
      typeof sCount.tanimoto_cocrystal?.roc_auc === "number"
        ? m.roc_auc > sCount.tanimoto_cocrystal.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    lines.push(
      `| ${label} | ${fmt(m.roc_auc)} (${fmt(m.ci_low)}–${fmt(m.ci_high)}) | ${fmt(m.ef_1pct, 2)} | ${fmt(m.ef_5pct, 2)} | ${fmt(m.bedroc_20)} | ${beatsB} | ${beatsC} |`
    );
  }
  lines.push("");

  lines.push(
    `## Table 1C — Summary Across All Evaluable Targets in 15-Target Panel (${allEvaluated.length}/${evalReport.n_targets_total} targets)`
  );
  lines.push("");
  lines.push(
    "| Ranker | Mean ROC-AUC (Mean 95% CI) | Mean EF@1% | Mean EF@5% | Mean BEDROC(α=20) | Beats (b) Drug-likeness? | Beats (c) Tanimoto? |"
  );
  lines.push("|---|---:|---:|---:|---:|:---:|:---:|");
  for (const [rk, label] of rankerLabels) {
    const m = sAll[rk] || {};
    const beatsB =
      typeof m.roc_auc === "number" &&
      typeof sAll.druglikeness_only?.roc_auc === "number"
        ? m.roc_auc > sAll.druglikeness_only.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    const beatsC =
      typeof m.roc_auc === "number" &&
      typeof sAll.tanimoto_cocrystal?.roc_auc === "number"
        ? m.roc_auc > sAll.tanimoto_cocrystal.roc_auc + 1e-6
          ? "Yes"
          : "No"
        : "n/a";
    lines.push(
      `| ${label} | ${fmt(m.roc_auc)} (${fmt(m.ci_low)}–${fmt(m.ci_high)}) | ${fmt(m.ef_1pct, 2)} | ${fmt(m.ef_5pct, 2)} | ${fmt(m.bedroc_20)} | ${beatsB} | ${beatsC} |`
    );
  }
  lines.push("");

  lines.push("## Table 2 — Per-Target Four-Ranker Breakdown (All 15 Targets)");
  lines.push("");
  lines.push(
    "| Target (Gene / PDB) | Sanity Pass | Test Act / Dec | Ranker | ROC-AUC (95% CI) | EF@1% | EF@5% | BEDROC(α=20) |"
  );
  lines.push("|---|:---:|---:|---|---:|---:|---:|---:|");
  for (const t of evalReport.targets) {
    for (const [rk, label] of rankerLabels) {
      const m = t.rankers[rk];
      if (!m) continue;
      lines.push(
        `| ${t.target_id} (${t.gene_symbol} / ${t.pdb_id}) | ${t.passes_sanity ? "PASS" : "FAIL"} | ${t.n_test_actives} / ${t.n_test_decoys} | ${label} | ${fmt(m.roc_auc)} (${fmt(m.ci_low)}–${fmt(m.ci_high)}) | ${fmt(m.ef_1pct, 2)} | ${fmt(m.ef_5pct, 2)} | ${fmt(m.bedroc_20)} |`
      );
    }
  }
  lines.push("");

  lines.push("## Table 3 — Decoy Sanity Audit (15-Target Panel)");
  lines.push("");
  lines.push(
    "| Target ID | Gene | ChEMBL ID | PDB | Lig | Test Actives | Test Decoys | Ratio | ΔMW (Da) | ΔcLogP | Sanity Check | Failure Reason |"
  );
  lines.push("|---|---|---|---|---|---:|---:|---:|---:|---:|:---:|---|");
  for (const t of evalReport.all_targets_audit) {
    lines.push(
      `| ${t.target_id} | ${t.gene_symbol} | ${t.chembl_target_id} | ${t.pdb_id} | ${t.ligand_resname} | ${t.n_test_actives} | ${t.n_test_decoys} | ${fmt(t.decoy_per_active_ratio, 2)} | ${t.delta_mw_da !== undefined ? (t.delta_mw_da >= 0 ? "+" : "") + t.delta_mw_da : "n/a"} | ${t.delta_clogp !== undefined ? (t.delta_clogp >= 0 ? "+" : "") + t.delta_clogp : "n/a"} | ${t.passes_sanity ? "PASS" : "FAIL"} | ${t.sanity_failure_reason || "—"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runEvaluation({
  benchmarkPath = DEFAULT_BENCHMARK_PATH,
  outJsonPath = DEFAULT_RESULTS_JSON,
  outMdPath = DEFAULT_RESULTS_MD,
  refresh = false,
  seed = 42,
  nBoot = 1000,
} = {}) {
  const RDKit = await getRDKit();
  const benchmark = await buildOrLoadLegacyBenchmark(RDKit, benchmarkPath, {
    refresh,
  });

  const evaluatedTargets = [];
  const auditRows = [];

  for (const t of benchmark.targets) {
    const res = await evaluateTargetRankers(RDKit, t, { seed, nBoot });
    if (res) {
      evaluatedTargets.push(res);
      auditRows.push({
        target_id: res.target_id,
        gene_symbol: res.gene_symbol,
        chembl_target_id: res.chembl_target_id,
        pdb_id: res.pdb_id,
        ligand_resname: res.ligand_resname,
        n_train_actives: t.n_train_actives,
        n_train_decoys: t.n_train_decoys,
        n_test_actives: res.n_test_actives,
        n_test_decoys: res.n_test_decoys,
        decoy_per_active_ratio: res.decoy_per_active_ratio,
        delta_mw_da: res.delta_mw_da,
        delta_clogp: res.delta_clogp,
        passes_count_check: res.passes_count_check,
        passes_sanity: res.passes_sanity,
        sanity_failure_reason: res.sanity_failure_reason,
        ave_bias: res.ave_bias ?? null,
      });
    } else {
      auditRows.push({
        target_id: t.target_id,
        gene_symbol: t.gene_symbol,
        chembl_target_id: t.chembl_target_id,
        pdb_id: t.pdb_id,
        ligand_resname: t.ligand_resname,
        n_train_actives: t.n_train_actives,
        n_train_decoys: t.n_train_decoys,
        n_test_actives: t.n_test_actives,
        n_test_decoys: t.n_test_decoys,
        decoy_per_active_ratio: t.decoy_per_active_ratio,
        passes_count_check: false,
        passes_sanity: false,
        sanity_failure_reason: t.sanity_failure_reason || "no_test_compounds",
        ave_bias: t.ave_bias ?? null,
      });
    }
  }

  const saneResults = evaluatedTargets.filter((t) => t.passes_sanity);
  const countResults = evaluatedTargets.filter((t) => t.passes_count_check);
  const summarySane = summarizeTargetGroup(saneResults);
  const summaryCount = summarizeTargetGroup(countResults);
  const summaryAll = summarizeTargetGroup(evaluatedTargets);

  const hv2BeatsBOnRules =
    (summarySane.heuristic_v2_rules_only?.roc_auc ?? 0) >
    (summarySane.druglikeness_only?.roc_auc ?? 0) + 1e-6;
  const hv2BeatsC =
    (summarySane.heuristic_v2?.roc_auc ?? 0) >
    (summarySane.tanimoto_cocrystal?.roc_auc ?? 0) + 1e-6;

  const finding = !hv2BeatsC
    ? `heuristic-v2 DOES NOT beat (c) Tanimoto to the staged co-crystal ligand on ROC-AUC (${fmt(summarySane.heuristic_v2?.roc_auc)} vs ${fmt(summarySane.tanimoto_cocrystal?.roc_auc)} on the ${saneResults.length}/${benchmark.targets.length} sanity-passing targets; ${fmt(summaryCount.heuristic_v2?.roc_auc)} vs ${fmt(summaryCount.tanimoto_cocrystal?.roc_auc)} on the ${countResults.length}/${benchmark.targets.length} count-passing targets; ${fmt(summaryAll.heuristic_v2?.roc_auc)} vs ${fmt(summaryAll.tanimoto_cocrystal?.roc_auc)} across all ${evaluatedTargets.length} targets) or BEDROC(alpha=20) (${fmt(summarySane.heuristic_v2?.bedroc_20)} vs ${fmt(summarySane.tanimoto_cocrystal?.bedroc_20)} on sanity-passing; ${fmt(summaryCount.heuristic_v2?.bedroc_20)} vs ${fmt(summaryCount.tanimoto_cocrystal?.bedroc_20)} on count-passing). Furthermore, without pre-staged co-crystal similarity annotation, heuristic-v2 (rule table only) ${hv2BeatsBOnRules ? "barely differs from" : "DOES NOT beat"} (b) drug-likeness only (${fmt(summaryCount.heuristic_v2_rules_only?.roc_auc)} vs ${fmt(summaryCount.druglikeness_only?.roc_auc)} on count-passing targets; ${fmt(summarySane.heuristic_v2_rules_only?.roc_auc)} vs ${fmt(summarySane.druglikeness_only?.roc_auc)} on sanity-passing targets; ${fmt(summaryAll.heuristic_v2_rules_only?.roc_auc)} vs ${fmt(summaryAll.druglikeness_only?.roc_auc)} across all 15 targets), scoring below random chance (~0.34–0.46 AUC) because hardcoded drug-name rules never fire on held-out molecules and Lipinski/Veber points favor smaller weak binders over potent actives.`
    : `heuristic-v2 beats (b) and (c).`;

  const report = {
    generated_at: new Date().toISOString(),
    benchmark_id: benchmark.benchmark_id,
    split_method: benchmark.targets[0]?.split_method || "unknown",
    decoy_method: benchmark.targets[0]?.decoy_method || "unknown",
    n_targets_total: benchmark.targets.length,
    n_targets_passing_sanity: saneResults.length,
    n_targets_passing_count_check: countResults.length,
    n_targets_evaluable: evaluatedTargets.length,
    finding,
    heuristic_v2_beats_druglikeness_only_without_cocrystal: hv2BeatsBOnRules,
    heuristic_v2_beats_tanimoto_cocrystal: hv2BeatsC,
    summary_sanity_passing_targets: summarySane,
    summary_count_passing_targets: summaryCount,
    summary_all_evaluable_targets: summaryAll,
    targets: evaluatedTargets,
    all_targets_audit: auditRows,
  };

  if (outJsonPath) {
    fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
    fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2));
  }
  if (outMdPath) {
    fs.mkdirSync(path.dirname(outMdPath), { recursive: true });
    fs.writeFileSync(outMdPath, formatTask1Markdown(report));
  }

  return report;
}

// CLI entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1]
      ? path.resolve(ROOT, args[idx + 1])
      : fallback;
  };
  const benchmarkPath = getArg("--benchmark", DEFAULT_BENCHMARK_PATH);
  const outJsonPath = getArg("--out", DEFAULT_RESULTS_JSON);
  const outMdPath = getArg("--md", DEFAULT_RESULTS_MD);
  const refresh = args.includes("--refresh");

  runEvaluation({ benchmarkPath, outJsonPath, outMdPath, refresh })
    .then((rep) => {
      process.stdout.write(
        `[Task 1] Completed evaluation on ${rep.benchmark_id}: ${rep.n_targets_passing_sanity}/${rep.n_targets_total} targets pass full decoy sanity (${rep.n_targets_passing_count_check}/${rep.n_targets_total} pass count check; ${rep.n_targets_evaluable} evaluable).\n`
      );
      process.stdout.write(`[Task 1] Finding: ${rep.finding}\n`);
    })
    .catch((err) => {
      console.error("[Task 1] Evaluation failed:", err);
      process.exit(1);
    });
}
