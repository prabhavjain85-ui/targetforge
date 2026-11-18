#!/usr/bin/env node
/**
 * Generates the two server assets the neglect screen ships, from committed
 * benchmark artifacts.
 *
 *   server/data/novelty/fitted-m1-weights.json
 *     The M1 coefficients (log1p publication count + the eight Open Targets
 *     biology features), lifted from benchmark/docking/results/
 *     task4_attention_control.json together with M1's measured held-out
 *     performance and the Task 7 scope limit. The screen must not carry
 *     hand-typed coefficients for the same reason the validation page must not
 *     carry a hand-typed commit: there would be two places the facts live.
 *
 *   server/data/burden/india-burden.json
 *     A compact EFO/MONDO -> DALY lookup built from benchmark/burden/
 *     india_disease_burden.json and ghe_to_efo_mapping.json. Only mapped causes
 *     are carried; an unmapped disease has to come back as unavailable, so
 *     there is deliberately no default or fallback value anywhere in it.
 *
 * Both are rebuilt by `npm run build:screen-assets` and verified by
 * `--check`, which a test runs so a stale asset fails CI rather than shipping.
 *
 * The benchmark directory is not deployed with the serverless functions, so the
 * server reads these derived copies rather than reaching into benchmark/.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TASK4 = path.join(repoRoot, "benchmark", "docking", "results", "task4_attention_control.json");
const TASK7 = path.join(repoRoot, "benchmark", "docking", "results", "task7_cancer_stratification.json");
const BURDEN = path.join(repoRoot, "benchmark", "burden", "india_disease_burden.json");
const MAPPING = path.join(repoRoot, "benchmark", "burden", "ghe_to_efo_mapping.json");

const FEATURES = path.join(repoRoot, "benchmark", "docking", "data", "task8_target_features.json.gz");

const OUT_M1 = path.join(repoRoot, "server", "data", "novelty", "fitted-m1-weights.json");
const OUT_BURDEN = path.join(repoRoot, "server", "data", "burden", "india-burden.json");
// Gzipped: the uncompressed table is 2.1MB of mostly-repeated keys and
// compresses 35x, which matters for a serverless bundle.
const OUT_EFFORT = path.join(repoRoot, "server", "data", "effort", "pre2021-effort.json.gz");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

export function buildM1(task4, task7) {
  const m1 = task4.coefficients?.M1;
  if (!m1 || !m1.coefficients) throw new Error("task4 JSON has no M1 coefficients");

  const held = task4.held_out?.models?.M1;
  if (!held) throw new Error("task4 JSON has no held-out M1 metrics");

  const cancer = task7.strata?.cancer;
  const nonCancer = task7.strata?.non_cancer;

  return {
    schemaVersion: 1,
    id: "evidence-m1",
    description:
      "Fitted M1 coefficients: log1p(publication_count) / 8 plus the eight Open Targets biology datatype scores. This is the evidence axis of the neglect screen. It contains no term for drug count, compound count or any other measure of prior effort, by construction.",
    feature_order: Object.keys(m1.coefficients),
    intercept: m1.intercept,
    coefficients: m1.coefficients,
    pub_count_scale: 8.0,
    heldOutPerformance: {
      rocAuc: held.roc_auc,
      prAuc: held.pr_auc,
      precisionAt25: held.precision_at_25,
      recallAt25: held.recall_at_25,
      nPairs: task4.held_out.n_total,
      nPositives: task4.held_out.n_positives,
      baseRate: task4.held_out.prevalence,
    },
    comparators: {
      publicationCountAlone: task4.held_out.models.M0.roc_auc,
      biologyFeaturesAlone: task4.held_out.models.M2.roc_auc,
    },
    gainOverPublicationCount: {
      rocAucDelta: task4.paired_deltas.M1_vs_M0.roc_auc.delta,
      ciPairs: [
        task4.paired_deltas.M1_vs_M0.roc_auc.ci_low,
        task4.paired_deltas.M1_vs_M0.roc_auc.ci_high,
      ],
      ciDiseases: [
        task4.clustered_deltas.M1_vs_M0.roc_auc.ci_low,
        task4.clustered_deltas.M1_vs_M0.roc_auc.ci_high,
      ],
      prAucSurvivesDiseaseResampling: !task4.clustered_deltas.M1_vs_M0.pr_auc.includes_zero,
    },
    scopeLimit: {
      verdict: "oncology-scoped",
      detail:
        "Task 7 stratified the held-out set: of the diseases contributing data, " +
        `${cancer.n_diseases_with_cohort2_data} were cancers and ` +
        `${nonCancer.n_diseases_with_cohort2_data} was not. The cancer stratum reproduces the ` +
        "pooled result and the single non-cancer disease showed no benefit, so this score is " +
        "an oncology result and generalisation beyond cancer is untested.",
      cancerDiseases: cancer.n_diseases_with_cohort2_data,
      nonCancerDiseases: nonCancer.n_diseases_with_cohort2_data,
      nonCancerRocAucM0: nonCancer.models.M0.roc_auc,
      nonCancerRocAucM1: nonCancer.models.M1.roc_auc,
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    provenance: {
      releasePair: `${task4.historical_release} -> ${task4.current_release}`,
      cohort: task4.cohort,
      diseases: {
        training: task4.n_train_diseases,
        heldOut: task4.n_test_diseases,
      },
      generator: "benchmark/docking/scripts/attention_control.mjs",
      generatedAt: task4.generated_at,
      sourceFiles: [
        "benchmark/docking/results/task4_attention_control.json",
        "benchmark/docking/results/task7_cancer_stratification.json",
      ],
    },
    caveat:
      "Fitted and tested on targets with no approved or clinical drug in 2021, on a panel that is predominantly cancers. Applying it to current Open Targets data is an extrapolation in time; applying it outside oncology is an extrapolation in scope.",
  };
}

export function buildBurden(burden, mapping) {
  const dalyByCode = new Map(burden.causes.map((c) => [c.ghe_code, c]));

  const byDisease = {};
  for (const m of mapping.mappings) {
    if (!m.efo_id) continue;
    const cause = dalyByCode.get(m.ghe_code);
    if (!cause) continue;
    // A later mapping must not silently overwrite an earlier one; if two GHE
    // causes resolve to the same disease, keep the larger burden and record it.
    const existing = byDisease[m.efo_id];
    if (existing && existing.dalyThousands >= cause.daly_thousands) {
      existing.alsoMappedFrom = existing.alsoMappedFrom || [];
      existing.alsoMappedFrom.push({ gheCode: m.ghe_code, gheLabel: m.ghe_label });
      continue;
    }
    byDisease[m.efo_id] = {
      efoId: m.efo_id,
      efoLabel: m.efo_label,
      gheCode: m.ghe_code,
      gheLabel: m.ghe_label,
      matchType: m.match_type,
      dalyThousands: cause.daly_thousands,
      shareOfTotalDaly:
        burden.total_daly_thousands > 0
          ? Number((cause.daly_thousands / burden.total_daly_thousands).toFixed(6))
          : null,
      ...(existing ? { alsoMappedFrom: existing.alsoMappedFrom } : {}),
    };
  }

  return {
    schemaVersion: 1,
    description:
      "India national DALYs keyed by EFO/MONDO disease id. Only causes with an accepted exact-match mapping are present. A disease absent from this table has unknown burden and must be rendered as unavailable: there is no default value here and none should be substituted.",
    country: burden.source.country,
    referenceYear: burden.source.reference_year,
    units: "DALYs in thousands, as published",
    populationThousands: burden.population_thousands,
    totalDalyThousands: burden.total_daly_thousands,
    source: burden.source,
    mappingCoverage: mapping.coverage,
    mappingResolver: mapping.resolver,
    nDiseases: Object.keys(byDisease).length,
    byDisease,
  };
}

/**
 * Compact pre-2021 effort lookup.
 *
 * Current Open Targets does not expose the 21.04 ETL's
 * `tractability.smallmolecule.high_quality_compounds`, which Task 8 measured as
 * the single strongest predictor of clinical progression (solo held-out ROC-AUC
 * 0.772). The screen needs it to tell "no chemistry has been done here" from
 * "chemistry has been done", so the pre-2021 values are shipped.
 *
 * Only targets that HAVE a tractability record are carried. A target absent
 * from this table has unknown effort, not zero effort — the distinction the
 * screen turns on, since tractability joined just 72.8% of benchmark targets.
 */
export function buildEffort(featureTable) {
  const byTarget = {};
  let withTract = 0;
  for (const [ensembl, f] of Object.entries(featureTable.features)) {
    const t = f.tractability;
    if (!t) continue;
    withTract++;
    byTarget[ensembl] = {
      hqCompounds: Number(t.sm_high_quality_compounds) || 0,
      smClinicalPrecedence: t.sm_clinical_precedence ? 1 : 0,
      abClinicalPrecedence: t.ab_clinical_precedence ? 1 : 0,
      smPredictedTractable: t.sm_predicted_tractable ? 1 : 0,
      smGenomeMember: t.sm_genome_member ? 1 : 0,
    };
  }
  return {
    schemaVersion: 1,
    description:
      "Pre-2021 medicinal-chemistry effort per Ensembl gene id, from the Open Targets 21.04 target ETL. A target ABSENT from this table has UNKNOWN effort and must never be rendered as zero effort.",
    vintage: featureTable.vintage?.ot_21_04 || null,
    sourceFile: "benchmark/docking/data/task8_target_features.json.gz",
    nTargetsInFeatureTable: featureTable.n_targets,
    nTargetsWithTractability: withTract,
    tractabilityCoverageInFeatureTable: featureTable.n_targets
      ? Number((withTract / featureTable.n_targets).toFixed(4))
      : null,
    benchmarkCohortJoinRate: 0.728,
    benchmarkCohortJoinRateNote:
      "tract_sm_* joined 72.8% of cohort-2 targets in the Task 8 benchmark; absent means unknown",
    strongestEffortPredictor: {
      feature: "tract_sm_high_quality_compounds",
      soloHeldOutRocAuc: 0.772,
      source: "benchmark/docking/results/task8_tractability.json",
    },
    byTarget,
  };
}

function writeIfChanged(file, textOrObj, { check }) {
  const text =
    typeof textOrObj === "string" ? textOrObj : `${JSON.stringify(textOrObj, null, 2)}\n`;
  const rel = path.relative(repoRoot, file);

  // A .gz target is compared on its decompressed contents, since gzip output
  // is not byte-stable across zlib versions and would otherwise look stale.
  if (file.endsWith(".gz")) {
    let existingText = null;
    if (fs.existsSync(file)) {
      try {
        existingText = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
      } catch {
        existingText = null;
      }
    }
    const same = existingText !== null && existingText.replace(/\r\n/g, "\n") === text;
    if (check) {
      if (same) {
        process.stderr.write(`[screen-assets] current: ${rel}\n`);
        return true;
      }
      process.stderr.write(
        `[screen-assets] STALE: ${rel} does not match its benchmark source. ` +
          "Run: npm run build:screen-assets\n"
      );
      return false;
    }
    if (same) {
      process.stderr.write(`[screen-assets] already current: ${rel}\n`);
      return true;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from(text, "utf8"), { level: 9 }));
    process.stderr.write(`[screen-assets] wrote ${rel}\n`);
    return true;
  }

  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const current = existing !== null && existing.replace(/\r\n/g, "\n") === text;
  if (check) {
    if (!current) {
      process.stderr.write(
        `[screen-assets] STALE: ${rel} does not match its benchmark source. ` +
          "Run: npm run build:screen-assets\n"
      );
      return false;
    }
    process.stderr.write(`[screen-assets] current: ${rel}\n`);
    return true;
  }
  if (current) {
    process.stderr.write(`[screen-assets] already current: ${rel}\n`);
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  process.stderr.write(`[screen-assets] wrote ${rel}\n`);
  return true;
}

function main() {
  const check = process.argv.includes("--check");

  const m1 = buildM1(readJson(TASK4), readJson(TASK7));
  let ok = writeIfChanged(OUT_M1, m1, { check });

  // The burden files are optional at this stage: the screen degrades to
  // "burden unavailable" without them rather than failing to build.
  if (fs.existsSync(BURDEN) && fs.existsSync(MAPPING)) {
    const burden = buildBurden(readJson(BURDEN), readJson(MAPPING));
    ok = writeIfChanged(OUT_BURDEN, burden, { check }) && ok;
  } else {
    process.stderr.write(
      "[screen-assets] burden sources absent; skipping india-burden.json " +
        "(run benchmark/burden/scripts/build_india_burden.mjs to produce them)\n"
    );
  }

  if (fs.existsSync(FEATURES)) {
    const featureTable = JSON.parse(zlib.gunzipSync(fs.readFileSync(FEATURES)).toString("utf8"));
    ok = writeIfChanged(OUT_EFFORT, buildEffort(featureTable), { check }) && ok;
  } else {
    process.stderr.write(
      "[screen-assets] feature table absent; skipping pre2021-effort.json " +
        "(run benchmark/docking/scripts/build_target_features.mjs)\n"
    );
  }

  if (check && !ok) process.exitCode = 1;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
