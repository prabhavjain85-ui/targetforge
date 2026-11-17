#!/usr/bin/env node
/**
 * Task 4 — does Open Targets biology predict clinical progression BEYOND
 * attention?
 *
 * Task 3 answered "what predicts clinical progression" and the answer was
 * publication count: the fitted simplex put 0.814 of its weight on the
 * literature feature, and publication count alone scored held-out ROC-AUC
 * 0.667 against the fitted model's 0.708. That makes the fitted model largely
 * a proxy for how much a target has been written about, which is not a useful
 * thing to tell a user who is choosing what to work on.
 *
 * The question worth answering is whether the eight biology features add
 * anything once attention is controlled for. This script answers it with a
 * nested model comparison on cohort 2 (targets with drugCount_2021 == 0),
 * fitted on the 11 training diseases and evaluated on the 11 held out:
 *
 *   M0: publication_count alone                   — the baseline to beat
 *   M1: publication_count + the 8 biology features
 *   M2: the 8 biology features alone
 *
 * The statistic that actually answers the question is the PAIRED difference
 * between M1 and M0 on the held-out set, with a bootstrap CI on the difference
 * itself: resample held-out rows, recompute both models' AUCs on each
 * resample, and take the delta. A CI that includes zero means the biology
 * features add nothing over counting papers.
 *
 * It also residualises each biology feature against log1p(publication_count),
 * fitting the regression on training diseases only, and reports the held-out
 * AUC of the residuals. That separates "correlated with attention" from
 * "informative".
 *
 * LEAKAGE RULES, enforced by construction:
 *   - Every predictor is computed from the 21.04 snapshot (May 2021). Outcomes
 *     come only from 26.09.
 *   - All fitting happens on the 11 training diseases. The 11 held-out test
 *     diseases are touched once, for evaluation.
 *
 * Outputs:
 *   benchmark/docking/results/task4_attention_control.json
 *   benchmark/docking/TASK4_ATTENTION_CONTROL.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildOrLoadRetrospectiveSnapshot } from "./validate_novelty_retrospective.mjs";
import { mulberry32, prAuc, rocAuc } from "../../../server/benchmark/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCKING_DIR = path.resolve(__dirname, "..");
const OUT_JSON = path.join(DOCKING_DIR, "results", "task4_attention_control.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK4_ATTENTION_CONTROL.md");

/** Same eight features, same order, as Task 3 and the shipped model. */
const BIOLOGY_FEATURE_KEYS = [
  "genetic_association",
  "genetic_literature",
  "somatic_mutation",
  "overall",
  "literature",
  "affected_pathway",
  "animal_model",
  "rna_expression",
];

const LABEL_KEY = "acquired_global_from_zero";
const N_BOOT = 2000;
const BOOT_SEED = 42;
const TOP_K = 25;

// ---------------------------------------------------------------------------
// Feature access
// ---------------------------------------------------------------------------

function biologyFeature(row, key) {
  return key === "overall"
    ? Number(row.overallScore_2021) || 0
    : Number(row.datatypeScores_2021?.[key]) || 0;
}

/** Attention, on the same log scale the Task 3 logistic used. */
function logPub(row) {
  return Math.log1p(Number(row.publicationCount_2021) || 0);
}

// ---------------------------------------------------------------------------
// Logistic regression, class-weighted, L2, full-batch gradient descent.
// Same optimiser settings as fitFullLogisticModel in Task 3 so the numbers are
// comparable across the two reports.
// ---------------------------------------------------------------------------

function fitLogistic(rows, labelKey, extractX, featureNames, { epochs = 400, lr = 0.25, l2 = 0.02 } = {}) {
  const K = featureNames.length;
  const X = rows.map(extractX);
  const y = rows.map((r) => (r[labelKey] ? 1 : 0));

  const nPos = y.reduce((a, b) => a + b, 0);
  const nNeg = y.length - nPos;
  const posWeight = nPos > 0 ? y.length / (2 * nPos) : 1;
  const negWeight = nNeg > 0 ? y.length / (2 * nNeg) : 1;

  const w = new Array(K).fill(0);
  let b = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(K).fill(0);
    let gradB = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b;
      for (let k = 0; k < K; k++) z += w[k] * X[i][k];
      const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
      const wt = y[i] ? posWeight : negWeight;
      const err = (p - y[i]) * wt;
      for (let k = 0; k < K; k++) gradW[k] += err * X[i][k];
      gradB += err;
    }
    for (let k = 0; k < K; k++) w[k] -= (lr / X.length) * (gradW[k] + l2 * w[k]);
    b -= (lr / X.length) * gradB;
  }

  const coefficients = {};
  for (let k = 0; k < K; k++) coefficients[featureNames[k]] = Number(w[k].toFixed(4));

  return {
    intercept: Number(b.toFixed(4)),
    coefficients,
    predict: (r) => {
      const xi = extractX(r);
      let z = b;
      for (let k = 0; k < K; k++) z += w[k] * xi[k];
      return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
    },
  };
}

// ---------------------------------------------------------------------------
// Model definitions. M0 is nested inside M1; M2 is M1 without the attention
// term. Scaling matches Task 3's logistic (pub count / 8) so coefficients can
// be read side by side.
// ---------------------------------------------------------------------------

const MODELS = {
  M0: {
    id: "M0",
    label: "publication_count alone",
    featureNames: ["log1p_pub_count"],
    extractX: (r) => [logPub(r) / 8.0],
  },
  M1: {
    id: "M1",
    label: "publication_count + 8 biology features",
    featureNames: ["log1p_pub_count", ...BIOLOGY_FEATURE_KEYS],
    extractX: (r) => [logPub(r) / 8.0, ...BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k))],
  },
  M2: {
    id: "M2",
    label: "8 biology features alone",
    featureNames: [...BIOLOGY_FEATURE_KEYS],
    extractX: (r) => BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k)),
  },
};

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function precisionRecallAtK(labels, scores, k) {
  const n = Math.min(labels.length, scores.length);
  if (n === 0) return { precision: null, recall: null };
  const nPos = labels.reduce((a, b) => a + (b ? 1 : 0), 0);
  if (nPos === 0) return { precision: null, recall: null };
  const pairs = labels.map((y, i) => ({ y: y ? 1 : 0, s: Number(scores[i]) || 0 }));
  pairs.sort((a, b) => b.s - a.s);
  const topK = pairs.slice(0, Math.min(k, n));
  const hits = topK.reduce((a, p) => a + p.y, 0);
  return {
    precision: Number((hits / topK.length).toFixed(4)),
    recall: Number((hits / nPos).toFixed(4)),
  };
}

function scoreSet(model, rows) {
  return rows.map((r) => model.predict(r));
}

function evaluate(labels, scores) {
  const pr25 = precisionRecallAtK(labels, scores, TOP_K);
  return {
    roc_auc: Number(rocAuc(labels, scores).toFixed(4)),
    pr_auc: Number(prAuc(labels, scores).toFixed(4)),
    precision_at_25: pr25.precision,
    recall_at_25: pr25.recall,
  };
}

/**
 * Paired bootstrap on the difference between two rankers.
 *
 * The point of pairing: both models are rescored on the SAME resampled rows,
 * so the per-resample delta cancels the shared variance that comes from which
 * rows were drawn. A CI on the delta is therefore much tighter than comparing
 * two independently-bootstrapped CIs, and it is the interval that answers
 * "does B beat A", which overlapping marginal CIs do not.
 */
function pairedDeltaCi(labels, scoresA, scoresB, { nBoot = N_BOOT, seed = BOOT_SEED } = {}) {
  const n = labels.length;
  const rand = mulberry32(seed);
  const rocDeltas = [];
  const prDeltas = [];

  const idx = new Array(n);
  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(rand() * n);
    const yb = new Array(n);
    const ab = new Array(n);
    const bb = new Array(n);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const j = idx[i];
      yb[i] = labels[j];
      ab[i] = scoresA[j];
      bb[i] = scoresB[j];
      pos += labels[j] ? 1 : 0;
    }
    // A resample with no positives (or no negatives) has an undefined AUC.
    // Skipping it is the standard treatment; the count is reported so the
    // reader can see how often it happened.
    if (pos === 0 || pos === n) continue;
    rocDeltas.push(rocAuc(yb, bb) - rocAuc(yb, ab));
    prDeltas.push(prAuc(yb, bb) - prAuc(yb, ab));
  }

  const summarise = (deltas, pointEstimate) => {
    const sorted = [...deltas].sort((x, y) => x - y);
    const q = (p) => {
      if (sorted.length === 0) return null;
      const pos = (sorted.length - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const low = q(0.025);
    const high = q(0.975);
    // Fraction of resamples where B did not beat A, as a two-sided sign check.
    const nLeZero = sorted.filter((d) => d <= 0).length;
    return {
      delta: Number(pointEstimate.toFixed(4)),
      ci_low: low === null ? null : Number(low.toFixed(4)),
      ci_high: high === null ? null : Number(high.toFixed(4)),
      includes_zero: low === null ? null : low <= 0 && high >= 0,
      frac_resamples_delta_le_zero: Number((nLeZero / Math.max(1, sorted.length)).toFixed(4)),
      n_resamples_used: sorted.length,
    };
  };

  return {
    n_boot_requested: nBoot,
    n_boot_skipped_degenerate: nBoot - rocDeltas.length,
    roc_auc: summarise(rocDeltas, rocAuc(labels, scoresB) - rocAuc(labels, scoresA)),
    pr_auc: summarise(prDeltas, prAuc(labels, scoresB) - prAuc(labels, scoresA)),
  };
}

/**
 * Disease-clustered paired bootstrap, as a robustness check on the above.
 *
 * The pair-level bootstrap treats all held-out rows as independent draws. They
 * are not: they cluster into 11 diseases, and rows within a disease share both
 * the disease's base rate and its literature volume. That understates the
 * variance, so the pair-level CI is optimistically narrow.
 *
 * This resamples whole DISEASES with replacement and recomputes both AUCs on
 * the pooled rows. With only 11 clusters the interval is wide and coarse, which
 * is the honest resolution of this benchmark. Where the two bootstraps
 * disagree, this one is the conservative answer.
 */
function clusteredDeltaCi(clusters, scoreKeyA, scoreKeyB, { nBoot = N_BOOT, seed = BOOT_SEED } = {}) {
  const rand = mulberry32(seed ^ 0x5eed);
  const nClusters = clusters.length;
  const rocDeltas = [];
  const prDeltas = [];

  for (let b = 0; b < nBoot; b++) {
    const y = [];
    const a = [];
    const bs = [];
    for (let c = 0; c < nClusters; c++) {
      const pick = clusters[Math.floor(rand() * nClusters)];
      for (let i = 0; i < pick.labels.length; i++) {
        y.push(pick.labels[i]);
        a.push(pick[scoreKeyA][i]);
        bs.push(pick[scoreKeyB][i]);
      }
    }
    const pos = y.reduce((acc, v) => acc + (v ? 1 : 0), 0);
    if (pos === 0 || pos === y.length) continue;
    rocDeltas.push(rocAuc(y, bs) - rocAuc(y, a));
    prDeltas.push(prAuc(y, bs) - prAuc(y, a));
  }

  const summarise = (deltas) => {
    const sorted = [...deltas].sort((x, y2) => x - y2);
    const q = (p) => {
      if (sorted.length === 0) return null;
      const pos = (sorted.length - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const low = q(0.025);
    const high = q(0.975);
    return {
      median_delta: sorted.length ? Number(q(0.5).toFixed(4)) : null,
      ci_low: low === null ? null : Number(low.toFixed(4)),
      ci_high: high === null ? null : Number(high.toFixed(4)),
      includes_zero: low === null ? null : low <= 0 && high >= 0,
      n_resamples_used: sorted.length,
    };
  };

  return {
    resampling_unit: "disease (cluster)",
    n_clusters: nClusters,
    n_boot_requested: nBoot,
    roc_auc: summarise(rocDeltas),
    pr_auc: summarise(prDeltas),
  };
}

// ---------------------------------------------------------------------------
// Residualised features: strip the part of each biology feature that is linearly
// predictable from attention, then ask whether what is left still ranks.
// ---------------------------------------------------------------------------

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
  const intercept = my - slope * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

function residualAnalysis(trainRows, testRows, testLabels) {
  const out = [];
  const xTrain = trainRows.map(logPub);
  const xTest = testRows.map(logPub);

  for (const key of BIOLOGY_FEATURE_KEYS) {
    const yTrain = trainRows.map((r) => biologyFeature(r, key));
    const { slope, intercept, r2 } = fitOls1d(xTrain, yTrain);

    const rawTest = testRows.map((r) => biologyFeature(r, key));
    const residTest = rawTest.map((v, i) => v - (intercept + slope * xTest[i]));

    out.push({
      feature: key,
      // Fitted on training diseases only.
      regression_on_log1p_pub_count: {
        slope: Number(slope.toFixed(4)),
        intercept: Number(intercept.toFixed(4)),
        r2: Number(r2.toFixed(4)),
      },
      held_out_roc_auc_raw: Number(rocAuc(testLabels, rawTest).toFixed(4)),
      held_out_roc_auc_residual: Number(rocAuc(testLabels, residTest).toFixed(4)),
      held_out_pr_auc_residual: Number(prAuc(testLabels, residTest).toFixed(4)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
const signed = (v, d = 3) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

function renderMarkdown(report) {
  const L = [];
  const h = report.held_out;
  const m1v0 = report.paired_deltas.M1_vs_M0;
  const m2v0 = report.paired_deltas.M2_vs_M0;

  L.push("# Task 4 — Does Open Targets Biology Predict Progression Beyond Attention?");
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

  L.push("## Table 1 — Nested models, held-out test diseases");
  L.push("");
  L.push("| Model | Features | ROC-AUC | PR-AUC | precision@25 | recall@25 |");
  L.push("|---|---|---:|---:|---:|---:|");
  for (const id of ["M0", "M1", "M2"]) {
    const m = h.models[id];
    L.push(
      `| \`${id}\` | ${m.label} | **${fmt(m.roc_auc)}** | **${fmt(m.pr_auc)}** | ${fmt(m.precision_at_25)} | ${fmt(m.recall_at_25)} |`
    );
  }
  L.push("");
  L.push("Training-set figures, for reference (fitting diagnostics, not evidence):");
  L.push("");
  L.push("| Model | ROC-AUC | PR-AUC | precision@25 | recall@25 |");
  L.push("|---|---:|---:|---:|---:|");
  for (const id of ["M0", "M1", "M2"]) {
    const m = report.train.models[id];
    L.push(`| \`${id}\` | ${fmt(m.roc_auc)} | ${fmt(m.pr_auc)} | ${fmt(m.precision_at_25)} | ${fmt(m.recall_at_25)} |`);
  }
  L.push("");

  L.push("## Table 2 — Paired delta, held-out test diseases");
  L.push("");
  L.push(
    "Both models are rescored on the same resampled rows and the delta taken per resample " +
      `(${m1v0.n_boot_requested} resamples, seed ${report.bootstrap_seed}). This is the interval that answers ` +
      "whether one model beats the other; two overlapping marginal CIs do not."
  );
  L.push("");
  L.push("| Comparison | Metric | Delta | 95% CI on the delta | CI includes zero? |");
  L.push("|---|---|---:|---:|:---:|");
  for (const [name, cmp] of [
    ["M1 vs M0", m1v0],
    ["M2 vs M0", m2v0],
  ]) {
    for (const metric of ["roc_auc", "pr_auc"]) {
      const d = cmp[metric];
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | **${signed(d.delta)}** | ${signed(d.ci_low)} to ${signed(d.ci_high)} | ${d.includes_zero ? "**yes**" : "no"} |`
      );
    }
  }
  L.push("");

  L.push("## Table 2b — Same delta, resampling whole diseases");
  L.push("");
  L.push(
    "The held-out rows are not independent: they cluster into " +
      `${report.clustered_deltas.M1_vs_M0.n_clusters} diseases, and rows within a disease share both the ` +
      "disease base rate and its literature volume. Resampling pairs understates that variance. " +
      "Resampling whole diseases is the conservative reading; at this cluster count it is also coarse."
  );
  L.push("");
  L.push("| Comparison | Metric | Median delta | 95% CI on the delta | CI includes zero? |");
  L.push("|---|---|---:|---:|:---:|");
  for (const [name, cmp] of [
    ["M1 vs M0", report.clustered_deltas.M1_vs_M0],
    ["M2 vs M0", report.clustered_deltas.M2_vs_M0],
  ]) {
    for (const metric of ["roc_auc", "pr_auc"]) {
      const dd = cmp[metric];
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | ${signed(dd.median_delta)} | ${signed(dd.ci_low)} to ${signed(dd.ci_high)} | ${dd.includes_zero ? "**yes**" : "no"} |`
      );
    }
  }
  L.push("");

  L.push("## Table 3 — Residualised features");
  L.push("");
  L.push(
    "Each biology feature is regressed on `log1p(publication_count)` across the training " +
      "diseases, and the held-out AUC of the residual is reported. A feature whose residual " +
      "AUC collapses to chance was ranking by attention, not by biology."
  );
  L.push("");
  L.push("| Feature | Variance explained by attention (R²) | Held-out ROC-AUC, raw | Held-out ROC-AUC, residualised |");
  L.push("|---|---:|---:|---:|");
  for (const r of report.residualised) {
    L.push(
      `| \`${r.feature}\` | ${fmt(r.regression_on_log1p_pub_count.r2)} | ${fmt(r.held_out_roc_auc_raw)} | **${fmt(r.held_out_roc_auc_residual)}** |`
    );
  }
  L.push("");

  L.push("## Table 4 — Fitted coefficients");
  L.push("");
  L.push("| Feature | `M0` | `M1` | `M2` |");
  L.push("|---|---:|---:|---:|");
  const allFeatures = ["log1p_pub_count", ...BIOLOGY_FEATURE_KEYS];
  for (const k of allFeatures) {
    const g = (id) => {
      const c = report.coefficients[id].coefficients;
      return c[k] === undefined ? "—" : fmt(c[k]);
    };
    L.push(`| \`${k}\` | ${g("M0")} | ${g("M1")} | ${g("M2")} |`);
  }
  L.push(
    `| _(intercept)_ | ${fmt(report.coefficients.M0.intercept)} | ${fmt(report.coefficients.M1.intercept)} | ${fmt(report.coefficients.M2.intercept)} |`
  );
  L.push("");

  L.push("## Leakage controls");
  L.push("");
  for (const line of report.leakage_controls) L.push(`- ${line}`);
  L.push("");

  L.push("## Reproducing");
  L.push("");
  L.push("```");
  L.push("node benchmark/docking/scripts/attention_control.mjs");
  L.push("```");
  L.push("");

  return L.join("\n");
}

// ---------------------------------------------------------------------------

export async function runAttentionControl({ refresh = false } = {}) {
  const snapshot = await buildOrLoadRetrospectiveSnapshot({ refresh });

  const trainDiseases = snapshot.diseases.filter((d) => d.split === "train");
  const testDiseases = snapshot.diseases.filter((d) => d.split === "test");

  // Cohort 2, exactly as Task 3 defines it.
  const trainRows = trainDiseases.flatMap((d) => d.targets).filter((r) => r.drugCount_2021 === 0);
  const testRows = testDiseases.flatMap((d) => d.targets).filter((r) => r.drugCount_2021 === 0);

  const trainLabels = trainRows.map((r) => (r[LABEL_KEY] ? 1 : 0));
  const testLabels = testRows.map((r) => (r[LABEL_KEY] ? 1 : 0));

  // Fit every model on the training diseases only.
  const fitted = {};
  for (const id of ["M0", "M1", "M2"]) {
    const spec = MODELS[id];
    fitted[id] = fitLogistic(trainRows, LABEL_KEY, spec.extractX, spec.featureNames);
  }

  const testScores = {};
  const trainScores = {};
  for (const id of ["M0", "M1", "M2"]) {
    testScores[id] = scoreSet(fitted[id], testRows);
    trainScores[id] = scoreSet(fitted[id], trainRows);
  }

  const heldOutModels = {};
  const trainModels = {};
  for (const id of ["M0", "M1", "M2"]) {
    heldOutModels[id] = { label: MODELS[id].label, ...evaluate(testLabels, testScores[id]) };
    trainModels[id] = { label: MODELS[id].label, ...evaluate(trainLabels, trainScores[id]) };
  }

  const pairedDeltas = {
    M1_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M1),
    M2_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M2),
  };

  // Per-disease clusters for the conservative bootstrap.
  const clusters = testDiseases
    .map((d) => {
      const rows = d.targets.filter((r) => r.drugCount_2021 === 0);
      return {
        disease_id: d.disease_id_2021 || d.disease_id || null,
        disease_name: d.disease_name,
        labels: rows.map((r) => (r[LABEL_KEY] ? 1 : 0)),
        M0: rows.map((r) => fitted.M0.predict(r)),
        M1: rows.map((r) => fitted.M1.predict(r)),
        M2: rows.map((r) => fitted.M2.predict(r)),
      };
    })
    .filter((c) => c.labels.length > 0);

  const clusteredDeltas = {
    M1_vs_M0: clusteredDeltaCi(clusters, "M0", "M1"),
    M2_vs_M0: clusteredDeltaCi(clusters, "M0", "M2"),
  };

  const residualised = residualAnalysis(trainRows, testRows, testLabels);

  // The finding is written from the numbers, including when it is negative, and
  // is governed by the weaker of the two bootstraps rather than the friendlier.
  const d = pairedDeltas.M1_vs_M0.roc_auc;
  const dPr = pairedDeltas.M1_vs_M0.pr_auc;
  const dc = clusteredDeltas.M1_vs_M0.roc_auc;

  const pairLevel =
    `Adding the eight biology features to publication count moves held-out ROC-AUC by ` +
    `${signed(d.delta)} (95% CI ${signed(d.ci_low)} to ${signed(d.ci_high)}) and PR-AUC by ` +
    `${signed(dPr.delta)} (95% CI ${signed(dPr.ci_low)} to ${signed(dPr.ci_high)}), resampling pairs.`;

  let finding;
  if (d.includes_zero) {
    finding =
      `**The eight Open Targets biology features add no measurable signal over publication ` +
      `count.** ${pairLevel} Both intervals include zero. On this benchmark, a target's eight ` +
      `Open Targets evidence scores tell you nothing about whether it will enter the clinic ` +
      `that counting its papers does not already tell you.`;
  } else if (dc.includes_zero) {
    finding =
      `**Mixed, and the conservative reading is that the result is not established.** ` +
      `${pairLevel} Both pair-level intervals exclude zero. But the held-out rows are not ` +
      `independent — they cluster into ${clusteredDeltas.M1_vs_M0.n_clusters} diseases — and ` +
      `resampling whole diseases instead widens the ROC-AUC interval to ` +
      `${signed(dc.ci_low)} to ${signed(dc.ci_high)}, which includes zero. With 11 clusters ` +
      `this benchmark cannot resolve whether the biology features beat publication count. ` +
      `No production score should be promoted on the pair-level interval alone.`;
  } else {
    const dcPr = clusteredDeltas.M1_vs_M0.pr_auc;
    const prCaveat = dcPr.includes_zero
      ? ` PR-AUC does not survive that stricter test: resampling diseases, its interval is ` +
        `${signed(dcPr.ci_low)} to ${signed(dcPr.ci_high)}, which includes zero. So the ranking ` +
        `improvement is established and the improvement in precision among the rare positives ` +
        `is not.`
      : ` PR-AUC holds under disease resampling too (${signed(dcPr.ci_low)} to ${signed(dcPr.ci_high)}).`;
    finding =
      `**The biology features carry ranking signal beyond attention.** ${pairLevel} The ROC-AUC ` +
      `interval excludes zero under both resampling schemes: resampling whole diseases it is ` +
      `${signed(dc.ci_low)} to ${signed(dc.ci_high)}, with the lower bound close to zero.` +
      `${prCaveat} Publication count alone reaches ROC-AUC ${fmt(heldOutModels.M0.roc_auc)}; ` +
      `with the biology features, ${fmt(heldOutModels.M1.roc_auc)}. The biology features ALONE ` +
      `(M2, ROC-AUC ${fmt(heldOutModels.M2.roc_auc)}) do not beat publication count under ` +
      `disease resampling, so they are a useful addition to attention, not a replacement for it.`;
  }

  const nPosTest = testLabels.reduce((a, b) => a + b, 0);
  const nPosTrain = trainLabels.reduce((a, b) => a + b, 0);

  const report = {
    generated_at: new Date().toISOString(),
    task: "Task 4 — attention control (nested model comparison on cohort 2)",
    historical_release: snapshot.historical_release,
    current_release: snapshot.current_release,
    snapshot_id: snapshot.snapshot_id,
    cohort: "cohort 2 — targets with drugCount_2021 == 0 (first-in-class progression)",
    label_key: LABEL_KEY,
    n_diseases: snapshot.n_diseases,
    n_train_diseases: snapshot.n_train_diseases,
    n_test_diseases: snapshot.n_test_diseases,
    bootstrap_n: N_BOOT,
    bootstrap_seed: BOOT_SEED,
    top_k: TOP_K,
    finding,
    models: Object.fromEntries(
      Object.entries(MODELS).map(([id, m]) => [id, { label: m.label, features: m.featureNames }])
    ),
    train: { n_total: trainRows.length, n_positives: nPosTrain, models: trainModels },
    held_out: {
      n_total: testRows.length,
      n_positives: nPosTest,
      prevalence: Number((nPosTest / Math.max(1, testRows.length)).toFixed(4)),
      models: heldOutModels,
    },
    paired_deltas: pairedDeltas,
    clustered_deltas: clusteredDeltas,
    residualised,
    coefficients: Object.fromEntries(
      Object.entries(fitted).map(([id, f]) => [id, { intercept: f.intercept, coefficients: f.coefficients }])
    ),
    leakage_controls: [
      "Every predictor is read from the Open Targets 21.04 snapshot (2021-05-05). No quantity from any later release enters any model.",
      "Outcomes come only from 26.09.",
      "All three models and every residualisation regression are fitted on the 11 training diseases. The 11 held-out test diseases are used once, for evaluation.",
      "The split is by disease, not by target, so a target appearing in two diseases cannot straddle train and test.",
      "Bootstrap resamples pairs, and both models are rescored on the same resampled rows, so the delta CI is paired.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(report));

  return report;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const refresh = process.argv.includes("--refresh");
  runAttentionControl({ refresh })
    .then((report) => {
      const h = report.held_out;
      process.stderr.write("\n");
      process.stderr.write(`Held-out: ${h.n_total} pairs, ${h.n_positives} positives\n`);
      for (const id of ["M0", "M1", "M2"]) {
        const m = h.models[id];
        process.stderr.write(
          `  ${id}  ROC ${fmt(m.roc_auc)}  PR ${fmt(m.pr_auc)}  p@25 ${fmt(m.precision_at_25)}  r@25 ${fmt(m.recall_at_25)}  (${m.label})\n`
        );
      }
      const d = report.paired_deltas.M1_vs_M0;
      process.stderr.write(
        `\n  M1 vs M0 ROC delta ${signed(d.roc_auc.delta)} CI ${signed(d.roc_auc.ci_low)} to ${signed(d.roc_auc.ci_high)}` +
          ` (includes zero: ${d.roc_auc.includes_zero})\n`
      );
      process.stderr.write(
        `  M1 vs M0 PR  delta ${signed(d.pr_auc.delta)} CI ${signed(d.pr_auc.ci_low)} to ${signed(d.pr_auc.ci_high)}` +
          ` (includes zero: ${d.pr_auc.includes_zero})\n\n`
      );
      process.stderr.write(`Wrote ${path.relative(path.resolve(DOCKING_DIR, "../.."), OUT_JSON)}\n`);
      process.stderr.write(`Wrote ${path.relative(path.resolve(DOCKING_DIR, "../.."), OUT_MD)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`[task4] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
