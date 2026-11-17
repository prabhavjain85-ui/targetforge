#!/usr/bin/env node
/**
 * Task 5, stage 2 — does adding pre-2021 tractability and biology features beat
 * publication count?
 *
 * Task 4 established that the eight Open Targets evidence scores add ranking
 * signal over attention (held-out ROC-AUC +0.054, 95% CI +0.021 to +0.089 on a
 * pair-level bootstrap), but that the gain does not survive disease-level
 * resampling for PR-AUC, and that the biology features alone do not beat
 * publication count. This asks whether a wider pre-2021 feature set does
 * better: tractability, protein class, genetic constraint, essentiality and
 * expression selectivity, all from sources dated before the May 2021 cutoff.
 *
 *   M0: publication_count alone
 *   M1: publication_count + the 8 biology features
 *   M3: publication_count + the 8 biology features + tractability features
 *
 * Reported as paired delta-AUCs with bootstrap CIs, M3 against both M0 and M1,
 * under both a pair-level and a disease-clustered bootstrap.
 *
 * RULES THIS SCRIPT ENFORCES
 *   - A feature joining under 70% of cohort targets is reported but excluded
 *     from the fitted model.
 *   - A feature that is constant on the cohort is reported and excluded: it
 *     cannot contribute, and leaving it in would misrepresent the model's size.
 *   - Fitting happens on the 11 training diseases only.
 *   - No production score is promoted here. Promotion requires M3 to beat M0
 *     with a CI excluding zero, and the report states plainly whether it does.
 *
 * Outputs:
 *   benchmark/docking/results/task5_tractability.json
 *   benchmark/docking/TASK5_TRACTABILITY.md
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

import { buildOrLoadRetrospectiveSnapshot } from "./validate_novelty_retrospective.mjs";
import {
  BIOLOGY_FEATURE_KEYS,
  biologyFeature,
  clusteredDeltaCi,
  evaluate,
  fitLogistic,
  fmt,
  logPub,
  pairedDeltaCi,
  signed,
} from "./attention_control.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCKING_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DOCKING_DIR, "../..");
const FEATURES_PATH = path.join(DOCKING_DIR, "data", "task5_target_features.json.gz");
const OUT_JSON = path.join(DOCKING_DIR, "results", "task5_tractability.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK5_TRACTABILITY.md");

const LABEL_KEY = "acquired_global_from_zero";
const MIN_JOIN_RATE = 0.7;

/**
 * Candidate features, each with how to read it and how to fill a miss.
 *
 * `fill` is used only for rows where the join failed, and only for features
 * that pass the join-rate gate; it is the training-set median, computed below,
 * so a miss sits at the centre of the distribution rather than at zero, which
 * for a signed quantity like gene effect would be a meaningful value.
 */
const CANDIDATES = [
  { name: "tract_sm_min_bucket", get: (f) => f?.tractability?.sm_min_bucket ?? null, scale: 1 / 10 },
  { name: "tract_ab_min_bucket", get: (f) => f?.tractability?.ab_min_bucket ?? null, scale: 1 / 10 },
  { name: "tract_sm_clinical_precedence", get: (f) => f?.tractability?.sm_clinical_precedence ?? null, scale: 1 },
  { name: "tract_ab_clinical_precedence", get: (f) => f?.tractability?.ab_clinical_precedence ?? null, scale: 1 },
  { name: "tract_sm_predicted_tractable", get: (f) => f?.tractability?.sm_predicted_tractable ?? null, scale: 1 },
  { name: "tract_sm_high_quality_compounds", get: (f) => f?.tractability?.sm_high_quality_compounds ?? null, scale: 1 / 10 },
  { name: "tract_sm_genome_member", get: (f) => f?.tractability?.sm_genome_member ?? null, scale: 1 },
  { name: "pli", get: (f) => (f?.pli ?? null), scale: 1 },
  { name: "loeuf", get: (f) => (f?.loeuf ?? null), scale: 1 },
  { name: "depmap_mean_gene_effect", get: (f) => (f?.depmap_mean_gene_effect ?? null), scale: 1 },
  { name: "depmap_frac_dependent_lines", get: (f) => (f?.depmap_frac_dependent_lines ?? null), scale: 1 },
  { name: "depmap_common_essential", get: (f) => (f?.depmap_common_essential ?? null), scale: 1 },
  { name: "gtex_tau", get: (f) => (f?.gtex_tau ?? null), scale: 1 },
  { name: "gtex_n_tissues_above_1tpm", get: (f) => (f?.gtex_n_tissues_above_1tpm ?? null), scale: 1 / 54 },
];

/** Protein class is categorical; the commonest classes become indicators. */
const N_PROTEIN_CLASSES = 8;

function loadFeatures() {
  if (!fs.existsSync(FEATURES_PATH)) {
    throw new Error(
      `${path.relative(REPO_ROOT, FEATURES_PATH)} is missing. Run:\n` +
        "  node benchmark/docking/scripts/build_target_features.mjs"
    );
  }
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(FEATURES_PATH)).toString("utf8"));
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export async function runTractabilityModels({ refresh = false } = {}) {
  const snapshot = await buildOrLoadRetrospectiveSnapshot({ refresh });
  const featureTable = loadFeatures();
  const featById = featureTable.features;

  const trainDiseases = snapshot.diseases.filter((d) => d.split === "train");
  const testDiseases = snapshot.diseases.filter((d) => d.split === "test");

  const cohort2 = (ds) => ds.flatMap((d) => d.targets).filter((r) => r.drugCount_2021 === 0);
  const trainRows = cohort2(trainDiseases);
  const testRows = cohort2(testDiseases);
  const allRows = [...trainRows, ...testRows];

  const featOf = (row) => featById[row.target_id || row.targetId || row.id] || null;

  // --- Join rates -----------------------------------------------------------
  // Reported over the whole cohort. A target absent from the 21.04 target ETL
  // has no features at all, which is itself a join failure worth seeing.
  const nAll = allRows.length;
  const presentInTable = allRows.filter((r) => featOf(r)).length;

  const joinReport = [];
  for (const c of CANDIDATES) {
    const vals = allRows.map((r) => c.get(featOf(r)));
    const nJoined = vals.filter((v) => v !== null && Number.isFinite(Number(v))).length;
    const joinRate = nAll ? nJoined / nAll : 0;
    const joinedVals = vals.filter((v) => v !== null && Number.isFinite(Number(v))).map(Number);
    const uniq = new Set(joinedVals);
    const constant = uniq.size <= 1;
    joinReport.push({
      feature: c.name,
      vintage: featureTable.feature_vintage[c.name] || inferVintage(c.name, featureTable),
      n_joined: nJoined,
      join_rate: Number(joinRate.toFixed(4)),
      passes_join_gate: joinRate >= MIN_JOIN_RATE,
      constant_on_cohort: constant,
      n_distinct_values: uniq.size,
      included_in_model: joinRate >= MIN_JOIN_RATE && !constant,
      excluded_reason:
        joinRate < MIN_JOIN_RATE
          ? `join rate ${(100 * joinRate).toFixed(1)}% is below the ${100 * MIN_JOIN_RATE}% gate`
          : constant
            ? `constant on this cohort (${uniq.size} distinct value${uniq.size === 1 ? "" : "s"}), so it cannot contribute`
            : null,
    });
  }

  // --- Protein class indicators --------------------------------------------
  const classCounts = new Map();
  for (const r of allRows) {
    const cl = featOf(r)?.class_l1 || null;
    if (cl) classCounts.set(cl, (classCounts.get(cl) || 0) + 1);
  }
  const topClasses = [...classCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, N_PROTEIN_CLASSES)
    .map(([label, n]) => ({ label, n, share: Number((n / Math.max(1, nAll)).toFixed(4)) }));
  const nWithClass = allRows.filter((r) => featOf(r)?.class_l1).length;
  const classJoinRate = nAll ? nWithClass / nAll : 0;
  const classIncluded = classJoinRate >= MIN_JOIN_RATE;

  joinReport.push({
    feature: `protein_class_l1 (${topClasses.length} indicators)`,
    vintage: "ot_21_04",
    n_joined: nWithClass,
    join_rate: Number(classJoinRate.toFixed(4)),
    passes_join_gate: classIncluded,
    constant_on_cohort: false,
    n_distinct_values: classCounts.size,
    included_in_model: classIncluded,
    excluded_reason: classIncluded
      ? null
      : `join rate ${(100 * classJoinRate).toFixed(1)}% is below the ${100 * MIN_JOIN_RATE}% gate`,
  });

  const usedCandidates = CANDIDATES.filter(
    (c) => joinReport.find((j) => j.feature === c.name)?.included_in_model
  );

  // Fill values are training-set medians, so a failed join sits at the centre.
  const fills = {};
  for (const c of usedCandidates) {
    fills[c.name] = median(trainRows.map((r) => Number(c.get(featOf(r)))));
  }

  // --- Feature extractors ---------------------------------------------------
  const tractNames = [
    ...usedCandidates.map((c) => c.name),
    ...(classIncluded ? topClasses.map((c) => `class_${c.label.replace(/\W+/g, "_")}`) : []),
  ];

  const extractTract = (r) => {
    const f = featOf(r);
    const out = [];
    for (const c of usedCandidates) {
      const raw = c.get(f);
      const v = raw === null || !Number.isFinite(Number(raw)) ? fills[c.name] : Number(raw);
      out.push(v * c.scale);
    }
    if (classIncluded) {
      const cl = f?.class_l1 || null;
      for (const tc of topClasses) out.push(cl === tc.label ? 1 : 0);
    }
    return out;
  };

  const MODELS = {
    M0: {
      label: "publication_count alone",
      featureNames: ["log1p_pub_count"],
      extractX: (r) => [logPub(r) / 8.0],
    },
    M1: {
      label: "publication_count + 8 biology features",
      featureNames: ["log1p_pub_count", ...BIOLOGY_FEATURE_KEYS],
      extractX: (r) => [logPub(r) / 8.0, ...BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k))],
    },
    M3: {
      label: "publication_count + 8 biology features + tractability features",
      featureNames: ["log1p_pub_count", ...BIOLOGY_FEATURE_KEYS, ...tractNames],
      extractX: (r) => [
        logPub(r) / 8.0,
        ...BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k)),
        ...extractTract(r),
      ],
    },
  };

  const fitted = {};
  const testScores = {};
  const trainScores = {};
  for (const id of ["M0", "M1", "M3"]) {
    fitted[id] = fitLogistic(trainRows, LABEL_KEY, MODELS[id].extractX, MODELS[id].featureNames);
    testScores[id] = testRows.map((r) => fitted[id].predict(r));
    trainScores[id] = trainRows.map((r) => fitted[id].predict(r));
  }

  const trainLabels = trainRows.map((r) => (r[LABEL_KEY] ? 1 : 0));
  const testLabels = testRows.map((r) => (r[LABEL_KEY] ? 1 : 0));

  const heldOutModels = {};
  const trainModels = {};
  for (const id of ["M0", "M1", "M3"]) {
    heldOutModels[id] = { label: MODELS[id].label, n_features: MODELS[id].featureNames.length, ...evaluate(testLabels, testScores[id]) };
    trainModels[id] = { label: MODELS[id].label, ...evaluate(trainLabels, trainScores[id]) };
  }

  const pairedDeltas = {
    M3_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M3),
    M3_vs_M1: pairedDeltaCi(testLabels, testScores.M1, testScores.M3),
    M1_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M1),
  };

  const clusters = testDiseases
    .map((d) => {
      const rows = d.targets.filter((r) => r.drugCount_2021 === 0);
      return {
        disease_name: d.disease_name,
        labels: rows.map((r) => (r[LABEL_KEY] ? 1 : 0)),
        M0: rows.map((r) => fitted.M0.predict(r)),
        M1: rows.map((r) => fitted.M1.predict(r)),
        M3: rows.map((r) => fitted.M3.predict(r)),
      };
    })
    .filter((c) => c.labels.length > 0);

  const clusteredDeltas = {
    M3_vs_M0: clusteredDeltaCi(clusters, "M0", "M3"),
    M3_vs_M1: clusteredDeltaCi(clusters, "M1", "M3"),
  };

  // --- Headline, governed by the conservative bootstrap ---------------------
  const p30 = pairedDeltas.M3_vs_M0.roc_auc;
  const c30 = clusteredDeltas.M3_vs_M0.roc_auc;
  const p31 = pairedDeltas.M3_vs_M1.roc_auc;

  const beatsM0PairLevel = !p30.includes_zero && p30.delta > 0;
  const beatsM0Clustered = !c30.includes_zero && (c30.median_delta ?? 0) > 0;
  const promote = beatsM0PairLevel && beatsM0Clustered;

  let finding;
  if (!beatsM0PairLevel) {
    finding =
      `**No public pre-2021 feature set tested here predicts clinical progression beyond ` +
      `attention.** Adding tractability, protein class, genetic constraint, essentiality and ` +
      `expression selectivity to publication count and the eight Open Targets biology features ` +
      `moves held-out ROC-AUC by ${signed(p30.delta)} against publication count alone ` +
      `(95% CI ${signed(p30.ci_low)} to ${signed(p30.ci_high)}), an interval that includes zero. ` +
      `Against M1 the delta is ${signed(p31.delta)} (95% CI ${signed(p31.ci_low)} to ` +
      `${signed(p31.ci_high)}). No production score is promoted on this result.`;
  } else if (!beatsM0Clustered) {
    finding =
      `**M3 beats publication count on a pair-level bootstrap but not on a disease-clustered ` +
      `one, so the result is not established.** Held-out ROC-AUC moves ${signed(p30.delta)} ` +
      `against M0 (95% CI ${signed(p30.ci_low)} to ${signed(p30.ci_high)}) resampling pairs, but ` +
      `resampling whole diseases the interval is ${signed(c30.ci_low)} to ${signed(c30.ci_high)}, ` +
      `which includes zero. The held-out rows cluster into ` +
      `${clusteredDeltas.M3_vs_M0.n_clusters} diseases, so the pair-level interval is the ` +
      `optimistic one. No production score is promoted.`;
  } else {
    finding =
      `**M3 beats publication count under both bootstraps.** Held-out ROC-AUC moves ` +
      `${signed(p30.delta)} against M0 (95% CI ${signed(p30.ci_low)} to ${signed(p30.ci_high)} ` +
      `resampling pairs; ${signed(c30.ci_low)} to ${signed(c30.ci_high)} resampling diseases). ` +
      `Against M1, which already has the biology features, the delta is ${signed(p31.delta)} ` +
      `(95% CI ${signed(p31.ci_low)} to ${signed(p31.ci_high)}). Promotion to a production score ` +
      `is permitted by the acceptance criteria but is NOT done in this commit: that is a separate ` +
      `decision, and the Goodhart risk of shipping a ${heldOutModels.M3.n_features}-feature model ` +
      `fitted on ${trainRows.length} rows with ${trainLabels.reduce((a, b) => a + b, 0)} positives ` +
      `should be weighed first.`;
  }

  const nPosTest = testLabels.reduce((a, b) => a + b, 0);

  const report = {
    generated_at: new Date().toISOString(),
    task: "Task 5 — pre-2021 tractability features vs attention",
    historical_release: snapshot.historical_release,
    current_release: snapshot.current_release,
    cohort: "cohort 2 — targets with drugCount_2021 == 0 (first-in-class progression)",
    label_key: LABEL_KEY,
    n_train_diseases: snapshot.n_train_diseases,
    n_test_diseases: snapshot.n_test_diseases,
    min_join_rate: MIN_JOIN_RATE,
    feature_source_vintage: featureTable.vintage,
    features_skipped_at_build: featureTable.skipped,
    depmap_matrix: featureTable.depmap_matrix,
    cohort_coverage: {
      n_cohort_rows: nAll,
      n_present_in_21_04_target_etl: presentInTable,
      present_rate: Number((presentInTable / Math.max(1, nAll)).toFixed(4)),
    },
    join_rates: joinReport,
    protein_classes_used: classIncluded ? topClasses : [],
    models: Object.fromEntries(
      Object.entries(MODELS).map(([id, m]) => [id, { label: m.label, features: m.featureNames }])
    ),
    train: {
      n_total: trainRows.length,
      n_positives: trainLabels.reduce((a, b) => a + b, 0),
      models: trainModels,
    },
    held_out: {
      n_total: testRows.length,
      n_positives: nPosTest,
      prevalence: Number((nPosTest / Math.max(1, testRows.length)).toFixed(4)),
      models: heldOutModels,
    },
    paired_deltas: pairedDeltas,
    clustered_deltas: clusteredDeltas,
    promotion: {
      criterion: "M3 must beat M0 with a paired CI excluding zero",
      beats_m0_pair_level: beatsM0PairLevel,
      beats_m0_disease_clustered: beatsM0Clustered,
      criterion_met: promote,
      promoted_to_production: false,
      note: "No production score was changed by this run. The brief permits promotion only if M3 beats M0 with a CI excluding zero; this field records whether it did.",
    },
    finding,
    coefficients: Object.fromEntries(
      Object.entries(fitted).map(([id, f]) => [id, { intercept: f.intercept, coefficients: f.coefficients }])
    ),
    leakage_controls: [
      "Every feature comes from a source dated before the May 2021 cutoff; each source's release date and the evidence for it are in `feature_source_vintage`.",
      "Features whose vintage could not be established were not built; see `features_skipped_at_build`.",
      "Outcomes come only from 26.09.",
      "All three models are fitted on the 11 training diseases; the 11 held-out diseases are used once, for evaluation.",
      "Fill values for failed joins are training-set medians, so no held-out value informs any fill.",
      "Features that are constant on the cohort are excluded and reported, so a model's feature count is not inflated by features that cannot contribute.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(report));

  return report;
}

function inferVintage(name, table) {
  if (name.startsWith("tract_") || name.startsWith("class_")) return "ot_21_04";
  if (name === "pli" || name === "loeuf") return "gnomad_v2_1_1";
  if (name.startsWith("depmap")) return "depmap_21q2";
  if (name.startsWith("gtex")) return "gtex_v8";
  return table.feature_vintage?.[name] || "unknown";
}

function renderMarkdown(report) {
  const L = [];
  const h = report.held_out;

  L.push("# Task 5 — Do Pre-2021 Tractability Features Beat Attention?");
  L.push("");
  L.push(`Generated: ${report.generated_at}`);
  L.push("");
  L.push(
    `Cohort 2 (\`drugCount_2021 == 0\`), Open Targets ${report.historical_release} → ${report.current_release}. ` +
      `Fitted on ${report.n_train_diseases} training diseases (${report.train.n_total} pairs, ${report.train.n_positives} positives); ` +
      `evaluated on ${report.n_test_diseases} held-out diseases (${h.n_total} pairs, ${h.n_positives} positives, base rate ${fmt(h.prevalence)}).`
  );
  L.push("");

  L.push("## Headline finding");
  L.push("");
  L.push(report.finding);
  L.push("");

  L.push("## Table 1 — Feature vintage");
  L.push("");
  L.push("Every source had to be shown to predate May 2021 before it could be used.");
  L.push("");
  L.push("| Source | Release | Release date | Pre-cutoff | Evidence |");
  L.push("|---|---|---|:---:|---|");
  for (const [, v] of Object.entries(report.feature_source_vintage)) {
    L.push(`| ${v.source} | \`${v.release}\` | ${v.release_date} | ${v.predates_cutoff ? "yes" : "**no**"} | ${v.evidence} |`);
  }
  L.push("");
  if (report.features_skipped_at_build && report.features_skipped_at_build.length) {
    L.push("Skipped at build time:");
    L.push("");
    for (const s of report.features_skipped_at_build) L.push(`- \`${s.feature}\`: ${s.reason}`);
    L.push("");
  } else {
    L.push("No feature was skipped for an unestablished vintage.");
    L.push("");
  }

  L.push("## Table 2 — Join rates");
  L.push("");
  L.push(
    `Joined on Ensembl gene ID, except DepMap which joins on approved symbol. ` +
      `${report.cohort_coverage.n_present_in_21_04_target_etl} of ${report.cohort_coverage.n_cohort_rows} ` +
      `cohort rows (${fmt(100 * report.cohort_coverage.present_rate, 1)}%) have a record in the 21.04 target ETL at all. ` +
      `A feature joining under ${100 * report.min_join_rate}% of targets is reported but excluded from the fitted model.`
  );
  L.push("");
  L.push("| Feature | Vintage | Joined | Join rate | Constant? | In model | Why excluded |");
  L.push("|---|---|---:|---:|:---:|:---:|---|");
  for (const j of report.join_rates) {
    L.push(
      `| \`${j.feature}\` | ${j.vintage} | ${j.n_joined} | ${fmt(100 * j.join_rate, 1)}% | ${j.constant_on_cohort ? "**yes**" : "no"} | ${j.included_in_model ? "yes" : "**no**"} | ${j.excluded_reason || "—"} |`
    );
  }
  L.push("");

  L.push("## Table 3 — Nested models, held-out test diseases");
  L.push("");
  L.push("| Model | Features | n features | ROC-AUC | PR-AUC | precision@25 | recall@25 |");
  L.push("|---|---|---:|---:|---:|---:|---:|");
  for (const id of ["M0", "M1", "M3"]) {
    const m = h.models[id];
    L.push(
      `| \`${id}\` | ${m.label} | ${m.n_features} | **${fmt(m.roc_auc)}** | **${fmt(m.pr_auc)}** | ${fmt(m.precision_at_25)} | ${fmt(m.recall_at_25)} |`
    );
  }
  L.push("");
  L.push("Training-set figures (fitting diagnostics, not evidence):");
  L.push("");
  L.push("| Model | ROC-AUC | PR-AUC |");
  L.push("|---|---:|---:|");
  for (const id of ["M0", "M1", "M3"]) {
    const m = report.train.models[id];
    L.push(`| \`${id}\` | ${fmt(m.roc_auc)} | ${fmt(m.pr_auc)} |`);
  }
  L.push("");

  L.push("## Table 4 — Paired deltas, resampling pairs");
  L.push("");
  L.push("| Comparison | Metric | Delta | 95% CI on the delta | CI includes zero? |");
  L.push("|---|---|---:|---:|:---:|");
  for (const [name, key] of [
    ["M3 vs M0", "M3_vs_M0"],
    ["M3 vs M1", "M3_vs_M1"],
    ["M1 vs M0", "M1_vs_M0"],
  ]) {
    for (const metric of ["roc_auc", "pr_auc"]) {
      const d = report.paired_deltas[key][metric];
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | **${signed(d.delta)}** | ${signed(d.ci_low)} to ${signed(d.ci_high)} | ${d.includes_zero ? "**yes**" : "no"} |`
      );
    }
  }
  L.push("");

  L.push("## Table 5 — Same deltas, resampling whole diseases");
  L.push("");
  L.push(
    `The held-out rows cluster into ${report.clustered_deltas.M3_vs_M0.n_clusters} diseases and are ` +
      "not independent. This is the conservative reading and it governs the headline."
  );
  L.push("");
  L.push("| Comparison | Metric | Median delta | 95% CI on the delta | CI includes zero? |");
  L.push("|---|---|---:|---:|:---:|");
  for (const [name, key] of [
    ["M3 vs M0", "M3_vs_M0"],
    ["M3 vs M1", "M3_vs_M1"],
  ]) {
    for (const metric of ["roc_auc", "pr_auc"]) {
      const d = report.clustered_deltas[key][metric];
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | ${signed(d.median_delta)} | ${signed(d.ci_low)} to ${signed(d.ci_high)} | ${d.includes_zero ? "**yes**" : "no"} |`
      );
    }
  }
  L.push("");

  L.push("## Promotion decision");
  L.push("");
  L.push(`- Criterion: ${report.promotion.criterion}`);
  L.push(`- Beats M0, pair-level bootstrap: **${report.promotion.beats_m0_pair_level ? "yes" : "no"}**`);
  L.push(`- Beats M0, disease-clustered bootstrap: **${report.promotion.beats_m0_disease_clustered ? "yes" : "no"}**`);
  L.push(`- Criterion met: **${report.promotion.criterion_met ? "yes" : "no"}**`);
  L.push(`- Promoted to production: **${report.promotion.promoted_to_production ? "yes" : "no"}**`);
  L.push("");
  L.push(report.promotion.note);
  L.push("");

  L.push("## Leakage controls");
  L.push("");
  for (const line of report.leakage_controls) L.push(`- ${line}`);
  L.push("");

  L.push("## Reproducing");
  L.push("");
  L.push("```");
  L.push("node benchmark/docking/scripts/build_target_features.mjs");
  L.push("node benchmark/docking/scripts/tractability_models.mjs");
  L.push("```");
  L.push("");

  return L.join("\n");
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runTractabilityModels({ refresh: process.argv.includes("--refresh") })
    .then((report) => {
      const h = report.held_out;
      process.stderr.write("\n");
      for (const j of report.join_rates) {
        process.stderr.write(
          `  ${j.feature.padEnd(32)} join ${fmt(100 * j.join_rate, 1).padStart(6)}%  ${j.included_in_model ? "USED" : "excluded: " + j.excluded_reason}\n`
        );
      }
      process.stderr.write("\n");
      for (const id of ["M0", "M1", "M3"]) {
        const m = h.models[id];
        process.stderr.write(
          `  ${id}  ROC ${fmt(m.roc_auc)}  PR ${fmt(m.pr_auc)}  p@25 ${fmt(m.precision_at_25)}  (${m.n_features} features)\n`
        );
      }
      for (const [name, key] of [["M3 vs M0", "M3_vs_M0"], ["M3 vs M1", "M3_vs_M1"]]) {
        const d = report.paired_deltas[key].roc_auc;
        const c = report.clustered_deltas[key].roc_auc;
        process.stderr.write(
          `\n  ${name} ROC: pairs ${signed(d.delta)} [${signed(d.ci_low)}, ${signed(d.ci_high)}]` +
            ` | diseases [${signed(c.ci_low)}, ${signed(c.ci_high)}]\n`
        );
      }
      process.stderr.write(`\n  criterion met: ${report.promotion.criterion_met}\n`);
      process.stderr.write(`\nWrote ${path.relative(REPO_ROOT, OUT_JSON)}\n`);
      process.stderr.write(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`[task5] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
