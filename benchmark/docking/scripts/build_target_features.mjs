#!/usr/bin/env node
/**
 * Task 5, stage 1 — build the pre-2021 target feature table.
 *
 * Extends the Task 3 snapshot, whose target records hold only symbol, targetId,
 * datatypeScores_2021, overallScore_2021, publicationCount_2021, drug counts and
 * outcome flags, with tractability and biology features drawn from sources whose
 * vintage can be established.
 *
 * THE LEAKAGE GUARD IS THE POINT OF THIS FILE. Every feature carries a
 * `vintage` record naming its source, its release and that release's date. A
 * feature whose source cannot be shown to predate May 2021 is NOT added: it is
 * recorded in `skipped` with the reason. That matters more than feature
 * coverage, because a feature carrying post-2021 information would make the
 * whole retrospective meaningless while looking like an improvement.
 *
 * Sources, with the evidence for each date:
 *
 *   Open Targets 21.04 target ETL — released 2021-05-05, the same snapshot the
 *     outcomes are measured against. Provides tractability buckets and the
 *     ChEMBL protein class hierarchy. The `tractability` field was verified to
 *     exist in this release before being relied on (it does: antibody,
 *     smallmolecule and other_modalities, each with buckets and categories).
 *
 *   gnomAD v2.1.1 — released 2019-03, well before the cutoff. Provides pLI and
 *     LOEUF (oe_lof_upper).
 *
 *   DepMap Public 21Q2 — figshare article 14541774, published 2021-05-05. This
 *     is inside May 2021, not after it, and the brief permits a release no later
 *     than 21Q2. Provides CRISPR gene effect. 15 of the 22 diseases are cancers,
 *     so this is on topic.
 *
 *   GTEx v8 — analysis freeze 2017-06-05 (the date is in the filename), median
 *     TPM per gene across 54 tissues. Reduced to scalars only; the per-tissue
 *     vector is deliberately not carried.
 *
 * Joins are on Ensembl gene ID (the snapshot's targetId) except DepMap, whose
 * rows are keyed "SYMBOL (ENTREZ)" and so joins on approved symbol via the
 * 21.04 target ETL. That is recorded as the join key for that feature, and its
 * join rate is reported like any other.
 *
 * Output: benchmark/docking/data/task5_target_features.json.gz
 */
import fs from "fs";
import https from "https";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCKING_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(DOCKING_DIR, "data");
const SRC_DIR = path.join(DATA_DIR, "sources");
const OUT_PATH = path.join(DATA_DIR, "task5_target_features.json.gz");

const OT_21_04_BASE =
  "https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/21.04/output/etl/json";

/** Every source's provenance, asserted once and carried into the output. */
const VINTAGE = {
  ot_21_04: {
    source: "Open Targets Platform 21.04 target ETL",
    release: "21.04",
    release_date: "2021-05-05",
    url: `${OT_21_04_BASE}/targets/`,
    predates_cutoff: true,
    evidence:
      "The 21.04 release is the historical snapshot this retrospective is built on; its date is the release date itself.",
  },
  gnomad_v2_1_1: {
    source: "gnomAD v2.1.1 loss-of-function constraint metrics by gene",
    release: "v2.1.1",
    release_date: "2019-03-01",
    url: "https://storage.googleapis.com/gcp-public-data--gnomad/release/2.1.1/constraint/gnomad.v2.1.1.lof_metrics.by_gene.txt.bgz",
    predates_cutoff: true,
    evidence: "gnomAD 2.1.1 was released in March 2019, two years before the cutoff.",
  },
  depmap_21q2: {
    source: "DepMap Public 21Q2 CRISPR gene effect (Chronos-corrected CERES)",
    release: "21Q2",
    release_date: "2021-05-05",
    url: "https://ndownloader.figshare.com/files/27902226",
    predates_cutoff: true,
    evidence:
      "figshare article 14541774 'DepMap 21Q2 Public' carries published_date 2021-05-05T20:26:49Z, which is within May 2021 and is the latest release the brief permits.",
  },
  gtex_v8: {
    source: "GTEx v8 median gene TPM by tissue",
    release: "v8",
    release_date: "2017-06-05",
    url: "https://storage.googleapis.com/adult-gtex/bulk-gex/v8/rna-seq/GTEx_Analysis_2017-06-05_v8_RNASeQCv1.1.9_gene_median_tpm.gct.gz",
    predates_cutoff: true,
    evidence: "The GTEx v8 analysis freeze date 2017-06-05 is carried in the filename.",
  },
};

const SOURCE_FILES = {
  gnomad: path.join(SRC_DIR, "gnomad_v2.1.1_lof_metrics_by_gene.txt.bgz"),
  gtex: path.join(SRC_DIR, "gtex_v8_gene_median_tpm.gct.gz"),
  depmapEffect: path.join(SRC_DIR, "depmap_21Q2_CRISPR_gene_effect.csv"),
  depmapEssential: path.join(SRC_DIR, "depmap_21Q2_CRISPR_common_essentials.csv"),
  otTargets: path.join(SRC_DIR, "ot_21_04_targets.jsonl.gz"),
};

const ipv4Agent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 12 });

function httpsGetBuffer(url, { redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: ipv4Agent }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          httpsGetBuffer(next, { redirects: redirects - 1 }).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function httpsGetText(url) {
  return (await httpsGetBuffer(url)).toString("utf8");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The EBI FTP mirror drops long-lived TLS connections fairly often; a single
 * aborted socket used to lose the whole 35-partition fetch. Retry with backoff.
 */
async function httpsGetTextRetrying(url, { attempts = 5 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpsGetText(url);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`failed after ${attempts} attempts: ${url} (${lastErr && lastErr.message})`);
}

// ---------------------------------------------------------------------------
// Open Targets 21.04 target ETL: tractability + ChEMBL protein class + symbol.
// Cached locally as one gzipped JSONL of only the fields used, so a rerun does
// not refetch ~70MB.
// ---------------------------------------------------------------------------

async function fetchOtTargets({ refresh = false }) {
  if (!refresh && fs.existsSync(SOURCE_FILES.otTargets)) {
    const text = zlib.gunzipSync(fs.readFileSync(SOURCE_FILES.otTargets)).toString("utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  process.stderr.write("[task5] listing Open Targets 21.04 target partitions...\n");
  const listing = await httpsGetTextRetrying(`${OT_21_04_BASE}/targets/`);
  const parts = [...new Set(listing.match(/part-\d+-[a-f0-9-]+-c000\.json/g) || [])].sort();
  if (parts.length === 0) throw new Error("no 21.04 target partitions found");
  process.stderr.write(`[task5] fetching ${parts.length} partitions...\n`);

  // Each partition is cached on disk the moment it arrives, so an aborted
  // socket costs one partition rather than the whole fetch.
  const partDir = path.join(SRC_DIR, "ot_21_04_target_parts");
  fs.mkdirSync(partDir, { recursive: true });

  const records = [];
  let done = 0;
  const CONCURRENCY = 4;

  const extract = (text) => {
    const out = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      // Keep only what is used, so the cache stays small.
      const classes = j.proteinAnnotations?.classes?.[0] || null;
      out.push({
        id: j.id,
        symbol: j.approvedSymbol || null,
        bioType: j.bioType || null,
        tractability: j.tractability || null,
        class_l1: classes?.l1?.label || null,
        class_l2: classes?.l2?.label || null,
      });
    }
    return out;
  };

  const loadPart = async (p) => {
    const cached = path.join(partDir, `${p}.gz`);
    if (fs.existsSync(cached)) {
      return extract(zlib.gunzipSync(fs.readFileSync(cached)).toString("utf8"));
    }
    const text = await httpsGetTextRetrying(`${OT_21_04_BASE}/targets/${p}`);
    fs.writeFileSync(cached, zlib.gzipSync(Buffer.from(text, "utf8"), { level: 6 }));
    return extract(text);
  };

  for (let i = 0; i < parts.length; i += CONCURRENCY) {
    const batch = parts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(loadPart));
    for (const rs of results) records.push(...rs);
    done += batch.length;
    process.stderr.write(`[task5]   ${done}/${parts.length} partitions, ${records.length} records\n`);
  }

  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.writeFileSync(
    SOURCE_FILES.otTargets,
    zlib.gzipSync(Buffer.from(records.map((r) => JSON.stringify(r)).join("\n"), "utf8"), { level: 9 })
  );
  process.stderr.write(`[task5] cached ${records.length} target records\n`);
  return records;
}

/**
 * Tractability encoding.
 *
 * Open Targets buckets are ordinal with LOWER meaning more tractable, and the
 * low small-molecule buckets (1-3) are the clinical/discovery precedence ones,
 * which exist because a compound is already known for that target. In cohort 2
 * every target has drugCount_2021 == 0, so those buckets risk being either
 * inert or a restatement of the cohort definition. Both the best bucket and the
 * precedence flag are therefore recorded separately, and the model report checks
 * whether either is constant on the cohort before reading anything into it.
 */
function encodeTractability(tract) {
  if (!tract) return null;
  const sm = tract.smallmolecule || null;
  const ab = tract.antibody || null;
  const minBucket = (x) =>
    Array.isArray(x?.buckets) && x.buckets.length ? Math.min(...x.buckets) : null;
  return {
    sm_min_bucket: minBucket(sm),
    ab_min_bucket: minBucket(ab),
    sm_clinical_precedence: Number(sm?.categories?.clinical_precedence) > 0 ? 1 : 0,
    ab_clinical_precedence: Number(ab?.categories?.clinical_precedence) > 0 ? 1 : 0,
    sm_predicted_tractable: Number(sm?.categories?.predicted_tractable) > 0 ? 1 : 0,
    sm_high_quality_compounds: Number(sm?.high_quality_compounds) || 0,
    sm_genome_member: sm?.small_molecule_genome_member ? 1 : 0,
    sm_top_category: sm?.top_category || null,
    ab_top_category: ab?.top_category || null,
  };
}

// ---------------------------------------------------------------------------
// gnomAD v2.1.1: pLI and LOEUF, joined on Ensembl gene id.
// ---------------------------------------------------------------------------

function parseGnomad() {
  if (!fs.existsSync(SOURCE_FILES.gnomad)) return null;
  // .bgz is gzip-compatible.
  const text = zlib.gunzipSync(fs.readFileSync(SOURCE_FILES.gnomad)).toString("utf8");
  const lines = text.split("\n");
  const header = lines[0].split("\t");
  const iGene = header.indexOf("gene_id");
  const iPli = header.indexOf("pLI");
  const iLoeuf = header.indexOf("oe_lof_upper");
  if (iGene < 0 || iPli < 0 || iLoeuf < 0) {
    throw new Error("gnomAD columns gene_id / pLI / oe_lof_upper not found");
  }
  const byEnsembl = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split("\t");
    const gid = (f[iGene] || "").trim();
    if (!gid) continue;
    const pli = Number(f[iPli]);
    const loeuf = Number(f[iLoeuf]);
    // Keep the most constrained transcript where a gene appears twice.
    const prev = byEnsembl.get(gid);
    const rec = {
      pli: Number.isFinite(pli) ? pli : null,
      loeuf: Number.isFinite(loeuf) ? loeuf : null,
    };
    if (!prev || (rec.loeuf !== null && (prev.loeuf === null || rec.loeuf < prev.loeuf))) {
      byEnsembl.set(gid, rec);
    }
  }
  return byEnsembl;
}

// ---------------------------------------------------------------------------
// GTEx v8: reduce 54 tissues to two scalars — Tau selectivity and the number of
// tissues above 1 TPM. Tau is computed on log2(TPM+1), not raw TPM: on raw TPM a
// single very high tissue dominates and ubiquitous housekeeping genes come out
// looking tissue-enriched (GAPDH scored 0.81 before this repo made that fix).
// ---------------------------------------------------------------------------

function tauFromLogValues(values) {
  if (!values.length) return null;
  const max = Math.max(...values);
  if (!(max > 0)) return null;
  const sum = values.reduce((a, v) => a + (1 - v / max), 0);
  return sum / (values.length - 1);
}

function parseGtex() {
  if (!fs.existsSync(SOURCE_FILES.gtex)) return null;
  const text = zlib.gunzipSync(fs.readFileSync(SOURCE_FILES.gtex)).toString("utf8");
  const lines = text.split("\n");
  // .gct: line 0 version, line 1 dims, line 2 header, then data.
  const header = lines[2].split("\t");
  const nTissues = header.length - 2; // Name, Description, then tissues
  const byEnsembl = new Map();
  for (let i = 3; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split("\t");
    const ensembl = (f[0] || "").split(".")[0]; // strip version suffix
    if (!ensembl.startsWith("ENSG")) continue;
    const tpms = [];
    for (let c = 2; c < 2 + nTissues; c++) {
      const v = Number(f[c]);
      tpms.push(Number.isFinite(v) ? v : 0);
    }
    const logs = tpms.map((v) => Math.log2(v + 1));
    byEnsembl.set(ensembl, {
      gtex_tau: (() => {
        const t = tauFromLogValues(logs);
        return t === null ? null : Number(t.toFixed(4));
      })(),
      gtex_n_tissues_above_1tpm: tpms.filter((v) => v >= 1).length,
      gtex_max_tpm: Number(Math.max(...tpms).toFixed(2)),
      gtex_n_tissues: nTissues,
    });
  }
  return byEnsembl;
}

// ---------------------------------------------------------------------------
// DepMap 21Q2: mean CRISPR gene effect across cell lines, and the fraction of
// lines where the gene is a dependency (effect < -0.5, DepMap's own threshold).
// The matrix is cell lines x genes, ~325MB, so it is streamed a line at a time
// and accumulated per gene rather than held in memory.
// ---------------------------------------------------------------------------

function parseDepmapEssentials() {
  if (!fs.existsSync(SOURCE_FILES.depmapEssential)) return new Set();
  const text = fs.readFileSync(SOURCE_FILES.depmapEssential, "utf8");
  const out = new Set();
  for (const line of text.split("\n").slice(1)) {
    const sym = line.split(/[,(]/)[0].trim().replace(/"/g, "");
    if (sym) out.add(sym);
  }
  return out;
}

async function parseDepmapGeneEffect() {
  if (!fs.existsSync(SOURCE_FILES.depmapEffect)) return null;
  const { createReadStream } = fs;
  const { createInterface } = await import("readline");

  const rl = createInterface({
    input: createReadStream(SOURCE_FILES.depmapEffect, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let symbols = null;
  let sums = null;
  let counts = null;
  let depCounts = null;
  let nLines = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split(",");
    if (symbols === null) {
      // Header: first column is the cell line id, then "SYMBOL (ENTREZ)".
      symbols = f.slice(1).map((h) => h.replace(/"/g, "").split(" (")[0].trim());
      sums = new Float64Array(symbols.length);
      counts = new Int32Array(symbols.length);
      depCounts = new Int32Array(symbols.length);
      continue;
    }
    nLines++;
    for (let c = 1; c < f.length && c - 1 < symbols.length; c++) {
      const v = Number(f[c]);
      if (!Number.isFinite(v)) continue;
      const k = c - 1;
      sums[k] += v;
      counts[k] += 1;
      if (v < -0.5) depCounts[k] += 1;
    }
  }

  if (!symbols) return null;
  const bySymbol = new Map();
  for (let k = 0; k < symbols.length; k++) {
    if (!symbols[k] || counts[k] === 0) continue;
    bySymbol.set(symbols[k], {
      depmap_mean_gene_effect: Number((sums[k] / counts[k]).toFixed(4)),
      depmap_frac_dependent_lines: Number((depCounts[k] / counts[k]).toFixed(4)),
      depmap_n_lines: counts[k],
    });
  }
  return { bySymbol, n_cell_lines: nLines, n_genes: symbols.length };
}

// ---------------------------------------------------------------------------

export async function buildTargetFeatures({ refresh = false } = {}) {
  const skipped = [];
  const otTargets = await fetchOtTargets({ refresh });

  const otById = new Map();
  const symbolToEnsembl = new Map();
  for (const r of otTargets) {
    if (!r.id) continue;
    otById.set(r.id, r);
    if (r.symbol && !symbolToEnsembl.has(r.symbol)) symbolToEnsembl.set(r.symbol, r.id);
  }

  process.stderr.write("[task5] parsing gnomAD v2.1.1...\n");
  const gnomad = parseGnomad();
  if (!gnomad) {
    skipped.push({
      feature: "genetic_constraint (pLI, LOEUF)",
      reason: `source file not present at ${path.relative(DOCKING_DIR, SOURCE_FILES.gnomad)}`,
    });
  }

  process.stderr.write("[task5] parsing GTEx v8...\n");
  const gtex = parseGtex();
  if (!gtex) {
    skipped.push({
      feature: "expression_selectivity (GTEx v8 tau)",
      reason: `source file not present at ${path.relative(DOCKING_DIR, SOURCE_FILES.gtex)}`,
    });
  }

  process.stderr.write("[task5] streaming DepMap 21Q2 gene effect (large)...\n");
  const depmap = await parseDepmapGeneEffect();
  if (!depmap) {
    skipped.push({
      feature: "essentiality (DepMap CRISPR gene effect)",
      reason: `source file not present at ${path.relative(DOCKING_DIR, SOURCE_FILES.depmapEffect)}`,
    });
  }
  const commonEssentials = parseDepmapEssentials();

  // Assemble one record per Ensembl gene present in the 21.04 target ETL.
  const features = {};
  for (const [ensembl, r] of otById) {
    const tract = encodeTractability(r.tractability);
    const con = gnomad ? gnomad.get(ensembl) || null : null;
    const exp = gtex ? gtex.get(ensembl) || null : null;
    const dep = depmap && r.symbol ? depmap.bySymbol.get(r.symbol) || null : null;

    features[ensembl] = {
      symbol: r.symbol,
      bioType: r.bioType,
      tractability: tract,
      class_l1: r.class_l1,
      class_l2: r.class_l2,
      pli: con?.pli ?? null,
      loeuf: con?.loeuf ?? null,
      gtex_tau: exp?.gtex_tau ?? null,
      gtex_n_tissues_above_1tpm: exp?.gtex_n_tissues_above_1tpm ?? null,
      gtex_max_tpm: exp?.gtex_max_tpm ?? null,
      depmap_mean_gene_effect: dep?.depmap_mean_gene_effect ?? null,
      depmap_frac_dependent_lines: dep?.depmap_frac_dependent_lines ?? null,
      depmap_n_lines: dep?.depmap_n_lines ?? null,
      // Only meaningful for genes DepMap actually screened. A gene absent from
      // the screen is unknown, not non-essential, so it stays null and counts
      // as a join failure rather than silently becoming a 0.
      depmap_common_essential: dep ? (commonEssentials.has(r.symbol) ? 1 : 0) : null,
    };
  }

  const payload = {
    schemaVersion: 1,
    generated_at: new Date().toISOString(),
    description:
      "Pre-May-2021 target features for Task 5. Every feature's source release and date is " +
      "recorded in `vintage`. Features whose vintage could not be established are listed in " +
      "`skipped` and are absent from the table.",
    n_targets: Object.keys(features).length,
    join_key: "Ensembl gene ID (targetId), except DepMap which joins on approved symbol",
    vintage: VINTAGE,
    feature_vintage: {
      "tractability.*": "ot_21_04",
      class_l1: "ot_21_04",
      class_l2: "ot_21_04",
      pli: "gnomad_v2_1_1",
      loeuf: "gnomad_v2_1_1",
      gtex_tau: "gtex_v8",
      gtex_n_tissues_above_1tpm: "gtex_v8",
      gtex_max_tpm: "gtex_v8",
      depmap_mean_gene_effect: "depmap_21q2",
      depmap_frac_dependent_lines: "depmap_21q2",
      depmap_common_essential: "depmap_21q2",
    },
    depmap_matrix: depmap ? { n_cell_lines: depmap.n_cell_lines, n_genes: depmap.n_genes } : null,
    skipped,
    features,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 })
  );

  return payload;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  buildTargetFeatures({ refresh: process.argv.includes("--refresh") })
    .then((p) => {
      const f = Object.values(p.features);
      const cover = (pred) => {
        const n = f.filter(pred).length;
        return `${n} (${((100 * n) / f.length).toFixed(1)}%)`;
      };
      process.stderr.write(`\n[task5] ${p.n_targets} targets in the feature table\n`);
      process.stderr.write(`  tractability      ${cover((x) => x.tractability)}\n`);
      process.stderr.write(`  protein class l1  ${cover((x) => x.class_l1)}\n`);
      process.stderr.write(`  pLI               ${cover((x) => x.pli !== null)}\n`);
      process.stderr.write(`  LOEUF             ${cover((x) => x.loeuf !== null)}\n`);
      process.stderr.write(`  GTEx tau          ${cover((x) => x.gtex_tau !== null)}\n`);
      process.stderr.write(`  DepMap effect     ${cover((x) => x.depmap_mean_gene_effect !== null)}\n`);
      if (p.skipped.length) {
        process.stderr.write("  SKIPPED:\n");
        for (const s of p.skipped) process.stderr.write(`    ${s.feature}: ${s.reason}\n`);
      }
      process.stderr.write(`\n[task5] wrote ${path.relative(path.resolve(DOCKING_DIR, "../.."), OUT_PATH)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`[task5] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
