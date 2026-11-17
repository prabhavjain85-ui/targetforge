#!/usr/bin/env node
/**
 * Task 7 — is the somatic_mutation finding a cancer effect?
 *
 * Task 4 found that the eight Open Targets biology features add +0.054 held-out
 * ROC-AUC over publication count alone (95% CI +0.021 to +0.089 resampling
 * pairs, +0.003 to +0.112 resampling diseases), and that the feature carrying
 * it is somatic_mutation: residualised against attention it scores 0.709, while
 * genetic_association residualises to 0.342.
 *
 * The panel is 15 cancers and 7 non-cancers. Somatic mutation evidence in Open
 * Targets comes largely from cancer genomics (COSMIC, intOGen, cancer gene
 * census), so a somatic signal could be an oncology effect rather than a
 * general statement about target prioritisation. If it is, that is a scope limit
 * the claim has to carry.
 *
 * This re-runs the Task 4 nested comparison and the residualised per-feature
 * table separately on the cancer and non-cancer held-out diseases.
 *
 * WHAT THIS SCRIPT EXPECTS TO FIND, AND WHY IT SAYS SO UP FRONT
 * The held-out non-cancer stratum is two diseases, and one of them contributes
 * zero cohort-2 pairs. One disease is not a stratum you can bootstrap over, so
 * the honest answer is likely "underpowered to tell" rather than a comparison.
 * The script reports stratum counts first and refuses to emit a disease-level CI
 * for a stratum with fewer than MIN_CLUSTERS_FOR_CI diseases, substituting an
 * explicit statement of the counts.
 *
 * Models are always fitted on the FULL training set, never per stratum: with 5
 * non-cancer training diseases a stratum-fitted model would be measuring sample
 * size, and refitting per stratum would also change what is being compared
 * between strata. The strata differ only in which held-out rows are scored.
 *
 * Outputs:
 *   benchmark/docking/results/task7_cancer_stratification.json
 *   benchmark/docking/TASK7_CANCER_STRATIFICATION.md
 */
import fs from "fs";
import path from "path";
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
import { prAuc, rocAuc } from "../../../server/benchmark/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCKING_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DOCKING_DIR, "../..");
const LABELS_PATH = path.join(DOCKING_DIR, "data", "disease_cancer_labels.json");
const OUT_JSON = path.join(DOCKING_DIR, "results", "task7_cancer_stratification.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK7_CANCER_STRATIFICATION.md");

const LABEL_KEY = "acquired_global_from_zero";

/**
 * Below this many diseases in a stratum, a disease-level bootstrap is not
 * reported at all. Resampling 1 or 2 clusters produces an interval that looks
 * like a measurement and is not one.
 */
const MIN_CLUSTERS_FOR_CI = 4;

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
  M2: {
    label: "8 biology features alone",
    featureNames: [...BIOLOGY_FEATURE_KEYS],
    extractX: (r) => BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k)),
  },
};

function fitOls1d(xs, ys) {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return {
    slope,
    intercept: my - slope * mx,
    r2: sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy),
  };
}

/**
 * Residualise each biology feature against attention and score the residual.
 *
 * The regression is fitted on the FULL training set, exactly as in Task 4, so
 * the per-stratum residual AUCs are comparable with the Task 4 table and with
 * each other. Fitting the regression per stratum would confound the comparison
 * with how much data each stratum has.
 */
function residualTable(trainRows, rows, labels) {
  const xTrain = trainRows.map(logPub);
  const x = rows.map(logPub);
  const out = [];
  for (const key of BIOLOGY_FEATURE_KEYS) {
    const yTrain = trainRows.map((r) => biologyFeature(r, key));
    const { slope, intercept, r2 } = fitOls1d(xTrain, yTrain);
    const raw = rows.map((r) => biologyFeature(r, key));
    const resid = raw.map((v, i) => v - (intercept + slope * x[i]));
    out.push({
      feature: key,
      regression_on_log1p_pub_count: {
        slope: Number(slope.toFixed(4)),
        intercept: Number(intercept.toFixed(4)),
        r2: Number(r2.toFixed(4)),
      },
      roc_auc_raw: Number(rocAuc(labels, raw).toFixed(4)),
      roc_auc_residual: Number(rocAuc(labels, resid).toFixed(4)),
      pr_auc_residual: Number(prAuc(labels, resid).toFixed(4)),
    });
  }
  return out;
}

export async function runCancerStratification({ refresh = false } = {}) {
  const snapshot = await buildOrLoadRetrospectiveSnapshot({ refresh });
  const labelFile = JSON.parse(fs.readFileSync(LABELS_PATH, "utf8"));

  const stratumById = new Map(labelFile.diseases.map((d) => [d.disease_id_2021, d.stratum]));

  // Every disease in the snapshot must be labelled, or the stratification is
  // silently dropping data.
  const unlabelled = snapshot.diseases
    .map((d) => d.disease_id_2021)
    .filter((id) => !stratumById.has(id));
  if (unlabelled.length) {
    throw new Error(
      `${unlabelled.length} disease(s) missing from ${path.relative(REPO_ROOT, LABELS_PATH)}: ${unlabelled.join(", ")}`
    );
  }

  const cohort2 = (d) => d.targets.filter((r) => r.drugCount_2021 === 0);
  const trainDiseases = snapshot.diseases.filter((d) => d.split === "train");
  const testDiseases = snapshot.diseases.filter((d) => d.split === "test");

  // Fitted once, on the full training set, for every stratum.
  const trainRows = trainDiseases.flatMap(cohort2);
  const fitted = {};
  for (const id of ["M0", "M1", "M2"]) {
    fitted[id] = fitLogistic(trainRows, LABEL_KEY, MODELS[id].extractX, MODELS[id].featureNames);
  }

  const strata = {};
  for (const stratum of ["all", "cancer", "non_cancer"]) {
    const ds = testDiseases.filter(
      (d) => stratum === "all" || stratumById.get(d.disease_id_2021) === stratum
    );
    const perDisease = ds.map((d) => {
      const rows = cohort2(d);
      return {
        disease_id_2021: d.disease_id_2021,
        disease_name: d.disease_name,
        stratum: stratumById.get(d.disease_id_2021),
        n_pairs: rows.length,
        n_positives: rows.filter((r) => r[LABEL_KEY]).length,
        rows,
      };
    });

    const withData = perDisease.filter((p) => p.n_pairs > 0);
    const rows = withData.flatMap((p) => p.rows);
    const labels = rows.map((r) => (r[LABEL_KEY] ? 1 : 0));
    const nPos = labels.reduce((a, b) => a + b, 0);

    const scores = {};
    for (const id of ["M0", "M1", "M2"]) scores[id] = rows.map((r) => fitted[id].predict(r));

    const models = {};
    for (const id of ["M0", "M1", "M2"]) {
      models[id] = { label: MODELS[id].label, ...evaluate(labels, scores[id]) };
    }

    const clusters = withData.map((p) => ({
      disease_name: p.disease_name,
      labels: p.rows.map((r) => (r[LABEL_KEY] ? 1 : 0)),
      M0: p.rows.map((r) => fitted.M0.predict(r)),
      M1: p.rows.map((r) => fitted.M1.predict(r)),
      M2: p.rows.map((r) => fitted.M2.predict(r)),
    }));

    const enoughClusters = clusters.length >= MIN_CLUSTERS_FOR_CI;

    strata[stratum] = {
      n_diseases_in_split: ds.length,
      n_diseases_with_cohort2_data: withData.length,
      diseases_with_no_data: perDisease
        .filter((p) => p.n_pairs === 0)
        .map((p) => ({ disease_name: p.disease_name, reason: "no cohort-2 target-disease pairs" })),
      per_disease: perDisease.map(({ rows: _rows, ...rest }) => rest),
      n_total: rows.length,
      n_positives: nPos,
      prevalence: rows.length ? Number((nPos / rows.length).toFixed(4)) : null,
      models,
      paired_deltas: rows.length
        ? {
            M1_vs_M0: pairedDeltaCi(labels, scores.M0, scores.M1),
            M2_vs_M0: pairedDeltaCi(labels, scores.M0, scores.M2),
          }
        : null,
      // Deliberately withheld below MIN_CLUSTERS_FOR_CI rather than computed.
      clustered_deltas: enoughClusters
        ? {
            M1_vs_M0: clusteredDeltaCi(clusters, "M0", "M1"),
            M2_vs_M0: clusteredDeltaCi(clusters, "M0", "M2"),
          }
        : null,
      clustered_withheld_reason: enoughClusters
        ? null
        : `only ${clusters.length} held-out disease(s) with data in this stratum; a disease-level bootstrap over ` +
          `fewer than ${MIN_CLUSTERS_FOR_CI} clusters would produce an interval that looks like a measurement and is not one`,
      residualised: rows.length ? residualTable(trainRows, rows, labels) : null,
    };
  }

  // --- The question: does somatic_mutation's residualised signal hold outside oncology?
  const somaticOf = (s) =>
    strata[s].residualised
      ? strata[s].residualised.find((r) => r.feature === "somatic_mutation")
      : null;
  const somAll = somaticOf("all");
  const somCancer = somaticOf("cancer");
  const somNon = somaticOf("non_cancer");

  const nonCancerClusters = strata.non_cancer.n_diseases_with_cohort2_data;
  const underpowered = nonCancerClusters < MIN_CLUSTERS_FOR_CI;

  let verdict;
  let verdictLabel;
  if (underpowered) {
    verdictLabel = "underpowered to tell";
    verdict =
      `**Underpowered to tell.** The held-out non-cancer stratum is ` +
      `${strata.non_cancer.n_diseases_in_split} ` +
      `${strata.non_cancer.n_diseases_in_split === 1 ? "disease" : "diseases"}, of which only ` +
      `${nonCancerClusters} ${nonCancerClusters === 1 ? "contributes" : "contribute"} any ` +
      `cohort-2 pairs` +
      (strata.non_cancer.diseases_with_no_data.length
        ? ` (${strata.non_cancer.diseases_with_no_data.map((d) => d.disease_name).join(", ")} ` +
          `${strata.non_cancer.diseases_with_no_data.length === 1 ? "contributes" : "contribute"} none)`
        : "") +
      `: ${strata.non_cancer.n_total} pairs with ${strata.non_cancer.n_positives} positives, against ` +
      `${strata.cancer.n_total} pairs and ${strata.cancer.n_positives} positives across ` +
      `${strata.cancer.n_diseases_with_cohort2_data} cancers. No disease-level confidence interval is ` +
      `reported for the non-cancer stratum, because resampling one cluster would ` +
      `produce an interval that looks like a measurement and is not one.\n\n` +
      `What the point estimates say, for what little that is worth at this sample size: ` +
      `somatic_mutation residualises to ${fmt(somCancer.roc_auc_residual)} on the cancers and ` +
      `${fmt(somNon.roc_auc_residual)} on the non-cancers, against ${fmt(somAll.roc_auc_residual)} ` +
      `pooled. These are single numbers from one non-cancer disease and must not be quoted as a ` +
      `comparison — least of all as evidence that the signal generalises, which is the direction ` +
      `the non-cancer number happens to point.\n\n` +
      `**What IS established is the scope of the Task 4 result.** The cancer stratum reproduces it ` +
      `almost exactly: M1 vs M0 is ${signed(strata.cancer.paired_deltas.M1_vs_M0.roc_auc.delta)} ` +
      `on the ${strata.cancer.n_diseases_with_cohort2_data} held-out cancers ` +
      `(95% CI ${signed(strata.cancer.paired_deltas.M1_vs_M0.roc_auc.ci_low)} to ` +
      `${signed(strata.cancer.paired_deltas.M1_vs_M0.roc_auc.ci_high)} resampling pairs, ` +
      `${signed(strata.cancer.clustered_deltas.M1_vs_M0.roc_auc.ci_low)} to ` +
      `${signed(strata.cancer.clustered_deltas.M1_vs_M0.roc_auc.ci_high)} resampling diseases), ` +
      `against ${signed(strata.all.paired_deltas.M1_vs_M0.roc_auc.delta)} pooled. ` +
      `${strata.cancer.n_total} of the ${strata.all.n_total} held-out pairs and ` +
      `${strata.cancer.n_positives} of the ${strata.all.n_positives} positives are cancer, so the ` +
      `pooled Task 4 figure essentially IS the cancer figure. On the one held-out non-cancer ` +
      `disease the biology features do not help at all ` +
      `(${signed(strata.non_cancer.paired_deltas.M1_vs_M0.roc_auc.delta)}, 95% CI ` +
      `${signed(strata.non_cancer.paired_deltas.M1_vs_M0.roc_auc.ci_low)} to ` +
      `${signed(strata.non_cancer.paired_deltas.M1_vs_M0.roc_auc.ci_high)}, including zero, and ` +
      `publication count alone scores higher there: ${fmt(strata.non_cancer.models.M0.roc_auc)} ` +
      `against M1's ${fmt(strata.non_cancer.models.M1.roc_auc)}). One disease cannot carry that ` +
      `conclusion either, but it is the only non-cancer evidence there is and it does not support ` +
      `generalisation.\n\n` +
      `So: **every figure in Task 4 should be read as an oncology result**, and the validation page ` +
      `has been changed to say so. Deciding whether the biology features help outside cancer needs ` +
      `more non-cancer diseases in the panel, not more analysis of these ` +
      `${strata.non_cancer.n_positives} positives.`;
  } else {
    const holds = somNon.roc_auc_residual >= 0.6;
    verdictLabel = holds ? "general" : "oncology-specific";
    verdict =
      `somatic_mutation residualises to ${fmt(somCancer.roc_auc_residual)} on the held-out cancers ` +
      `and ${fmt(somNon.roc_auc_residual)} on the held-out non-cancers ` +
      `(${nonCancerClusters} diseases, ${strata.non_cancer.n_total} pairs, ` +
      `${strata.non_cancer.n_positives} positives). ` +
      (holds
        ? `The signal holds outside oncology.`
        : `The signal does not hold outside oncology: it is a cancer-genomics effect, and the ` +
          `Task 4 finding should be scoped to cancers.`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    task: "Task 7 — cancer / non-cancer stratification of the Task 4 attention-control result",
    historical_release: snapshot.historical_release,
    current_release: snapshot.current_release,
    cohort: "cohort 2 — targets with drugCount_2021 == 0 (first-in-class progression)",
    label_key: LABEL_KEY,
    labels_source: path.relative(REPO_ROOT, LABELS_PATH).replace(/\\/g, "/"),
    panel_counts: labelFile.counts,
    min_clusters_for_ci: MIN_CLUSTERS_FOR_CI,
    models_fitted_on: "the full 11-disease training set, never per stratum",
    train: {
      n_total: trainRows.length,
      n_positives: trainRows.filter((r) => r[LABEL_KEY]).length,
      n_cancer_diseases: trainDiseases.filter((d) => stratumById.get(d.disease_id_2021) === "cancer").length,
      n_non_cancer_diseases: trainDiseases.filter((d) => stratumById.get(d.disease_id_2021) === "non_cancer").length,
    },
    verdict_label: verdictLabel,
    verdict,
    somatic_mutation_residualised: {
      all: somAll ? somAll.roc_auc_residual : null,
      cancer: somCancer ? somCancer.roc_auc_residual : null,
      non_cancer: somNon ? somNon.roc_auc_residual : null,
      task4_pooled_reference: 0.709,
    },
    strata,
    leakage_controls: [
      "Predictors come only from the Open Targets 21.04 snapshot; outcomes only from 26.09.",
      "The cancer/non-cancer labelling uses only the disease name, which is fixed in the 21.04 snapshot, so it introduces no post-2021 information.",
      "All three models and every residualisation regression are fitted on the full 11-disease training set. No stratum is fitted on its own held-out data.",
      "The split is by disease, so a target appearing in two diseases cannot straddle train and test.",
      "No disease-level interval is computed for a stratum with fewer than 4 held-out diseases.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  return report;
}

function renderMarkdown(r) {
  const L = [];
  L.push("# Task 7 — Is the Somatic-Mutation Finding a Cancer Effect?");
  L.push("");
  L.push(`Generated: ${r.generated_at}`);
  L.push("");
  L.push(
    `Cohort 2, Open Targets ${r.historical_release} → ${r.current_release}. Panel: ` +
      `${r.panel_counts.cancer} cancers and ${r.panel_counts.non_cancer} non-cancers ` +
      `(labelling committed at \`${r.labels_source}\`). Models fitted on ${r.models_fitted_on}.`
  );
  L.push("");

  L.push("## Headline finding");
  L.push("");
  L.push(r.verdict);
  L.push("");

  L.push("## Table 1 — Held-out stratum sizes");
  L.push("");
  L.push("Counts first, because they decide what can be said at all.");
  L.push("");
  L.push("| Stratum | Diseases in split | With cohort-2 data | Pairs | Positives | Base rate |");
  L.push("|---|---:|---:|---:|---:|---:|");
  for (const key of ["all", "cancer", "non_cancer"]) {
    const s = r.strata[key];
    L.push(
      `| ${key} | ${s.n_diseases_in_split} | ${s.n_diseases_with_cohort2_data} | ${s.n_total} | ` +
        `${s.n_positives} | ${s.prevalence === null ? "—" : fmt(s.prevalence)} |`
    );
  }
  L.push("");
  for (const key of ["cancer", "non_cancer"]) {
    const s = r.strata[key];
    if (s.diseases_with_no_data.length) {
      L.push(
        `Contributing no cohort-2 pairs (${key}): ` +
          s.diseases_with_no_data.map((d) => `${d.disease_name}`).join(", ") +
          "."
      );
      L.push("");
    }
  }

  L.push("### Held-out diseases, individually");
  L.push("");
  L.push("| Disease | Stratum | Pairs | Positives |");
  L.push("|---|---|---:|---:|");
  for (const p of r.strata.all.per_disease) {
    L.push(`| ${p.disease_name} | ${p.stratum} | ${p.n_pairs} | ${p.n_positives} |`);
  }
  L.push("");

  L.push("## Table 2 — Nested models per stratum");
  L.push("");
  L.push("| Stratum | Model | ROC-AUC | PR-AUC | precision@25 | recall@25 |");
  L.push("|---|---|---:|---:|---:|---:|");
  for (const key of ["all", "cancer", "non_cancer"]) {
    const s = r.strata[key];
    for (const id of ["M0", "M1", "M2"]) {
      const m = s.models[id];
      L.push(
        `| ${key} | \`${id}\` | ${fmt(m.roc_auc)} | ${fmt(m.pr_auc)} | ${fmt(m.precision_at_25)} | ${fmt(m.recall_at_25)} |`
      );
    }
  }
  L.push("");

  L.push("## Table 3 — Paired deltas per stratum");
  L.push("");
  L.push("| Stratum | Comparison | Metric | Delta | 95% CI (pairs) | 95% CI (diseases) |");
  L.push("|---|---|---|---:|---:|---:|");
  for (const key of ["all", "cancer", "non_cancer"]) {
    const s = r.strata[key];
    if (!s.paired_deltas) continue;
    for (const cmp of ["M1_vs_M0", "M2_vs_M0"]) {
      for (const metric of ["roc_auc", "pr_auc"]) {
        const p = s.paired_deltas[cmp][metric];
        const c = s.clustered_deltas ? s.clustered_deltas[cmp][metric] : null;
        const cText = c
          ? `${signed(c.ci_low)} to ${signed(c.ci_high)}${c.includes_zero ? " (incl. 0)" : ""}`
          : "**withheld**";
        L.push(
          `| ${key} | ${cmp.replace("_vs_", " vs ")} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | ` +
            `${signed(p.delta)} | ${signed(p.ci_low)} to ${signed(p.ci_high)}${p.includes_zero ? " (incl. 0)" : ""} | ${cText} |`
        );
      }
    }
  }
  L.push("");
  for (const key of ["all", "cancer", "non_cancer"]) {
    const s = r.strata[key];
    if (s.clustered_withheld_reason) {
      L.push(`Disease-level CI withheld for \`${key}\`: ${s.clustered_withheld_reason}.`);
      L.push("");
    }
  }

  L.push("## Table 4 — Residualised features per stratum");
  L.push("");
  L.push(
    "Each biology feature regressed on `log1p(publication_count)`, regression fitted on the full " +
      "training set, held-out AUC of the residual reported per stratum. The question this table " +
      "exists to answer is whether `somatic_mutation`'s residualised " +
      `${fmt(r.somatic_mutation_residualised.task4_pooled_reference)} from Task 4 survives outside oncology.`
  );
  L.push("");
  L.push("| Feature | R² vs attention | Residual AUC (all) | Residual AUC (cancer) | Residual AUC (non-cancer) |");
  L.push("|---|---:|---:|---:|---:|");
  const byFeature = (key, f) => {
    const t = r.strata[key].residualised;
    if (!t) return null;
    return t.find((x) => x.feature === f);
  };
  for (const f of r.strata.all.residualised.map((x) => x.feature)) {
    const a = byFeature("all", f);
    const c = byFeature("cancer", f);
    const n = byFeature("non_cancer", f);
    L.push(
      `| \`${f}\` | ${fmt(a.regression_on_log1p_pub_count.r2)} | ${fmt(a.roc_auc_residual)} | ` +
        `${c ? fmt(c.roc_auc_residual) : "—"} | ${n ? fmt(n.roc_auc_residual) : "—"} |`
    );
  }
  L.push("");
  L.push(
    "The non-cancer column comes from " +
      `${r.strata.non_cancer.n_diseases_with_cohort2_data} disease(s) and ` +
      `${r.strata.non_cancer.n_positives} positives. It is a point estimate with no interval, and ` +
      "it is reported for completeness, not as a comparison."
  );
  L.push("");

  L.push("## Leakage controls");
  L.push("");
  for (const line of r.leakage_controls) L.push(`- ${line}`);
  L.push("");

  L.push("## Reproducing");
  L.push("");
  L.push("```");
  L.push("node benchmark/docking/scripts/cancer_stratification.mjs");
  L.push("```");
  L.push("");
  return L.join("\n");
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runCancerStratification({ refresh: process.argv.includes("--refresh") })
    .then((r) => {
      process.stderr.write("\n");
      for (const key of ["all", "cancer", "non_cancer"]) {
        const s = r.strata[key];
        process.stderr.write(
          `  ${key.padEnd(11)} ${String(s.n_diseases_with_cohort2_data).padStart(2)} diseases  ` +
            `${String(s.n_total).padStart(5)} pairs  ${String(s.n_positives).padStart(3)} pos  ` +
            `M0 ${fmt(s.models.M0.roc_auc)}  M1 ${fmt(s.models.M1.roc_auc)}  M2 ${fmt(s.models.M2.roc_auc)}\n`
        );
      }
      const sm = r.somatic_mutation_residualised;
      process.stderr.write(
        `\n  somatic_mutation residualised: all ${fmt(sm.all)}  cancer ${fmt(sm.cancer)}  non-cancer ${fmt(sm.non_cancer)}\n`
      );
      process.stderr.write(`  verdict: ${r.verdict_label}\n\n`);
      process.stderr.write(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)}\n`);
      process.stderr.write(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`[task7] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
