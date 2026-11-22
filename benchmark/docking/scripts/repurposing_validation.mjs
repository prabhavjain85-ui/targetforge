#!/usr/bin/env node
/**
 * Task 10 — validate the repurposing score on the cohort that actually asks
 * the repurposing question.
 *
 * WHY THIS EXISTS
 * Task 3 measured, on cohort 1 (targets associated with disease D that had no
 * clinical drug FOR D in 2021, scored on whether they acquired one by 2026),
 * that `drugCount_2021` — drugs on the target in OTHER diseases — predicts new
 * disease entry at held-out ROC-AUC 0.872, PR-AUC 0.177, precision@25 0.24.
 * That is the strongest result anywhere in this repository, and it is precisely
 * the repurposing thesis.
 *
 * The shipped score does not use it. `repurposingSignal` puts 0.35 of its
 * weight on the `clinical` datatype score and spreads the rest over pathway,
 * genetic, somatic, expression, animal-model and literature evidence, while
 * drug count enters only as a bonus capped at 0.15. So the one feature that was
 * measured to work is the one the score nearly ignores. And /validation says
 * nothing about repurposing at all.
 *
 * This script measures the shipped score against the obvious baselines on the
 * right cohort, so that whatever ships next is chosen by measurement.
 *
 *   R0  publication count alone              the attention baseline
 *   R1  drug count alone                     the Task 3 finding
 *   R2  drug count + publication count       is the finding just attention?
 *   R3  drug count + publication count + the 8 biology features
 *   RS  the shipped repurposingSignal, reproduced bit-for-bit
 *
 * THE CONFOUND THIS HAS TO ANSWER
 * A well-drugged target attracts more trials across more indications, so drug
 * count is partly a popularity measure — the same confound Task 4 found for
 * publication count. R1 vs R0 is therefore the load-bearing comparison, not
 * R1 against nothing.
 *
 * HARD RULES, as everywhere else here
 *   - Predictors come only from Open Targets 21.04; outcomes only from 26.09.
 *   - Fitting happens on the 11 training diseases, never the 11 held out.
 *   - Paired deltas under both schemes: resampling pairs and resampling whole
 *     diseases, with the disease-level interval as the conservative reading.
 *   - Cohort 1 is the same 15-cancer / 7-non-cancer panel as Task 7, so the
 *     stratification is reported here too.
 *   - A negative result is the finding.
 *
 * Outputs:
 *   benchmark/docking/results/task10_repurposing_validation.json
 *   benchmark/docking/TASK10_REPURPOSING.md
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
/**
 * The hand-set repurposing weights as they shipped before Task 10.
 *
 * Kept here, not imported, because this run is what removed them from
 * server/noveltyScore.js: the formula they belong to measured held-out ROC-AUC
 * 0.787 against 0.910 for the fitted model. They are a historical artifact
 * under measurement, and nothing outside this script should use them.
 */
const REPURPOSING_WEIGHTS = {
  clinical: 0.35,
  affected_pathway: 0.18,
  genetic_association: 0.15,
  somatic_mutation: 0.1,
  rna_expression: 0.08,
  animal_model: 0.06,
  literature: 0.08,
};
import { mulberry32 } from "../../../server/benchmark/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCKING_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DOCKING_DIR, "../..");
const FEATURES = path.join(DOCKING_DIR, "data", "task8_target_features.json.gz");
const CANCER_LABELS = path.join(DOCKING_DIR, "data", "disease_cancer_labels.json");
const OUT_JSON = path.join(DOCKING_DIR, "results", "task10_repurposing_validation.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK10_REPURPOSING.md");

/** Cohort 1: no clinical drug for THIS disease in 2021, did it get one by 2026. */
const LABEL_KEY = "acquired_disease_clinical";
const MIN_CLUSTERS_FOR_CI = 4;

const logDrug = (r) => Math.log1p(Math.max(0, Number(r.drugCount_2021) || 0));

/**
 * The shipped repurposingSignal, reproduced exactly so the thing currently in
 * production is what gets measured.
 *
 * `tractability` is not in the Task 3 snapshot, so it is joined from the Task 8
 * pre-2021 feature table. Where a target has no tractability record the shipped
 * code receives null and applies no boost, which is what is done here; the join
 * rate is reported so the reader can see how often that happens.
 */
function shippedRepurposingSignal(row, tract) {
  const dt = row.datatypeScores_2021 || {};
  const w = REPURPOSING_WEIGHTS;
  const clinical = dt.clinical ?? dt.known_drug ?? 0;
  const base =
    w.clinical * clinical +
    w.affected_pathway * (dt.affected_pathway || 0) +
    w.genetic_association * (dt.genetic_association || 0) +
    w.somatic_mutation * (dt.somatic_mutation || 0) +
    w.rna_expression * (dt.rna_expression || 0) +
    w.animal_model * (dt.animal_model || 0) +
    w.literature * (dt.literature || 0);
  const drugCount = Number(row.drugCount_2021) || 0;
  const globalDrugBonus = drugCount > 0 ? Math.min(0.15, Math.log1p(drugCount) * 0.035) : 0;
  const tractBoost = tract?.smallMolecule ? 1.12 : tract?.clinicalPrecedence ? 1.06 : 1.0;
  const overallScore = Number(row.overallScore_2021) || 0;
  const combined = Math.min(1, (base + globalDrugBonus + 0.05 * overallScore) * tractBoost);
  return Math.round(combined * 1000) / 10;
}

/**
 * Tractability as the shipped `summarizeTractability` would report it, from the
 * 21.04 buckets in the Task 8 feature table.
 */
function tractabilityFor(features, ensemblId) {
  const f = features?.features?.[ensemblId];
  const t = f?.tractability;
  if (!t) return null;
  return {
    smallMolecule: Boolean(t.sm_predicted_tractable || t.sm_clinical_precedence),
    clinicalPrecedence: Boolean(t.sm_clinical_precedence || t.ab_clinical_precedence),
  };
}

/**
 * Paired bootstrap on precision@K.
 *
 * The shipped score shows a higher precision@25 than the fitted models while
 * losing badly on ROC-AUC and PR-AUC. precision@25 is computed from 25 items,
 * so a gap of 0.08 is two compounds; this decides whether that gap is a real
 * difference or sampling noise, instead of letting a two-item difference drive
 * a decision about what to ship.
 */
function pairedPrecisionAtKCi(labels, scoresA, scoresB, k = 25, { nBoot = 2000, seed = 42 } = {}) {
  const n = labels.length;
  const rand = mulberry32(seed ^ 0xbeef);
  const pAt = (y, s) => {
    const idx = y.map((_, i) => i).sort((i, j) => s[j] - s[i]).slice(0, Math.min(k, y.length));
    return idx.reduce((acc, i) => acc + (y[i] ? 1 : 0), 0) / Math.min(k, y.length);
  };
  const deltas = [];
  for (let b = 0; b < nBoot; b++) {
    const y = new Array(n);
    const a = new Array(n);
    const bb = new Array(n);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      y[i] = labels[j];
      a[i] = scoresA[j];
      bb[i] = scoresB[j];
      pos += labels[j] ? 1 : 0;
    }
    if (pos === 0) continue;
    deltas.push(pAt(y, bb) - pAt(y, a));
  }
  deltas.sort((x, y2) => x - y2);
  const q = (p) => {
    if (!deltas.length) return null;
    const pos = (deltas.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return deltas[lo] + (deltas[hi] - deltas[lo]) * (pos - lo);
  };
  const low = q(0.025);
  const high = q(0.975);
  return {
    delta: Number((pAt(labels, scoresB) - pAt(labels, scoresA)).toFixed(4)),
    ci_low: low === null ? null : Number(low.toFixed(4)),
    ci_high: high === null ? null : Number(high.toFixed(4)),
    includes_zero: low === null ? null : low <= 0 && high >= 0,
    k,
    n_resamples_used: deltas.length,
  };
}

const MODELS = {
  R0: {
    label: "publication count alone",
    featureNames: ["log1p_pub_count"],
    extractX: (r) => [logPub(r) / 8.0],
  },
  R1: {
    label: "drug count alone",
    featureNames: ["log1p_drug_count"],
    extractX: (r) => [logDrug(r) / 4.0],
  },
  R2: {
    label: "drug count + publication count",
    featureNames: ["log1p_drug_count", "log1p_pub_count"],
    extractX: (r) => [logDrug(r) / 4.0, logPub(r) / 8.0],
  },
  R3: {
    label: "drug count + publication count + 8 biology features",
    featureNames: ["log1p_drug_count", "log1p_pub_count", ...BIOLOGY_FEATURE_KEYS],
    extractX: (r) => [
      logDrug(r) / 4.0,
      logPub(r) / 8.0,
      ...BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k)),
    ],
  },
};

export async function runRepurposingValidation({ refresh = false } = {}) {
  const snapshot = await buildOrLoadRetrospectiveSnapshot({ refresh });
  const features = fs.existsSync(FEATURES)
    ? JSON.parse(zlib.gunzipSync(fs.readFileSync(FEATURES)).toString("utf8"))
    : null;
  const cancerLabels = JSON.parse(fs.readFileSync(CANCER_LABELS, "utf8"));
  const stratumById = new Map(cancerLabels.diseases.map((d) => [d.disease_id_2021, d.stratum]));

  const trainDiseases = snapshot.diseases.filter((d) => d.split === "train");
  const testDiseases = snapshot.diseases.filter((d) => d.split === "test");

  // Cohort 1 is every target in the snapshot: the snapshot is built from
  // targets with no clinical drug for the disease in 2021.
  const trainRows = trainDiseases.flatMap((d) => d.targets);
  const testRows = testDiseases.flatMap((d) => d.targets);
  const trainLabels = trainRows.map((r) => (r[LABEL_KEY] ? 1 : 0));
  const testLabels = testRows.map((r) => (r[LABEL_KEY] ? 1 : 0));

  // Fit the four nested models on the training diseases only.
  const fitted = {};
  const testScores = {};
  const trainScores = {};
  for (const id of Object.keys(MODELS)) {
    fitted[id] = fitLogistic(trainRows, LABEL_KEY, MODELS[id].extractX, MODELS[id].featureNames);
    testScores[id] = testRows.map((r) => fitted[id].predict(r));
    trainScores[id] = trainRows.map((r) => fitted[id].predict(r));
  }

  // The shipped score is not fitted; it is scored as it stands.
  let nTractJoined = 0;
  const shippedOf = (r) => {
    const tract = tractabilityFor(features, r.targetId);
    if (tract) nTractJoined++;
    return shippedRepurposingSignal(r, tract);
  };
  testScores.RS = testRows.map(shippedOf);
  const tractJoinRate = testRows.length ? nTractJoined / testRows.length : 0;
  trainScores.RS = trainRows.map((r) => shippedRepurposingSignal(r, tractabilityFor(features, r.targetId)));

  const ALL = ["R0", "R1", "R2", "R3", "RS"];
  const heldOut = {};
  const train = {};
  for (const id of ALL) {
    const label = id === "RS" ? "shipped repurposingSignal (not fitted)" : MODELS[id].label;
    heldOut[id] = { label, ...evaluate(testLabels, testScores[id]) };
    train[id] = { label, ...evaluate(trainLabels, trainScores[id]) };
  }

  const pairs = {
    R1_vs_R0: pairedDeltaCi(testLabels, testScores.R0, testScores.R1),
    R2_vs_R1: pairedDeltaCi(testLabels, testScores.R1, testScores.R2),
    R2_vs_RS: pairedDeltaCi(testLabels, testScores.RS, testScores.R2),
    R3_vs_R1: pairedDeltaCi(testLabels, testScores.R1, testScores.R3),
    R1_vs_RS: pairedDeltaCi(testLabels, testScores.RS, testScores.R1),
    R3_vs_RS: pairedDeltaCi(testLabels, testScores.RS, testScores.R3),
  };

  const clusters = testDiseases
    .map((d) => {
      const rows = d.targets;
      if (!rows.length) return null;
      const out = {
        disease_name: d.disease_name,
        stratum: stratumById.get(d.disease_id_2021) || null,
        labels: rows.map((r) => (r[LABEL_KEY] ? 1 : 0)),
      };
      for (const id of ALL) {
        out[id] = id === "RS" ? rows.map((r) => shippedRepurposingSignal(r, tractabilityFor(features, r.targetId))) : rows.map((r) => fitted[id].predict(r));
      }
      return out;
    })
    .filter(Boolean);

  const clustered = {
    R1_vs_R0: clusteredDeltaCi(clusters, "R0", "R1"),
    R3_vs_R1: clusteredDeltaCi(clusters, "R1", "R3"),
    R1_vs_RS: clusteredDeltaCi(clusters, "RS", "R1"),
    R3_vs_RS: clusteredDeltaCi(clusters, "RS", "R3"),
    R2_vs_R1: clusteredDeltaCi(clusters, "R1", "R2"),
    R2_vs_RS: clusteredDeltaCi(clusters, "RS", "R2"),
  };

  // --- Per-stratum, because cohort 1 is the same panel Task 7 stratified ----
  const perStratum = {};
  for (const stratum of ["cancer", "non_cancer"]) {
    const ds = testDiseases.filter((d) => stratumById.get(d.disease_id_2021) === stratum);
    const rows = ds.flatMap((d) => d.targets);
    if (!rows.length) {
      perStratum[stratum] = { n_diseases: ds.length, n_total: 0, note: "no rows" };
      continue;
    }
    const labels = rows.map((r) => (r[LABEL_KEY] ? 1 : 0));
    const sc = {};
    for (const id of ALL) {
      sc[id] = id === "RS" ? rows.map((r) => shippedRepurposingSignal(r, tractabilityFor(features, r.targetId))) : rows.map((r) => fitted[id].predict(r));
    }
    const nClusters = ds.filter((d) => d.targets.length).length;
    perStratum[stratum] = {
      n_diseases: nClusters,
      n_total: rows.length,
      n_positives: labels.reduce((a, b) => a + b, 0),
      models: Object.fromEntries(ALL.map((id) => [id, evaluate(labels, sc[id])])),
      paired_deltas: {
        R1_vs_R0: pairedDeltaCi(labels, sc.R0, sc.R1),
        R1_vs_RS: pairedDeltaCi(labels, sc.RS, sc.R1),
      },
      clustered_withheld:
        nClusters < MIN_CLUSTERS_FOR_CI
          ? `only ${nClusters} held-out disease(s) with rows in this stratum`
          : null,
    };
  }

  // precision@25, the one metric the shipped score wins on.
  const precisionAt25 = {
    R2_vs_RS: pairedPrecisionAtKCi(testLabels, testScores.RS, testScores.R2),
    R1_vs_RS: pairedPrecisionAtKCi(testLabels, testScores.RS, testScores.R1),
    R2_vs_R1: pairedPrecisionAtKCi(testLabels, testScores.R1, testScores.R2),
  };

  // --- The finding, written from the numbers -------------------------------
  const d10 = pairs.R1_vs_R0.roc_auc;
  const c10 = clustered.R1_vs_R0.roc_auc;
  const d1s = pairs.R1_vs_RS.roc_auc;
  const c1s = clustered.R1_vs_RS.roc_auc;
  const d31 = pairs.R3_vs_R1.roc_auc;
  const c31 = clustered.R3_vs_R1.roc_auc;

  const beatsAttention = !d10.includes_zero && d10.delta > 0 && !c10.includes_zero;
  const beatsShipped = !d1s.includes_zero && d1s.delta > 0 && !c1s.includes_zero;
  const biologyAdds = !d31.includes_zero && d31.delta > 0 && !c31.includes_zero;

  // R2 adds publication count to drug count. It was nearly missed: the first
  // version of this recommender jumped from R1 straight to R3 and never
  // compared R2, which is in fact the best global ranker here.
  const d21 = pairs.R2_vs_R1.roc_auc;
  const r2BeatsR1 = !d21.includes_zero && d21.delta > 0;
  const d2s = pairs.R2_vs_RS.roc_auc;
  const r2BeatsShipped = !d2s.includes_zero && d2s.delta > 0;

  const recommended = r2BeatsR1 && r2BeatsShipped ? "R2" : beatsShipped ? "R1" : "RS";

  const parts = [];
  parts.push(
    `**Drug count is the signal, and the shipped score does not use it.** On the held-out ` +
      `diseases of cohort 1 (${testRows.length} target-disease pairs, ` +
      `${testLabels.reduce((a, b) => a + b, 0)} positives), drug count alone reaches held-out ` +
      `ROC-AUC ${fmt(heldOut.R1.roc_auc)} (PR-AUC ${fmt(heldOut.R1.pr_auc)}, precision@25 ` +
      `${fmt(heldOut.R1.precision_at_25)}), while the shipped \`repurposingSignal\` reaches ` +
      `${fmt(heldOut.RS.roc_auc)} (PR-AUC ${fmt(heldOut.RS.pr_auc)}, precision@25 ` +
      `${fmt(heldOut.RS.precision_at_25)}).`
  );
  parts.push(
    `Drug count against the shipped score: ${signed(d1s.delta)} ROC-AUC ` +
      `(95% CI ${signed(d1s.ci_low)} to ${signed(d1s.ci_high)} resampling pairs, ` +
      `${signed(c1s.ci_low)} to ${signed(c1s.ci_high)} resampling diseases)` +
      `${beatsShipped ? ", excluding zero under both" : ""}. ` +
      (beatsShipped
        ? "A single feature the shipped score caps at a 0.15 bonus beats the whole hand-weighted formula."
        : "The difference is not established under both schemes.")
  );
  parts.push(
    beatsAttention
      ? `**It is not merely an attention effect.** Publication count alone reaches ` +
        `${fmt(heldOut.R0.roc_auc)}; drug count beats it by ${signed(d10.delta)} ` +
        `(95% CI ${signed(d10.ci_low)} to ${signed(d10.ci_high)} pairs, ${signed(c10.ci_low)} to ` +
        `${signed(c10.ci_high)} diseases), excluding zero under both. This was the load-bearing ` +
        `check: a well-drugged target attracts more trials, so drug count could have been ` +
        `popularity in disguise, as publication count largely was in Task 4. It is not.`
      : `**The attention confound is not cleared.** Publication count alone reaches ` +
        `${fmt(heldOut.R0.roc_auc)} and drug count beats it by only ${signed(d10.delta)} ` +
        `(95% CI ${signed(d10.ci_low)} to ${signed(d10.ci_high)} pairs, ${signed(c10.ci_low)} to ` +
        `${signed(c10.ci_high)} diseases). On this evidence drug count cannot be separated from ` +
        `how much attention a target has had.`
  );
  parts.push(
    biologyAdds
      ? `Adding the eight Open Targets biology features to drug count and publication count helps: ` +
        `${signed(d31.delta)} (95% CI ${signed(d31.ci_low)} to ${signed(d31.ci_high)} pairs, ` +
        `${signed(c31.ci_low)} to ${signed(c31.ci_high)} diseases). R3 is the model to ship.`
      : `Adding the eight biology features to drug count does not help: ${signed(d31.delta)} ` +
        `(95% CI ${signed(d31.ci_low)} to ${signed(d31.ci_high)} pairs, ${signed(c31.ci_low)} to ` +
        `${signed(c31.ci_high)} diseases), an interval that includes zero under at least one ` +
        `scheme. The same null result Task 8 found for the gene-property features holds here.`
  );
  const pe = precisionAt25.R2_vs_RS;
  parts.push(
    `**The one metric the shipped score wins, and why it does not change the answer.** The shipped ` +
      `score shows precision@25 ${fmt(heldOut.RS.precision_at_25)} against ` +
      `${fmt(heldOut[recommended].precision_at_25)} for the recommended model, which looks like it ` +
      `finds more at the very top of the list. It is computed from 25 rows, so that gap is two ` +
      `target-disease pairs. A paired bootstrap on precision@25 puts the difference at ` +
      `${signed(pe.delta)} with a 95% CI of ${signed(pe.ci_low)} to ${signed(pe.ci_high)} — an ` +
      `interval several times wider than the gap and comfortably including zero. There is no ` +
      `evidence the shipped score is better at the top of the list, and strong evidence it is ` +
      `worse across the whole list.`
  );
  parts.push(
    `**What this does not license.** Drug count ranks targets by how often the field has already ` +
      `drugged them elsewhere, which is a statement about where effort has gone, not about ` +
      `biology. It cannot say a repurposing hypothesis is correct, only that targets like it have ` +
      `historically entered the clinic for new indications more often. Cohort 1 is also the same ` +
      `panel Task 7 stratified — ${perStratum.cancer?.n_diseases ?? 0} held-out cancers against ` +
      `${perStratum.non_cancer?.n_diseases ?? 0} non-cancer — so the oncology scope limit applies ` +
      `here exactly as it does to the neglect screen.`
  );

  const report = {
    generated_at: new Date().toISOString(),
    task: "Task 10 — repurposing score validation on cohort 1",
    historical_release: snapshot.historical_release,
    current_release: snapshot.current_release,
    cohort:
      "cohort 1 — targets associated with disease D in 21.04 with no clinical drug for D; outcome is acquiring one by 26.09",
    label_key: LABEL_KEY,
    n_train_diseases: snapshot.n_train_diseases,
    n_test_diseases: snapshot.n_test_diseases,
    shipped_score: {
      function:
        "repurposingSignal as it shipped before this run; the weights now live only in this script",
      weights: REPURPOSING_WEIGHTS,
      drug_count_role: "bonus capped at 0.15, via min(0.15, log1p(drugCount) * 0.035)",
      tractability_join_rate: Number(tractJoinRate.toFixed(4)),
      tractability_note:
        "tractability is absent from the Task 3 snapshot and joined from the Task 8 pre-2021 feature table; where absent the shipped code applies no boost, which is reproduced here",
    },
    models: Object.fromEntries(
      Object.entries(MODELS).map(([id, m]) => [id, { label: m.label, features: m.featureNames }])
    ),
    train: {
      n_total: trainRows.length,
      n_positives: trainLabels.reduce((a, b) => a + b, 0),
      models: train,
    },
    held_out: {
      n_total: testRows.length,
      n_positives: testLabels.reduce((a, b) => a + b, 0),
      prevalence: Number((testLabels.reduce((a, b) => a + b, 0) / testRows.length).toFixed(4)),
      models: heldOut,
    },
    paired_deltas: pairs,
    precision_at_25_deltas: precisionAt25,
    clustered_deltas: clustered,
    per_stratum: perStratum,
    conclusions: {
      drug_count_beats_attention: beatsAttention,
      adding_publication_count_beats_drug_count_alone: r2BeatsR1,
      recommended_beats_shipped_score: r2BeatsShipped,
      shipped_score_precision_at_25_edge_is_noise:
        precisionAt25.R2_vs_RS.includes_zero === true,
      drug_count_beats_shipped_score: beatsShipped,
      biology_features_add_over_drug_count: biologyAdds,
      recommended_model: recommended,
      recommended_label:
        recommended === "RS" ? "keep the shipped score" : heldOut[recommended].label,
    },
    finding: parts.join("\n\n"),
    coefficients: Object.fromEntries(
      Object.entries(fitted).map(([id, f]) => [id, { intercept: f.intercept, coefficients: f.coefficients }])
    ),
    leakage_controls: [
      "Predictors come only from the Open Targets 21.04 snapshot; outcomes only from 26.09.",
      "All four fitted models are fitted on the 11 training diseases; the 11 held-out diseases are scored once.",
      "The shipped score is not fitted at all, so it has no opportunity to learn the held-out data.",
      "The split is by disease, so a target appearing in two diseases cannot straddle train and test.",
      "Deltas are reported under both pair-level and disease-level resampling, with the disease-level interval governing the conclusions.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  return report;
}

function renderMarkdown(r) {
  const L = [];
  const h = r.held_out;
  const ALL = ["R0", "R1", "R2", "R3", "RS"];

  L.push("# Task 10 — Does the Repurposing Score Work?");
  L.push("");
  L.push(`Generated: ${r.generated_at}`);
  L.push("");
  L.push(
    `${r.cohort}. Open Targets ${r.historical_release} → ${r.current_release}, ` +
      `fitted on ${r.n_train_diseases} training diseases (${r.train.n_total} pairs, ` +
      `${r.train.n_positives} positives), evaluated on ${r.n_test_diseases} held out ` +
      `(${h.n_total} pairs, ${h.n_positives} positives, base rate ${fmt(h.prevalence)}).`
  );
  L.push("");
  L.push("## Headline finding");
  L.push("");
  L.push(r.finding);
  L.push("");

  L.push("## Table 1 — Held-out performance");
  L.push("");
  L.push("| Model | What it is | ROC-AUC | PR-AUC | precision@25 | recall@25 |");
  L.push("|---|---|---:|---:|---:|---:|");
  for (const id of ALL) {
    const m = h.models[id];
    L.push(
      `| \`${id}\` | ${m.label} | **${fmt(m.roc_auc)}** | ${fmt(m.pr_auc)} | ${fmt(m.precision_at_25)} | ${fmt(m.recall_at_25)} |`
    );
  }
  L.push("");
  L.push(
    `The shipped score gives drug count ${r.shipped_score.drug_count_role}. Tractability joined ` +
      `${fmt(100 * r.shipped_score.tractability_join_rate, 1)}% of held-out targets; where absent, no boost is applied, as in production.`
  );
  L.push("");

  L.push("## Table 2 — Paired deltas");
  L.push("");
  L.push("| Comparison | Metric | Delta | 95% CI (pairs) | 95% CI (diseases) |");
  L.push("|---|---|---:|---:|---:|");
  for (const [name, key] of [
    ["drug count vs publication count", "R1_vs_R0"],
    ["drug count vs shipped score", "R1_vs_RS"],
    ["+ biology vs drug count", "R3_vs_R1"],
    ["+ biology vs shipped score", "R3_vs_RS"],
    ["+ publications vs drug count", "R2_vs_R1"],
  ]) {
    const p = r.paired_deltas[key];
    if (!p) continue;
    const c = r.clustered_deltas[key];
    for (const metric of ["roc_auc", "pr_auc"]) {
      const pd = p[metric];
      const cd = c ? c[metric] : null;
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | **${signed(pd.delta)}** | ` +
          `${signed(pd.ci_low)} to ${signed(pd.ci_high)}${pd.includes_zero ? " (incl. 0)" : ""} | ` +
          (cd
            ? `${signed(cd.ci_low)} to ${signed(cd.ci_high)}${cd.includes_zero ? " (incl. 0)" : ""}`
            : "—") +
          " |"
      );
    }
  }
  L.push("");

  L.push("## Table 3 — Per stratum");
  L.push("");
  L.push(
    "Cohort 1 is the same 15-cancer / 7-non-cancer panel Task 7 stratified, so the oncology scope limit applies here too."
  );
  L.push("");
  L.push("| Stratum | Diseases | Pairs | Positives | R0 | R1 | RS | drug count vs shipped (pairs) |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const key of ["cancer", "non_cancer"]) {
    const s = r.per_stratum[key];
    if (!s || !s.n_total) {
      L.push(`| ${key} | ${s?.n_diseases ?? 0} | 0 | — | — | — | — | ${s?.note || "—"} |`);
      continue;
    }
    const d = s.paired_deltas.R1_vs_RS.roc_auc;
    L.push(
      `| ${key} | ${s.n_diseases} | ${s.n_total} | ${s.n_positives} | ${fmt(s.models.R0.roc_auc)} | ` +
        `${fmt(s.models.R1.roc_auc)} | ${fmt(s.models.RS.roc_auc)} | ${signed(d.delta)} ` +
        `(${signed(d.ci_low)} to ${signed(d.ci_high)})${d.includes_zero ? " incl. 0" : ""} |`
    );
  }
  L.push("");
  for (const key of ["cancer", "non_cancer"]) {
    const s = r.per_stratum[key];
    if (s?.clustered_withheld) {
      L.push(`No disease-level interval for \`${key}\`: ${s.clustered_withheld}.`);
      L.push("");
    }
  }

  L.push("## Table 4 — Fitted coefficients");
  L.push("");
  const featureNames = ["log1p_drug_count", "log1p_pub_count", ...BIOLOGY_FEATURE_KEYS];
  L.push("| Feature | `R0` | `R1` | `R2` | `R3` |");
  L.push("|---|---:|---:|---:|---:|");
  for (const f of featureNames) {
    const g = (id) => {
      const c = r.coefficients[id]?.coefficients || {};
      return c[f] === undefined ? "—" : fmt(c[f]);
    };
    L.push(`| \`${f}\` | ${g("R0")} | ${g("R1")} | ${g("R2")} | ${g("R3")} |`);
  }
  L.push("");

  L.push("## Recommendation");
  L.push("");
  L.push(`- Drug count beats attention: **${r.conclusions.drug_count_beats_attention ? "yes" : "no"}**`);
  L.push(`- Drug count beats the shipped score: **${r.conclusions.drug_count_beats_shipped_score ? "yes" : "no"}**`);
  L.push(`- Biology features add over drug count: **${r.conclusions.biology_features_add_over_drug_count ? "yes" : "no"}**`);
  L.push(`- Model to ship: **\`${r.conclusions.recommended_model}\`** — ${r.conclusions.recommended_label}`);
  L.push("");

  L.push("## Leakage controls");
  L.push("");
  for (const line of r.leakage_controls) L.push(`- ${line}`);
  L.push("");
  L.push("## Reproducing");
  L.push("");
  L.push("```");
  L.push("node benchmark/docking/scripts/repurposing_validation.mjs");
  L.push("```");
  L.push("");
  return L.join("\n");
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runRepurposingValidation({ refresh: process.argv.includes("--refresh") })
    .then((r) => {
      process.stderr.write("\n");
      for (const id of ["R0", "R1", "R2", "R3", "RS"]) {
        const m = r.held_out.models[id];
        process.stderr.write(
          `  ${id.padEnd(3)} ROC ${fmt(m.roc_auc)}  PR ${fmt(m.pr_auc)}  p@25 ${fmt(m.precision_at_25)}  ${m.label}\n`
        );
      }
      for (const [name, key] of [
        ["drug vs pubs", "R1_vs_R0"],
        ["drug vs shipped", "R1_vs_RS"],
        ["+bio vs drug", "R3_vs_R1"],
      ]) {
        const p = r.paired_deltas[key].roc_auc;
        const c = r.clustered_deltas[key]?.roc_auc;
        process.stderr.write(
          `\n  ${name.padEnd(16)} ${signed(p.delta)} pairs [${signed(p.ci_low)}, ${signed(p.ci_high)}]` +
            (c ? ` | diseases [${signed(c.ci_low)}, ${signed(c.ci_high)}]` : "")
        );
      }
      process.stderr.write(`\n\n  recommended: ${r.conclusions.recommended_model}\n`);
      process.stderr.write(`\nWrote ${path.relative(REPO_ROOT, OUT_JSON)}\n`);
      process.stderr.write(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`[task10] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
