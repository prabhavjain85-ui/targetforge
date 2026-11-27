#!/usr/bin/env node
/**
 * Task 12 — End-to-End Pipeline Retrospective Validation
 * (`benchmark/docking/scripts/end_to_end_pipeline.mjs`)
 *
 * WHY THIS EXISTS
 * Every benchmark committed so far measures one component in isolation:
 * target ranking (Tasks 3, 4, 7, 8, 10), structure scoring, or compound
 * ranking (Tasks 1, 2). The product is a funnel — target discovery ->
 * PDB structure staging -> compound screening — and weak stages compose
 * multiplicatively. This script measures what survives the whole funnel
 * end to end on the committed retrospective split.
 *
 * PROTOCOL & LEAKAGE CONTROLS
 *   1. Panel: the 11 held-out test diseases from the committed Open Targets
 *      21.04 -> 26.09 split (`task3_ot_21_04_retrospective_snapshot.json.gz`).
 *      The 11 training diseases are never touched; nothing is fitted here.
 *   2. Ground truth: `(disease, target, drug)` triples where:
 *      - the target was associated with the disease in 21.04 and had NO
 *        clinical drug for that disease in 21.04 (`clinical_2021 == 0`);
 *      - the target acquired a clinical or approved drug for that disease by
 *        26.09 (`acquired_disease_clinical == 1`);
 *      - Open Targets 26.09 links a specific Small Molecule drug to that
 *        (disease, target) pair via `drugAndClinicalCandidates` + MoA;
 *      - that drug is present with valid SMILES in TargetForge's committed
 *        screening library (`server/data/clinicalLibrary.json`, 9,409
 *        Phase 2+ small molecules), so the full funnel could in principle
 *        recover it.
 *      Every excluded non-small-molecule / unmapped / out-of-library pair is
 *      counted explicitly before computing funnel attrition.
 *   3. Stage 1 (Target ranking, 21.04 data ONLY):
 *      - TargetForge Discovery (default): `understudyScore(biologySignal)`
 *        with `passesEvidenceFloor` filtering, matching `server/noveltyScore.js`.
 *      - TargetForge Repurposing (shipped Task 10): `repurposingSignal(drugCount_2021, pubCount_2021)`.
 *      - Trivial baseline: `publicationCount_2021` alone (no TargetForge score).
 *      Evaluated at N in {10, 25, 50} targets per disease.
 *   4. Stage 2 (Structure staging, pre-2021-05-05 RCSB PDB ONLY):
 *      - Query RCSB Search API v2 strictly filtered to
 *        `rcsb_accession_info.initial_release_date <= "2021-05-05T23:59:59Z"`
 *        so no post-2021 co-crystal structure can leak a 2021-2026 drug.
 *      - TargetForge pipelines stage the #1 PDB by the shipped Target Selection
 *        Score (`server/targetSelectionScore.js`).
 *      - Trivial baseline stages the highest-resolution pre-2021 holo PDB
 *        (with a non-additive co-crystal ligand) with no TargetForge scoring.
 *   5. Stage 3 (Compound ranking over `clinicalLibrary.json`, 9,409 compounds):
 *      - TargetForge pipelines run the exact shipped default compound funnel:
 *        `prefilterApprovedDrug` (MW <= 900, <5 Lipinski/Veber fails) ->
 *        Morgan r=2 2048-bit Tanimoto to the staged co-crystal ligand
 *        (`server/structuralSimilarity.js`) -> `scoreOne` (`heuristic-v2`
 *        tie-break, or primary ranker if the staged PDB is apo).
 *      - Trivial baseline ranks all 9,409 compounds strictly by raw Morgan
 *        Tanimoto to the staged co-crystal ligand (no prefilter, no rules,
 *        no TargetForge scoring at all).
 *      Evaluated at K in {10, 25, 50, 100} compounds per staged target.
 *
 * Outputs:
 *   benchmark/docking/data/task12_end_to_end_cache.json.gz
 *   benchmark/docking/results/task12_end_to_end.json
 *   benchmark/docking/TASK12_END_TO_END.md
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

import { getRDKit } from "../../../server/rdkitLoader.js";
import {
  biologySignal,
  passesEvidenceFloor,
  repurposingSignal,
  understudyScore,
} from "../../../server/noveltyScore.js";
import {
  extractFromGraphqlEntry,
  rankScoredTargets,
  scoreTargetFeatures,
} from "../../../server/targetSelectionScore.js";
import { tanimotoBits } from "../../../server/structuralSimilarity.js";
import { prefilterApprovedDrug } from "../../../server/repurposingScreen.js";
import { buildTargetContext } from "../../../server/targetContext.js";
import { scoreOne } from "../../../server/scoreCandidates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DOCKING_DIR = path.resolve(__dirname, "..");

const SNAPSHOT_PATH = path.join(
  DOCKING_DIR,
  "data",
  "task3_ot_21_04_retrospective_snapshot.json.gz"
);
const CANCER_LABELS_PATH = path.join(
  DOCKING_DIR,
  "data",
  "disease_cancer_labels.json"
);
const CLINICAL_LIB_PATH = path.join(
  REPO_ROOT,
  "server",
  "data",
  "clinicalLibrary.json"
);
const CACHE_PATH = path.join(
  DOCKING_DIR,
  "data",
  "task12_end_to_end_cache.json.gz"
);
const OUT_JSON = path.join(DOCKING_DIR, "results", "task12_end_to_end.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK12_END_TO_END.md");

const OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql";
const RCSB_SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query";
const RCSB_GQL = "https://data.rcsb.org/graphql";
const RCSB_CHEMCOMP = "https://data.rcsb.org/rest/v1/core/chemcomp";

// Open Targets 21.04 publication date — strict temporal cutoff for PDB staging.
const PRE_CUTOFF_DATE = "2021-05-05";
const PRE_CUTOFF_ISO = "2021-05-05T23:59:59Z";

const TARGET_NS = [10, 25, 50];
const COMPOUND_KS = [10, 25, 50, 100];
const MIN_CLUSTERS_FOR_CI = 4;

const RCSB_ENTRY_GQL = `query($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    struct { title }
    rcsb_accession_info { initial_release_date }
    rcsb_entry_info {
      resolution_combined
      nonpolymer_entity_count
      deposited_polymer_monomer_count
      deposited_modeled_polymer_monomer_count
      deposited_unmodeled_polymer_monomer_count
      experimental_method
    }
    refine {
      ls_R_factor_R_free
      ls_R_factor_R_work
    }
    exptl { method }
    rcsb_entry_container_identifiers { entry_id non_polymer_entity_ids }
    nonpolymer_entities {
      pdbx_entity_nonpoly { comp_id name }
      rcsb_nonpolymer_entity { pdbx_description formula_weight }
      rcsb_nonpolymer_entity_container_identifiers { nonpolymer_comp_id }
      nonpolymer_entity_instances {
        rcsb_id
        rcsb_target_neighbors {
          distance
          target_comp_id
        }
      }
    }
  }
}`;

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function fetchJson(url, options = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 204) return null;
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && i < retries) {
          await new Promise((r) => setTimeout(r, 300 * (i + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const txt = await res.text();
      return txt.trim() ? JSON.parse(txt) : null;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchDiseaseDrugs2609(efoId) {
  const query = `query($efoId: String!) {
    meta { dataVersion { year month iteration } }
    disease(efoId: $efoId) {
      id
      name
      drugAndClinicalCandidates {
        count
        rows {
          maxClinicalStage
          drug {
            id
            name
            drugType
            mechanismsOfAction {
              rows {
                targets { id approvedSymbol }
              }
            }
          }
        }
      }
    }
  }`;
  const data = await fetchJson(OT_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "TargetForge-Benchmark/1.0",
    },
    body: JSON.stringify({ query, variables: { efoId } }),
  });
  if (data?.errors?.length) {
    throw new Error(`Open Targets error for ${efoId}: ${data.errors[0].message}`);
  }
  const dv = data?.data?.meta?.dataVersion;
  const release = dv ? `${dv.year}.${String(dv.month).padStart(2, "0")}` : null;
  const rows = data?.data?.disease?.drugAndClinicalCandidates?.rows || [];
  return { release, rows };
}

/**
 * Search RCSB for human experimental structures of a gene symbol released on
 * or before 2021-05-05 (the Open Targets 21.04 cutoff). Uses exact human gene
 * symbol attribution first, so unrelated complexes are not accidentally staged.
 */
async function searchPre2021PdbsForGene(symbol) {
  const body = {
    query: {
      type: "group",
      logical_operator: "and",
      nodes: [
        {
          type: "terminal",
          service: "text",
          parameters: {
            attribute: "rcsb_entity_source_organism.ncbi_scientific_name",
            operator: "exact_match",
            value: "Homo sapiens",
          },
        },
        {
          type: "terminal",
          service: "text",
          parameters: {
            attribute: "rcsb_polymer_entity_container_identifiers.gene_name",
            operator: "exact_match",
            value: symbol,
          },
        },
        {
          type: "terminal",
          service: "text",
          parameters: {
            attribute: "rcsb_accession_info.initial_release_date",
            operator: "less_or_equal",
            value: PRE_CUTOFF_ISO,
          },
        },
      ],
    },
    return_type: "entry",
    request_options: {
      paginate: { start: 0, rows: 12 },
      sort: [{ sort_by: "score", direction: "desc" }],
    },
  };

  let data = null;
  try {
    data = await fetchJson(RCSB_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    data = null;
  }

  let ids = (data?.result_set || []).map((r) => r.identifier).filter(Boolean);

  // Fallback to gene symbol in rcsb_polymer_entity.rcsb_gene_name.value if the
  // container_identifiers attribute returned empty.
  if (!ids.length) {
    const fallbackBody = {
      ...body,
      query: {
        ...body.query,
        nodes: [
          body.query.nodes[0],
          {
            type: "terminal",
            service: "text",
            parameters: {
              attribute: "rcsb_gene_name.value",
              operator: "exact_match",
              value: symbol,
            },
          },
          body.query.nodes[2],
        ],
      },
    };
    try {
      const fb = await fetchJson(RCSB_SEARCH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });
      ids = (fb?.result_set || []).map((r) => r.identifier).filter(Boolean);
    } catch {
      ids = [];
    }
  }

  return [...new Set(ids)];
}

async function fetchRcsbEntriesBatched(ids) {
  const unique = [...new Set(ids)];
  const out = {};
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const data = await fetchJson(RCSB_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: RCSB_ENTRY_GQL, variables: { ids: slice } }),
    });
    for (const entry of data?.data?.entries || []) {
      if (entry?.rcsb_id) out[entry.rcsb_id.toUpperCase()] = entry;
    }
  }
  return out;
}

async function fetchChemCompSmiles(compId) {
  const id = String(compId || "").trim().toUpperCase();
  if (!id) return "";
  try {
    const record = await fetchJson(`${RCSB_CHEMCOMP}/${encodeURIComponent(id)}`);
    if (!record) return "";
    const desc = record.rcsb_chem_comp_descriptor || {};
    let smiles = String(desc.SMILES_stereo || desc.SMILES || "").trim();
    if (!smiles) {
      const list = Array.isArray(record.pdbx_chem_comp_descriptor)
        ? record.pdbx_chem_comp_descriptor
        : [];
      const canonical =
        list.find((d) => /^SMILES_CANONICAL$/i.test(d?.type)) ||
        list.find((d) => /^SMILES$/i.test(d?.type));
      smiles = String(canonical?.descriptor || "").trim();
    }
    return smiles;
  } catch {
    return "";
  }
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Rank 21.04 targets for a single disease under each of the 3 target rankers.
 * Strictly uses 21.04 fields only.
 */
function rankTargets2104(targets) {
  const enriched = targets.map((t) => {
    const dt = t.datatypeScores_2021 || {};
    const overall = Number(t.overallScore_2021) || 0;
    const bio = biologySignal(dt, overall);
    const understudy = understudyScore(bio);
    const rep = repurposingSignal(t.drugCount_2021 || 0, t.publicationCount_2021 || 0);
    const floor = passesEvidenceFloor({
      overallScore: overall,
      datatypeScores: dt,
      geneticScore: dt.genetic_association || 0,
      somaticScore: dt.somatic_mutation || 0,
    });
    return {
      ...t,
      understudy_2021: understudy,
      repurposing_2021: rep,
      passes_floor_2021: floor,
      genetic_2021: dt.genetic_association || 0,
      pub_2021: Number(t.publicationCount_2021) || 0,
    };
  });

  // 1. TargetForge Discovery (default `novel_discovery` in server/noveltyScore.js):
  //    passesEvidenceFloor targets sorted by understudyScore desc, then genetic desc, then symbol.
  const discovery = enriched
    .filter((r) => r.passes_floor_2021)
    .sort((a, b) => {
      if (b.understudy_2021 !== a.understudy_2021) return b.understudy_2021 - a.understudy_2021;
      if (b.genetic_2021 !== a.genetic_2021) return b.genetic_2021 - a.genetic_2021;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

  // 2. TargetForge Repurposing (shipped Task 10 `repurposingSignal` in server/noveltyScore.js):
  //    overall >= 0.05 and (drugCount > 0 or passesFloor), sorted by repurposingSignal desc.
  const repurposing = enriched
    .filter(
      (r) =>
        (Number(r.overallScore_2021) || 0) >= 0.05 &&
        ((r.drugCount_2021 || 0) > 0 || r.passes_floor_2021)
    )
    .sort((a, b) => {
      if (b.repurposing_2021 !== a.repurposing_2021) return b.repurposing_2021 - a.repurposing_2021;
      if (b.pub_2021 !== a.pub_2021) return b.pub_2021 - a.pub_2021;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

  // 3. Trivial baseline: publicationCount_2021 descending across all 21.04 targets.
  const baseline = [...enriched].sort((a, b) => {
    if (b.pub_2021 !== a.pub_2021) return b.pub_2021 - a.pub_2021;
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  return { discovery, repurposing, baseline };
}

/**
 * Given pre-2021 RCSB entries for a gene symbol, pick:
 *   - targetforge_pdb: #1 by Target Selection Score (`scoreTargetFeatures`)
 *   - baseline_pdb:    best-resolution pre-2021 holo PDB (no Target Selection Score)
 */
function selectPre2021Structures(symbol, pdbIds, entryMap, chemCompSmilesMap) {
  const pre2021Entries = [];
  for (const id of pdbIds) {
    const raw = entryMap[id.toUpperCase()];
    if (!raw) continue;
    const rel = String(raw?.rcsb_accession_info?.initial_release_date || "").slice(0, 10);
    // Double-check strict pre-21.04 cutoff on the returned metadata.
    if (!rel || rel > PRE_CUTOFF_DATE) continue;
    const feat = extractFromGraphqlEntry(raw);
    if (!feat) continue;
    const scored = scoreTargetFeatures(feat);
    // Attach resolved co-crystal SMILES for each non-additive ligand
    const ligandsWithSmiles = (scored.ligands || []).map((l) => {
      const cid = String(l.compId || "").toUpperCase();
      return {
        ...l,
        compId: cid,
        smiles: chemCompSmilesMap[cid] || "",
      };
    });
    const primaryHolo = ligandsWithSmiles.find((l) => l.smiles) || null;
    pre2021Entries.push({
      ...scored,
      releaseDate: rel,
      geneSymbol: symbol,
      ligands: ligandsWithSmiles,
      primaryHoloLigand: primaryHolo,
    });
  }

  if (!pre2021Entries.length) {
    return {
      n_pre2021_pdbs: 0,
      targetforge_pdb: null,
      baseline_pdb: null,
    };
  }

  const rankedByTss = rankScoredTargets(pre2021Entries);
  const tfTop = rankedByTss[0];

  const holoOnly = pre2021Entries.filter((e) => Boolean(e.primaryHoloLigand?.smiles));
  holoOnly.sort((a, b) => {
    const ra = a.resolutionValue ?? 99;
    const rb = b.resolutionValue ?? 99;
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id));
  });
  const baseTop = holoOnly[0] || null;

  const slim = (e) =>
    e
      ? {
          id: e.id,
          title: e.title,
          geneSymbol: symbol,
          releaseDate: e.releaseDate,
          score: e.score,
          resolutionValue: e.resolutionValue,
          hasLigand: e.hasLigand,
          pocket: e.pocket,
          pocketStats: e.pocketStats,
          ligands: e.ligands.slice(0, 3).map((l) => ({
            compId: l.compId,
            name: l.name,
            formulaWeight: l.formulaWeight,
            smiles: l.smiles,
          })),
          ligand: e.primaryHoloLigand
            ? {
                compId: e.primaryHoloLigand.compId,
                name: e.primaryHoloLigand.name,
                smiles: e.primaryHoloLigand.smiles,
              }
            : null,
        }
      : null;

  return {
    n_pre2021_pdbs: pre2021Entries.length,
    targetforge_pdb: slim(tfTop),
    baseline_pdb: slim(baseTop),
  };
}

function makeFingerprint(RDKit, smiles) {
  let mol = null;
  try {
    mol = RDKit.get_mol(String(smiles || "").trim());
    if (!mol) return null;
    return mol.get_morgan_fp_as_uint8array(JSON.stringify({ radius: 2, nBits: 2048 }));
  } catch {
    return null;
  } finally {
    mol?.delete?.();
  }
}

/**
 * Evaluate one end-to-end funnel across all 11 held-out diseases.
 *
 * mode:
 *   - "targetforge_discovery":   understudyScore -> TSS PDB -> prefilter + Tanimoto + heuristic-v2
 *   - "targetforge_repurposing": repurposingSignal -> TSS PDB -> prefilter + Tanimoto + heuristic-v2
 *   - "trivial_baseline":        publicationCount_2021 -> best-res pre-2021 holo PDB -> raw Tanimoto
 */
function evaluateFunnel({
  mode,
  diseaseData,
  structureBySymbol,
  library,
  libraryFps,
  prefilterKeep,
  RDKit,
}) {
  const isBaseline = mode === "trivial_baseline";
  const targetRankKey =
    mode === "targetforge_discovery"
      ? "discovery"
      : mode === "targetforge_repurposing"
        ? "repurposing"
        : "baseline";

  // Cache compound rank lookup per (symbol, mode) so the same target isn't rescored
  // across multiple diseases.
  const compoundRankCache = new Map();

  function getCompoundRanksForSymbol(symbol) {
    const cacheKey = `${mode}::${symbol}`;
    if (compoundRankCache.has(cacheKey)) return compoundRankCache.get(cacheKey);

    const structInfo = structureBySymbol[symbol];
    const staged = isBaseline ? structInfo?.baseline_pdb : structInfo?.targetforge_pdb;

    if (!staged) {
      const res = {
        stage2Status: "no_pre2021_pdb",
        stagedPdbId: null,
        stagedLigandCompId: null,
        rankByDrugIdx: null,
        droppedByPrefilter: null,
      };
      compoundRankCache.set(cacheKey, res);
      return res;
    }

    const refSmiles = staged.ligand?.smiles || "";
    const refFp = refSmiles ? makeFingerprint(RDKit, refSmiles) : null;

    if (isBaseline) {
      if (!refFp) {
        const res = {
          stage2Status: "no_cocrystal_ligand",
          stagedPdbId: staged.id,
          stagedLigandCompId: null,
          rankByDrugIdx: null,
          droppedByPrefilter: null,
        };
        compoundRankCache.set(cacheKey, res);
        return res;
      }
      // Trivial baseline: pure raw Morgan Tanimoto to co-crystal ligand, no TargetForge scoring.
      const scored = [];
      for (let i = 0; i < library.length; i++) {
        const fp = libraryFps[i];
        const sim = fp ? tanimotoBits(refFp, fp) : -1;
        scored.push({ idx: i, sim: sim ?? -1 });
      }
      scored.sort((a, b) => {
        if (b.sim !== a.sim) return b.sim - a.sim;
        return a.idx - b.idx;
      });
      const rankByDrugIdx = new Int32Array(library.length);
      for (let r = 0; r < scored.length; r++) {
        rankByDrugIdx[scored[r].idx] = r + 1;
      }
      const res = {
        stage2Status: "staged_holo_pdb",
        stagedPdbId: staged.id,
        stagedLigandCompId: staged.ligand.compId,
        rankByDrugIdx,
        droppedByPrefilter: new Set(),
      };
      compoundRankCache.set(cacheKey, res);
      return res;
    }

    // TargetForge default compound funnel:
    //   1) prefilterApprovedDrug
    //   2) Tanimoto to co-crystal ligand (if holo) + heuristic-v2 (`scoreOne`) tie-break;
    //      if apo (no co-crystal ligand), heuristic-v2 alone orders the list (matching scoreCandidates.js).
    const ctx = buildTargetContext(staged);
    const haveSim = Boolean(refFp);
    const scored = [];
    const droppedByPrefilter = new Set();

    for (let i = 0; i < library.length; i++) {
      if (!prefilterKeep[i]) {
        droppedByPrefilter.add(i);
        continue;
      }
      const drug = library[i];
      const sim = haveSim && libraryFps[i] ? tanimotoBits(refFp, libraryFps[i]) : null;
      const candidate =
        sim !== null ? { ...drug, structuralSimilarity: sim } : drug;
      const local = scoreOne(candidate, ctx || staged);
      scored.push({
        idx: i,
        sim: sim ?? -1,
        score: local.score,
        passCount: local.passCount,
      });
    }

    scored.sort((a, b) => {
      if (haveSim && b.sim !== a.sim) return b.sim - a.sim;
      if (b.score !== a.score) return b.score - a.score;
      if (b.passCount !== a.passCount) return b.passCount - a.passCount;
      return a.idx - b.idx;
    });

    const rankByDrugIdx = new Int32Array(library.length);
    for (let r = 0; r < scored.length; r++) {
      rankByDrugIdx[scored[r].idx] = r + 1;
    }

    const res = {
      stage2Status: haveSim ? "staged_holo_pdb" : "staged_apo_pdb_no_cocrystal",
      stagedPdbId: staged.id,
      stagedLigandCompId: staged.ligand?.compId || null,
      rankByDrugIdx,
      droppedByPrefilter,
    };
    compoundRankCache.set(cacheKey, res);
    return res;
  }

  const byN = {};

  for (const N of TARGET_NS) {
    let totalRecoverablePairs = 0;
    let survivedTargetStage = 0;
    let lostAtTargetStage = 0;
    let lostAtNoPre2021Pdb = 0;
    let lostAtNoCocrystal = 0;
    let survivedHoloStructure = 0;
    let survivedAnyStructure = 0;
    let lostAtCompoundPrefilter = 0;

    const recoveredAtK = Object.fromEntries(COMPOUND_KS.map((k) => [k, 0]));
    const emittedAtK = Object.fromEntries(COMPOUND_KS.map((k) => [k, 0]));
    const perDisease = [];
    const recoveredExamples = [];

    for (const d of diseaseData) {
      const topTargets = d.rankings[targetRankKey].slice(0, N);
      const topTargetSet = new Map();
      topTargets.forEach((t, idx) => topTargetSet.set(t.targetId, idx + 1));

      // Count total recommendations emitted across all top-N targets that actually stage a ranked list
      let diseaseStagedCount = 0;
      for (const t of topTargets) {
        const cr = getCompoundRanksForSymbol(t.symbol);
        if (cr.rankByDrugIdx) diseaseStagedCount += 1;
      }
      for (const k of COMPOUND_KS) {
        emittedAtK[k] += diseaseStagedCount * k;
      }

      const dPairs = d.recoverablePairs;
      totalRecoverablePairs += dPairs.length;

      let dSurvivedTarget = 0;
      let dSurvivedStructure = 0;
      const dRecAtK = Object.fromEntries(COMPOUND_KS.map((k) => [k, 0]));

      for (const pair of dPairs) {
        const targetRank = topTargetSet.get(pair.targetId) || null;
        if (!targetRank) {
          lostAtTargetStage += 1;
          continue;
        }
        survivedTargetStage += 1;
        dSurvivedTarget += 1;

        const cr = getCompoundRanksForSymbol(pair.symbol);
        if (cr.stage2Status === "no_pre2021_pdb") {
          lostAtNoPre2021Pdb += 1;
          continue;
        }
        if (cr.stage2Status === "no_cocrystal_ligand") {
          lostAtNoCocrystal += 1;
          continue;
        }
        if (cr.stage2Status === "staged_apo_pdb_no_cocrystal") {
          lostAtNoCocrystal += 1;
          // TargetForge still falls back to heuristic-v2 on apo structures, so we
          // record apo separately while still checking whether heuristic-v2 recovers the drug!
        } else {
          survivedHoloStructure += 1;
        }
        survivedAnyStructure += 1;
        dSurvivedStructure += 1;

        if (cr.droppedByPrefilter?.has(pair.libraryIdx)) {
          lostAtCompoundPrefilter += 1;
          continue;
        }

        const compRank = cr.rankByDrugIdx ? cr.rankByDrugIdx[pair.libraryIdx] : 0;
        for (const k of COMPOUND_KS) {
          if (compRank > 0 && compRank <= k) {
            recoveredAtK[k] += 1;
            dRecAtK[k] += 1;
          }
        }
        if (compRank > 0 && compRank <= 100) {
          recoveredExamples.push({
            disease: d.disease_name,
            target: pair.symbol,
            target_rank: targetRank,
            pdb_id: cr.stagedPdbId,
            cocrystal_ligand: cr.stagedLigandCompId,
            stage2_status: cr.stage2Status,
            drug_id: pair.drugId,
            drug_name: pair.drugName,
            compound_rank: compRank,
            drug_count_2021: pair.drugCount_2021,
          });
        }
      }

      perDisease.push({
        disease_id: d.disease_id_2026,
        disease_name: d.disease_name,
        stratum: d.stratum,
        n_recoverable_pairs: dPairs.length,
        n_top_targets_staged: diseaseStagedCount,
        survived_target_stage: dSurvivedTarget,
        survived_structure_stage: dSurvivedStructure,
        recovered_at_k: dRecAtK,
      });
    }

    const metricsByK = {};
    for (const k of COMPOUND_KS) {
      const rec = recoveredAtK[k];
      const em = emittedAtK[k];
      const lostAtCompoundRanking =
        survivedAnyStructure - lostAtCompoundPrefilter - rec;
      metricsByK[String(k)] = {
        k,
        recovered_pairs: rec,
        total_recoverable_pairs: totalRecoverablePairs,
        recall:
          totalRecoverablePairs > 0
            ? Number((rec / totalRecoverablePairs).toFixed(4))
            : null,
        emitted_recommendations: em,
        precision: em > 0 ? Number((rec / em).toFixed(6)) : null,
        attrition: {
          total_recoverable_pairs: totalRecoverablePairs,
          lost_at_target_stage: lostAtTargetStage,
          lost_at_structure_no_pre2021_pdb: lostAtNoPre2021Pdb,
          lost_at_structure_no_cocrystal: lostAtNoCocrystal,
          lost_at_compound_prefilter: lostAtCompoundPrefilter,
          lost_at_compound_ranking: lostAtCompoundRanking,
          recovered: rec,
        },
      };
    }

    byN[String(N)] = {
      n_targets_per_disease: N,
      total_recoverable_pairs: totalRecoverablePairs,
      survived_target_stage: survivedTargetStage,
      target_stage_recall:
        totalRecoverablePairs > 0
          ? Number((survivedTargetStage / totalRecoverablePairs).toFixed(4))
          : null,
      survived_holo_structure: survivedHoloStructure,
      survived_any_structure: survivedAnyStructure,
      lost_at_target_stage: lostAtTargetStage,
      lost_at_structure_no_pre2021_pdb: lostAtNoPre2021Pdb,
      lost_at_structure_no_cocrystal: lostAtNoCocrystal,
      lost_at_compound_prefilter: lostAtCompoundPrefilter,
      by_k: metricsByK,
      per_disease: perDisease,
      recovered_examples_top100: recoveredExamples.sort(
        (a, b) => a.compound_rank - b.compound_rank
      ),
    };
  }

  return byN;
}

function fmtPct(num, den) {
  if (!den) return "—";
  return `${((100 * num) / den).toFixed(1)}%`;
}

function fmtRate(v, digits = 4) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Number(v).toFixed(digits);
}

function renderMarkdown(report) {
  const L = [];
  L.push("# Task 12 — End-to-End Pipeline Retrospective Measurement");
  L.push("");
  L.push(`Generated: ${report.generated_at}`);
  L.push(
    `Split: Open Targets \`${report.historical_release}\` (May 2021) → \`${report.current_release}\` across the **${report.n_held_out_diseases} held-out test diseases** (${report.n_contributing_diseases} with 21.04 targets; 0 parameters fitted).`
  );
  L.push("");
  L.push("## Headline finding");
  L.push("");
  L.push(report.headline);
  L.push("");

  const gt = report.ground_truth_construction;
  L.push("## Ground-truth construction (11 held-out diseases)");
  L.push("");
  L.push(
    "A ground-truth pair is only recoverable end to end if the target had no clinical drug for that disease in 21.04 (`clinical_2021 == 0`), acquired a clinical/approved **small-molecule** drug for that disease by 26.09 linked via Open Targets mechanism-of-action, and that drug is present with valid SMILES in TargetForge's committed screening library (`server/data/clinicalLibrary.json`, 9,409 Phase 2+ small molecules)."
  );
  L.push("");
  L.push("| Filter step | Count |");
  L.push("| --- | ---: |");
  L.push(
    `| Held-out (disease, target) acquisitions (\`acquired_disease_clinical == 1\`) | ${gt.total_acquired_disease_target_pairs} |`
  );
  L.push(
    `| Acquisitions with ≥1 small-molecule drug linked in Open Targets 26.09 | ${gt.acquired_targets_with_small_molecule} |`
  );
  L.push(
    `| Raw (disease, target, small-molecule drug) triples in Open Targets 26.09 | ${gt.total_small_molecule_triples} |`
  );
  L.push(
    `| **Recoverable triples** (drug present in \`clinicalLibrary.json\` with valid SMILES) | **${gt.recoverable_triples}** |`
  );
  L.push(
    `|   — across unique (disease, target) pairs | ${gt.recoverable_unique_disease_targets} |`
  );
  L.push(
    `|   — across held-out diseases with ≥1 recoverable pair | ${gt.diseases_with_recoverable_pairs}/${report.n_held_out_diseases} |`
  );
  L.push(
    `|   — of which targets were globally undrugged in 2021 (Cohort 2, \`drugCount_2021 == 0\`) | ${gt.recoverable_triples_cohort2_undrugged} |`
  );
  L.push(
    `|   — of which targets already had a drug elsewhere in 2021 (repurposing, \`drugCount_2021 > 0\`) | ${gt.recoverable_triples_repurposing} |`
  );
  L.push("");

  L.push("## End-to-end Recall@K and Precision@K (all recoverable triples)");
  L.push("");
  L.push(
    "Three funnels evaluated on the exact same 21.04 inputs, strict pre-2021-05-05 RCSB PDB structures (zero post-2021 structure leakage), and 9,409-compound screening library:"
  );
  L.push(
    "- **TargetForge Discovery (default):** `understudyScore` target ranker → #1 pre-2021 PDB by Target Selection Score → `prefilterApprovedDrug` + Tanimoto + `heuristic-v2`."
  );
  L.push(
    "- **TargetForge Repurposing:** shipped Task 10 `repurposingSignal` target ranker → #1 pre-2021 PDB by Target Selection Score → `prefilterApprovedDrug` + Tanimoto + `heuristic-v2`."
  );
  L.push(
    "- **Trivial baseline:** 21.04 `publicationCount` target ranker → highest-resolution pre-2021 holo PDB → raw Morgan Tanimoto (zero TargetForge scoring)."
  );
  L.push("");
  L.push(
    "| Funnel | Top-N targets | Top-K compounds | Recovered / Total | End-to-end Recall@K | Emitted pairs | End-to-end Precision@K |"
  );
  L.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");

  const funnelLabels = [
    ["targetforge_discovery", "TargetForge Discovery (default)"],
    ["targetforge_repurposing", "TargetForge Repurposing"],
    ["trivial_baseline", "Trivial baseline (Pubs + Tanimoto)"],
  ];
  for (const N of TARGET_NS) {
    for (const K of [10, 25, 50, 100]) {
      for (const [key, label] of funnelLabels) {
        const m = report.funnels[key][String(N)].by_k[String(K)];
        L.push(
          `| ${label} | ${N} | ${K} | ${m.recovered_pairs} / ${m.total_recoverable_pairs} | ${fmtPct(m.recovered_pairs, m.total_recoverable_pairs)} (${fmtRate(m.recall, 4)}) | ${m.emitted_recommendations.toLocaleString("en-US")} | ${fmtRate(m.precision, 5)} |`
        );
      }
    }
  }
  L.push("");

  L.push("## Stage-by-stage attrition breakdown (at K = 25 compounds per staged target)");
  L.push("");
  L.push(
    "Every recoverable triple either survives to Top-25 compounds or is dropped at an explicit stage:"
  );
  L.push("");
  L.push(
    "| Funnel | Top-N | Total | Lost: Target stage | Lost: No pre-2021 PDB | Apo / No co-crystal | Lost: Prefilter | Lost: Compound rank >25 | **Recovered** |"
  );
  L.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const N of TARGET_NS) {
    for (const [key, label] of funnelLabels) {
      const m = report.funnels[key][String(N)].by_k["25"];
      const a = m.attrition;
      L.push(
        `| ${label} | ${N} | ${a.total_recoverable_pairs} | ${a.lost_at_target_stage} (${fmtPct(a.lost_at_target_stage, a.total_recoverable_pairs)}) | ${a.lost_at_structure_no_pre2021_pdb} (${fmtPct(a.lost_at_structure_no_pre2021_pdb, a.total_recoverable_pairs)}) | ${a.lost_at_structure_no_cocrystal} (${fmtPct(a.lost_at_structure_no_cocrystal, a.total_recoverable_pairs)}) | ${a.lost_at_compound_prefilter} | ${a.lost_at_compound_ranking} (${fmtPct(a.lost_at_compound_ranking, a.total_recoverable_pairs)}) | **${a.recovered}** (${fmtPct(a.recovered, a.total_recoverable_pairs)}) |`
      );
    }
  }
  L.push("");

  L.push("## Per-disease breakdown (N = 25 targets, K = 25 compounds)");
  L.push("");
  L.push(
    "| Disease | Stratum | Recoverable triples | TF Discovery recovered | TF Repurposing recovered | Trivial baseline recovered |"
  );
  L.push("| --- | --- | ---: | ---: | ---: | ---: |");
  const discPerD = report.funnels.targetforge_discovery["25"].per_disease;
  const repPerD = report.funnels.targetforge_repurposing["25"].per_disease;
  const basePerD = report.funnels.trivial_baseline["25"].per_disease;
  for (let i = 0; i < discPerD.length; i++) {
    const d = discPerD[i];
    L.push(
      `| ${d.disease_name} | ${d.stratum} | ${d.n_recoverable_pairs} | ${d.recovered_at_k["25"]} | ${repPerD[i].recovered_at_k["25"]} | ${basePerD[i].recovered_at_k["25"]} |`
    );
  }
  L.push("");

  L.push("## Leakage & statistical caveats");
  L.push("");
  for (const c of report.leakage_controls) {
    L.push(`- ${c}`);
  }
  L.push("");
  L.push("## Reproducing");
  L.push("");
  L.push("```bash");
  L.push("node benchmark/docking/scripts/end_to_end_pipeline.mjs");
  L.push("```");
  L.push("");

  return L.join("\n");
}

export async function runEndToEndBenchmark({ refresh = false } = {}) {
  const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAPSHOT_PATH)));
  const cancerLabels = JSON.parse(fs.readFileSync(CANCER_LABELS_PATH, "utf8"));
  const stratumByDiseaseId = Object.fromEntries(
    (cancerLabels.diseases || []).map((d) => [d.disease_id, d.stratum])
  );

  const clinicalLibPayload = JSON.parse(fs.readFileSync(CLINICAL_LIB_PATH, "utf8"));
  const library = clinicalLibPayload.compounds || [];

  // Index clinical library by ChEMBL ID and normalized name
  const libByChembl = new Map();
  const libByName = new Map();
  library.forEach((c, idx) => {
    if (c.chemblId) libByChembl.set(String(c.chemblId).toUpperCase(), idx);
    if (c.id) libByChembl.set(String(c.id).toUpperCase(), idx);
    const n = normName(c.name);
    if (n && !libByName.has(n)) libByName.set(n, idx);
  });

  const testDiseases = (snapshot.diseases || []).filter((d) => d.split === "test");

  // Load or build cache of Open Targets 26.09 ground-truth drugs + pre-2021 RCSB structures
  let cache = null;
  if (!refresh && fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE_PATH)));
  }

  if (!cache) {
    process.stderr.write(
      `[task12] Fetching Open Targets 26.09 disease drugs for ${testDiseases.length} held-out diseases...\n`
    );
    const diseaseDrugs = {};
    let observedRelease = snapshot.current_release || "26.09";
    for (const d of testDiseases) {
      const res = await fetchDiseaseDrugs2609(d.disease_id_2026);
      if (res.release) observedRelease = res.release;
      diseaseDrugs[d.disease_id_2026] = res.rows;
    }

    // Collect all unique gene symbols in top-50 of any target ranker across all held-out diseases
    const neededSymbols = new Set();
    for (const d of testDiseases) {
      const rankings = rankTargets2104(d.targets || []);
      for (const key of ["discovery", "repurposing", "baseline"]) {
        for (const t of rankings[key].slice(0, 50)) {
          if (t.symbol) neededSymbols.add(t.symbol);
        }
      }
    }

    const symbolList = [...neededSymbols].sort();
    process.stderr.write(
      `[task12] Querying pre-2021-05-05 RCSB PDBs for ${symbolList.length} unique top-50 targets...\n`
    );
    const pdbIdsBySymbol = {};
    const allPdbIds = new Set();
    await mapConcurrent(symbolList, 6, async (sym) => {
      const ids = await searchPre2021PdbsForGene(sym);
      pdbIdsBySymbol[sym] = ids;
      for (const id of ids) allPdbIds.add(id.toUpperCase());
    });

    process.stderr.write(
      `[task12] Fetching RCSB GraphQL metadata for ${allPdbIds.size} pre-2021 PDB entries...\n`
    );
    const entryMap = await fetchRcsbEntriesBatched([...allPdbIds]);

    // Collect unique non-additive ligand comp_ids across all fetched entries
    const compIds = new Set();
    for (const raw of Object.values(entryMap)) {
      const feat = extractFromGraphqlEntry(raw);
      for (const l of feat?.ligands || []) {
        if (l.compId) compIds.add(String(l.compId).toUpperCase());
      }
    }
    process.stderr.write(
      `[task12] Fetching RCSB chemical-component SMILES for ${compIds.size} unique co-crystal ligands...\n`
    );
    const chemCompSmilesMap = {};
    await mapConcurrent([...compIds], 10, async (cid) => {
      chemCompSmilesMap[cid] = await fetchChemCompSmiles(cid);
    });

    const structureBySymbol = {};
    for (const sym of symbolList) {
      structureBySymbol[sym] = selectPre2021Structures(
        sym,
        pdbIdsBySymbol[sym] || [],
        entryMap,
        chemCompSmilesMap
      );
    }

    cache = {
      generated_at: new Date().toISOString(),
      observed_ot_release: observedRelease,
      pre_cutoff_date: PRE_CUTOFF_DATE,
      diseaseDrugs,
      structureBySymbol,
    };
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, zlib.gzipSync(JSON.stringify(cache)));
    process.stderr.write(`[task12] Wrote cache ${path.relative(REPO_ROOT, CACHE_PATH)}\n`);
  }

  // Construct ground-truth recoverable (disease, target, drug) triples
  let totalAcquiredDiseaseTargets = 0;
  let acquiredTargetsWithSmallMolecule = 0;
  let totalSmallMoleculeTriples = 0;
  let recoverableTriples = 0;
  let recoverableUniqueDiseaseTargets = 0;
  let recoverableCohort2 = 0;
  let recoverableRepurposing = 0;
  let diseasesWithRecoverable = 0;

  const diseaseData = [];

  for (const d of testDiseases) {
    const targets = d.targets || [];
    const rankings = rankTargets2104(targets);
    const acquiredTargets = targets.filter((t) => t.acquired_disease_clinical === 1);
    totalAcquiredDiseaseTargets += acquiredTargets.length;

    const acqByEnsembl = new Map(acquiredTargets.map((t) => [t.targetId, t]));
    const drugRows = cache.diseaseDrugs[d.disease_id_2026] || [];

    // Map targetId -> Set of small-molecule drugs linked in 26.09
    const smByTarget = new Map();
    for (const row of drugRows) {
      const drug = row?.drug;
      if (!drug || drug.drugType !== "Small molecule") continue;
      const moaRows = drug.mechanismsOfAction?.rows || [];
      for (const m of moaRows) {
        for (const tgt of m.targets || []) {
          if (!acqByEnsembl.has(tgt.id)) continue;
          if (!smByTarget.has(tgt.id)) smByTarget.set(tgt.id, new Map());
          if (!smByTarget.get(tgt.id).has(drug.id)) {
            smByTarget.get(tgt.id).set(drug.id, {
              drugId: drug.id,
              drugName: drug.name,
              maxClinicalStage: row.maxClinicalStage,
            });
          }
        }
      }
    }

    const recoverablePairs = [];
    const recTargetSet = new Set();

    for (const [targetId, drugMap] of smByTarget.entries()) {
      const tRow = acqByEnsembl.get(targetId);
      acquiredTargetsWithSmallMolecule += 1;
      for (const drugInfo of drugMap.values()) {
        totalSmallMoleculeTriples += 1;
        let libIdx = libByChembl.get(String(drugInfo.drugId).toUpperCase());
        if (libIdx === undefined) {
          libIdx = libByName.get(normName(drugInfo.drugName));
        }
        if (libIdx === undefined) continue;
        const libDrug = library[libIdx];
        if (!libDrug?.smiles) continue;

        recoverableTriples += 1;
        recTargetSet.add(targetId);
        if ((tRow.drugCount_2021 || 0) === 0) recoverableCohort2 += 1;
        else recoverableRepurposing += 1;

        recoverablePairs.push({
          diseaseId: d.disease_id_2026,
          diseaseName: d.disease_name,
          targetId,
          symbol: tRow.symbol,
          drugCount_2021: tRow.drugCount_2021 || 0,
          publicationCount_2021: tRow.publicationCount_2021 || 0,
          drugId: drugInfo.drugId,
          drugName: drugInfo.drugName,
          maxClinicalStage: drugInfo.maxClinicalStage,
          libraryIdx: libIdx,
        });
      }
    }

    recoverableUniqueDiseaseTargets += recTargetSet.size;
    if (recoverablePairs.length > 0) diseasesWithRecoverable += 1;

    diseaseData.push({
      disease_id_2026: d.disease_id_2026,
      disease_name: d.disease_name,
      stratum: stratumByDiseaseId[d.disease_id_2026] || "unknown",
      rankings,
      recoverablePairs,
    });
  }

  // Precompute RDKit Morgan fingerprints and TargetForge prefilter decisions once for all 9,409 compounds
  process.stderr.write(
    `[task12] Precomputing RDKit fingerprints and prefilter flags for ${library.length} library compounds...\n`
  );
  const RDKit = await getRDKit();
  if (!RDKit) {
    throw new Error("RDKit WASM failed to initialize.");
  }
  const libraryFps = library.map((c) => makeFingerprint(RDKit, c.smiles));
  const prefilterKeep = library.map((c) => prefilterApprovedDrug(c).keep);

  // Evaluate all 3 funnels
  const funnels = {
    targetforge_discovery: evaluateFunnel({
      mode: "targetforge_discovery",
      diseaseData,
      structureBySymbol: cache.structureBySymbol,
      library,
      libraryFps,
      prefilterKeep,
      RDKit,
    }),
    targetforge_repurposing: evaluateFunnel({
      mode: "targetforge_repurposing",
      diseaseData,
      structureBySymbol: cache.structureBySymbol,
      library,
      libraryFps,
      prefilterKeep,
      RDKit,
    }),
    trivial_baseline: evaluateFunnel({
      mode: "trivial_baseline",
      diseaseData,
      structureBySymbol: cache.structureBySymbol,
      library,
      libraryFps,
      prefilterKeep,
      RDKit,
    }),
  };

  // Headline comparison at N = 25, K = 25 (primary operating point: top 25 targets, top 25 compounds)
  const d25 = funnels.targetforge_discovery["25"].by_k["25"];
  const r25 = funnels.targetforge_repurposing["25"].by_k["25"];
  const b25 = funnels.trivial_baseline["25"].by_k["25"];

  const discoveryBeatsBaseline = d25.recovered_pairs > b25.recovered_pairs;
  const repurposingBeatsBaseline = r25.recovered_pairs > b25.recovered_pairs;

  let headline;
  if (!discoveryBeatsBaseline) {
    headline =
      `**The default TargetForge discovery pipeline does NOT beat the trivial baseline end to end.** ` +
      `At N = 25 targets per disease and K = 25 compounds per staged target across ${report_n_diseases_str(diseasesWithRecoverable, testDiseases.length)} held-out diseases (${recoverableTriples} recoverable target–drug triples), ` +
      `TargetForge Discovery recovered **${d25.recovered_pairs}/${recoverableTriples}** (${fmtPct(d25.recovered_pairs, recoverableTriples)}, precision ${fmtRate(d25.precision, 5)}) ` +
      `against **${b25.recovered_pairs}/${recoverableTriples}** (${fmtPct(b25.recovered_pairs, recoverableTriples)}, precision ${fmtRate(b25.precision, 5)}) for the trivial baseline (21.04 publication count + raw Tanimoto to best-resolution pre-2021 holo PDB). ` +
      `The shipped Repurposing target ranker recovered **${r25.recovered_pairs}/${recoverableTriples}** (${fmtPct(r25.recovered_pairs, recoverableTriples)}, precision ${fmtRate(r25.precision, 5)})${
        repurposingBeatsBaseline
          ? ", beating the trivial baseline on repurposing pairs because drugCount_2021 surfaces already-drugged targets at Stage 1"
          : ", also failing to beat the trivial baseline"
      }. ` +
      `Attrition is dominated by Stage 1 target loss and Stage 3 compound ranking over 9,409 candidates.`;
  } else {
    headline =
      `At N = 25 targets and K = 25 compounds (${recoverableTriples} recoverable triples across ${diseasesWithRecoverable}/${testDiseases.length} held-out diseases), ` +
      `TargetForge Discovery recovered **${d25.recovered_pairs}/${recoverableTriples}** (${fmtPct(d25.recovered_pairs, recoverableTriples)}) vs **${b25.recovered_pairs}/${recoverableTriples}** (${fmtPct(b25.recovered_pairs, recoverableTriples)}) for the trivial baseline; ` +
      `TargetForge Repurposing recovered **${r25.recovered_pairs}/${recoverableTriples}** (${fmtPct(r25.recovered_pairs, recoverableTriples)}).`;
  }

  const report = {
    task: "task12_end_to_end_pipeline",
    generated_at: new Date().toISOString(),
    historical_release: snapshot.historical_release || "21.04",
    current_release: cache.observed_ot_release || snapshot.current_release || "26.09",
    pre_cutoff_pdb_date: PRE_CUTOFF_DATE,
    screening_library: {
      path: "server/data/clinicalLibrary.json",
      n_compounds: library.length,
    },
    n_held_out_diseases: testDiseases.length,
    n_contributing_diseases: testDiseases.filter((d) => (d.targets || []).length > 0).length,
    min_clusters_for_ci: MIN_CLUSTERS_FOR_CI,
    ground_truth_construction: {
      total_acquired_disease_target_pairs: totalAcquiredDiseaseTargets,
      acquired_targets_with_small_molecule: acquiredTargetsWithSmallMolecule,
      total_small_molecule_triples: totalSmallMoleculeTriples,
      recoverable_triples: recoverableTriples,
      recoverable_unique_disease_targets: recoverableUniqueDiseaseTargets,
      diseases_with_recoverable_pairs: diseasesWithRecoverable,
      recoverable_triples_cohort2_undrugged: recoverableCohort2,
      recoverable_triples_repurposing: recoverableRepurposing,
    },
    primary_comparison_n25_k25: {
      targetforge_discovery_beats_baseline: discoveryBeatsBaseline,
      targetforge_repurposing_beats_baseline: repurposingBeatsBaseline,
      targetforge_discovery_recovered: d25.recovered_pairs,
      targetforge_repurposing_recovered: r25.recovered_pairs,
      trivial_baseline_recovered: b25.recovered_pairs,
      total_recoverable_pairs: recoverableTriples,
    },
    headline,
    funnels,
    leakage_controls: [
      "Only the 11 held-out test diseases from the committed Task 3 split are evaluated; 0 parameters were fitted or tuned.",
      "All target-stage inputs come strictly from the committed Open Targets 21.04 snapshot.",
      `All RCSB PDB structures were filtered to initial_release_date <= ${PRE_CUTOFF_DATE} so no post-2021 drug co-crystal can leak into Stage 2/3.`,
      "9 of the 10 contributing held-out diseases are cancers; raw counts are reported directly without manufacturing confidence intervals over small discrete recovery counts.",
      "Note on library vintage: server/data/clinicalLibrary.json is the current committed Phase 2+ library (9,409 compounds) used by TargetForge today; compounds that first reached Phase 2 between 2021 and 2026 are included in the candidate pool so the funnel's ability to rank them can be measured, making these recall numbers an upper bound on strict 2021-library recall.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(report));

  return report;
}

function report_n_diseases_str(withRec, total) {
  return `${withRec}/${total}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const refresh = process.argv.includes("--refresh");
  runEndToEndBenchmark({ refresh })
    .then((rep) => {
      process.stdout.write(`[task12] ${rep.headline}\n`);
      process.stdout.write(`[task12] Wrote ${path.relative(REPO_ROOT, OUT_JSON)}\n`);
      process.stdout.write(`[task12] Wrote ${path.relative(REPO_ROOT, OUT_MD)}\n`);
    })
    .catch((err) => {
      console.error("[task12] Failed:", err);
      process.exit(1);
    });
}
