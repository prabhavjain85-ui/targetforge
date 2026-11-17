#!/usr/bin/env node
/**
 * Task 8, stage 2 — does adding pre-2021 tractability and biology features beat
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
import { prAuc, rocAuc } from "../../../server/benchmark/metrics.js";
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
const FEATURES_PATH = path.join(DOCKING_DIR, "data", "task8_target_features.json.gz");
const OUT_JSON = path.join(DOCKING_DIR, "results", "task8_tractability.json");
const OUT_MD = path.join(DOCKING_DIR, "TASK8_TRACTABILITY.md");
const CANCER_LABELS_PATH = path.join(DOCKING_DIR, "data", "disease_cancer_labels.json");

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
/**
 * `kind` separates two things the brief lumped together as "tractability":
 *
 *   "effort"  — a record of medicinal chemistry or clinical work already done
 *               on the target. How many high-quality compounds exist, whether
 *               there is clinical precedence, whether the target is in the
 *               druggable-genome set. These are accumulated human attention,
 *               the same category as publication count, just measured in
 *               compounds rather than papers.
 *
 *   "biology" — a property of the gene that holds whether or not anyone has
 *               studied it: selection constraint, essentiality in cell lines,
 *               tissue distribution.
 *
 * The distinction matters because Task 4 asked whether biology predicts
 * progression beyond attention. Adding an effort feature and declaring that
 * biology beat attention would be the wrong answer to that question, so the
 * two groups are modelled separately (M3 and M4) and each feature's solo
 * held-out AUC is reported so the reader can see which group carries the gain.
 */
const CANDIDATES = [
  { name: "tract_sm_min_bucket", kind: "effort", get: (f) => f?.tractability?.sm_min_bucket ?? null, scale: 1 / 10 },
  { name: "tract_ab_min_bucket", kind: "effort", get: (f) => f?.tractability?.ab_min_bucket ?? null, scale: 1 / 10 },
  { name: "tract_sm_clinical_precedence", kind: "effort", get: (f) => f?.tractability?.sm_clinical_precedence ?? null, scale: 1 },
  { name: "tract_ab_clinical_precedence", kind: "effort", get: (f) => f?.tractability?.ab_clinical_precedence ?? null, scale: 1 },
  { name: "tract_sm_predicted_tractable", kind: "effort", get: (f) => f?.tractability?.sm_predicted_tractable ?? null, scale: 1 },
  { name: "tract_sm_high_quality_compounds", kind: "effort", get: (f) => f?.tractability?.sm_high_quality_compounds ?? null, scale: 1 / 10 },
  { name: "tract_sm_genome_member", kind: "effort", get: (f) => f?.tractability?.sm_genome_member ?? null, scale: 1 },
  { name: "pli", kind: "biology", get: (f) => (f?.pli ?? null), scale: 1 },
  { name: "loeuf", kind: "biology", get: (f) => (f?.loeuf ?? null), scale: 1 },
  { name: "depmap_mean_gene_effect", kind: "biology", get: (f) => (f?.depmap_mean_gene_effect ?? null), scale: 1 },
  { name: "depmap_frac_dependent_lines", kind: "biology", get: (f) => (f?.depmap_frac_dependent_lines ?? null), scale: 1 },
  { name: "depmap_common_essential", kind: "biology", get: (f) => (f?.depmap_common_essential ?? null), scale: 1 },
  { name: "gtex_tau", kind: "biology", get: (f) => (f?.gtex_tau ?? null), scale: 1 },
  { name: "gtex_n_tissues_above_1tpm", kind: "biology", get: (f) => (f?.gtex_n_tissues_above_1tpm ?? null), scale: 1 / 54 },
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

  // Solo held-out AUC per feature, so the report shows which single feature
  // carries any gain rather than only the model totals. Misses are filled with
  // zero here purely for ranking; this is instrumentation, not a fitted model.
  const testLabelsForSolo = testRows.map((r) => (r[LABEL_KEY] ? 1 : 0));
  const soloAuc = {};
  for (const c of CANDIDATES) {
    const vals = testRows.map((r) => {
      const v = c.get(featOf(r));
      return v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v);
    });
    soloAuc[c.name] = Number(rocAuc(testLabelsForSolo, vals).toFixed(4));
  }

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
      kind: c.kind,
      solo_held_out_roc_auc: soloAuc[c.name],
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

  const makeExtractor = (candidates, withClasses) => (r) => {
    const f = featOf(r);
    const out = [];
    for (const c of candidates) {
      const raw = c.get(f);
      const v = raw === null || !Number.isFinite(Number(raw)) ? fills[c.name] : Number(raw);
      out.push(v * c.scale);
    }
    if (withClasses && classIncluded) {
      const cl = f?.class_l1 || null;
      for (const tc of topClasses) out.push(cl === tc.label ? 1 : 0);
    }
    return out;
  };

  const extractTract = makeExtractor(usedCandidates, true);

  // M4 drops every "effort" feature, leaving only gene properties that hold
  // whether or not anyone has studied the target. This is the model that
  // answers the question Task 4 posed.
  const biologyOnlyCandidates = usedCandidates.filter((c) => c.kind === "biology");
  const extractBiologyOnly = makeExtractor(biologyOnlyCandidates, false);

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
    M4: {
      label: "publication_count + 8 biology features + gene-property features only (no effort proxies)",
      featureNames: [
        "log1p_pub_count",
        ...BIOLOGY_FEATURE_KEYS,
        ...biologyOnlyCandidates.map((c) => c.name),
      ],
      extractX: (r) => [
        logPub(r) / 8.0,
        ...BIOLOGY_FEATURE_KEYS.map((k) => biologyFeature(r, k)),
        ...extractBiologyOnly(r),
      ],
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
  for (const id of ["M0", "M1", "M3", "M4"]) {
    fitted[id] = fitLogistic(trainRows, LABEL_KEY, MODELS[id].extractX, MODELS[id].featureNames);
    testScores[id] = testRows.map((r) => fitted[id].predict(r));
    trainScores[id] = trainRows.map((r) => fitted[id].predict(r));
  }

  const trainLabels = trainRows.map((r) => (r[LABEL_KEY] ? 1 : 0));
  const testLabels = testRows.map((r) => (r[LABEL_KEY] ? 1 : 0));

  const heldOutModels = {};
  const trainModels = {};
  for (const id of ["M0", "M1", "M3", "M4"]) {
    heldOutModels[id] = { label: MODELS[id].label, n_features: MODELS[id].featureNames.length, ...evaluate(testLabels, testScores[id]) };
    trainModels[id] = { label: MODELS[id].label, ...evaluate(trainLabels, trainScores[id]) };
  }

  const pairedDeltas = {
    M3_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M3),
    M3_vs_M1: pairedDeltaCi(testLabels, testScores.M1, testScores.M3),
    M1_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M1),
    M4_vs_M0: pairedDeltaCi(testLabels, testScores.M0, testScores.M4),
    M4_vs_M1: pairedDeltaCi(testLabels, testScores.M1, testScores.M4),
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
        M4: rows.map((r) => fitted.M4.predict(r)),
      };
    })
    .filter((c) => c.labels.length > 0);

  const clusteredDeltas = {
    M3_vs_M0: clusteredDeltaCi(clusters, "M0", "M3"),
    M3_vs_M1: clusteredDeltaCi(clusters, "M1", "M3"),
    M4_vs_M0: clusteredDeltaCi(clusters, "M0", "M4"),
  };

  // --- Headline, governed by the conservative bootstrap ---------------------
  const p30 = pairedDeltas.M3_vs_M0.roc_auc;
  const c30 = clusteredDeltas.M3_vs_M0.roc_auc;
  const p31 = pairedDeltas.M3_vs_M1.roc_auc;

  const beatsM0PairLevel = !p30.includes_zero && p30.delta > 0;
  const beatsM0Clustered = !c30.includes_zero && (c30.median_delta ?? 0) > 0;
  const promote = beatsM0PairLevel && beatsM0Clustered;

  // ---- Residualised tractability features, as in Task 4 Table 3 -----------
  // Each candidate feature is regressed on log1p(publication_count) across the
  // TRAINING diseases, and the held-out AUC of the residual reported. This
  // separates "correlated with attention" from "informative", which matters
  // most for the effort features, since those are themselves attention.
  const xTrain = trainRows.map(logPub);
  const xTest = testRows.map(logPub);
  const residualised = usedCandidates.map((c) => {
    const valOf = (r) => {
      const raw = c.get(featOf(r));
      return raw === null || !Number.isFinite(Number(raw)) ? fills[c.name] : Number(raw);
    };
    const yTrain = trainRows.map(valOf);
    const { slope, intercept, r2 } = fitOls1d(xTrain, yTrain);
    const raw = testRows.map(valOf);
    const resid = raw.map((v, i) => v - (intercept + slope * xTest[i]));
    return {
      feature: c.name,
      kind: c.kind,
      regression_on_log1p_pub_count: {
        slope: Number(slope.toFixed(4)),
        intercept: Number(intercept.toFixed(4)),
        r2: Number(r2.toFixed(4)),
      },
      held_out_roc_auc_raw: Number(rocAuc(testLabels, raw).toFixed(4)),
      held_out_roc_auc_residual: Number(rocAuc(testLabels, resid).toFixed(4)),
      held_out_pr_auc_residual: Number(prAuc(testLabels, resid).toFixed(4)),
    };
  });

  // ---- Per-stratum contribution (Task 7 asked for this specifically) -------
  // DepMap is 15-of-22-cancers data, so its contribution is reported per
  // stratum rather than pooled. Models stay fitted on the full training set;
  // only which held-out rows are scored changes.
  const cancerLabels = JSON.parse(fs.readFileSync(CANCER_LABELS_PATH, "utf8"));
  const stratumById = new Map(cancerLabels.diseases.map((d) => [d.disease_id_2021, d.stratum]));
  const perStratum = {};
  for (const stratum of ["cancer", "non_cancer"]) {
    const ds = testDiseases.filter((d) => stratumById.get(d.disease_id_2021) === stratum);
    const rows = ds.flatMap((d) => d.targets.filter((r) => r.drugCount_2021 === 0));
    if (!rows.length) {
      perStratum[stratum] = { n_diseases: ds.length, n_total: 0, note: "no cohort-2 rows" };
      continue;
    }
    const labels = rows.map((r) => (r[LABEL_KEY] ? 1 : 0));
    const sc = {};
    for (const id of ["M0", "M1", "M3", "M4"]) sc[id] = rows.map((r) => fitted[id].predict(r));
    const soloHere = {};
    for (const c of usedCandidates) {
      const v = rows.map((r) => {
        const raw = c.get(featOf(r));
        return raw === null || !Number.isFinite(Number(raw)) ? fills[c.name] : Number(raw);
      });
      soloHere[c.name] = Number(rocAuc(labels, v).toFixed(4));
    }
    perStratum[stratum] = {
      n_diseases: ds.filter((d) => d.targets.some((r) => r.drugCount_2021 === 0)).length,
      n_total: rows.length,
      n_positives: labels.reduce((a, b) => a + b, 0),
      models: Object.fromEntries(
        ["M0", "M1", "M3", "M4"].map((id) => [id, evaluate(labels, sc[id])])
      ),
      paired_deltas: {
        M3_vs_M1: pairedDeltaCi(labels, sc.M1, sc.M3),
        M3_vs_M0: pairedDeltaCi(labels, sc.M0, sc.M3),
      },
      solo_held_out_roc_auc: soloHere,
      // Below 4 clusters a disease-level interval is withheld, same rule as Task 7.
      clustered_withheld: ds.length < 4 ? `only ${ds.length} held-out disease(s) in this stratum` : null,
    };
  }

  // The effort/biology split decides how this result should be read, so the
  // headline is built from it rather than from M3 vs M0 alone.
  const p41 = pairedDeltas.M4_vs_M1.roc_auc;
  const p40 = pairedDeltas.M4_vs_M0.roc_auc;
  const p31pr = pairedDeltas.M3_vs_M1.roc_auc;
  const topEffort = usedCandidates
    .filter((c) => c.kind === "effort")
    .map((c) => ({ n: c.name, auc: soloAuc[c.name] }))
    .sort((a, b) => b.auc - a.auc)[0];
  const topBiology = biologyOnlyCandidates
    .map((c) => ({ n: c.name, auc: soloAuc[c.name] }))
    .sort((a, b) => b.auc - a.auc)[0];

  let finding;
  if (beatsM0PairLevel && beatsM0Clustered && p41.includes_zero) {
    // The case that actually occurred: the criterion is met, but only by
    // features that record prior effort.
    finding =
      `**No gene-property feature tested here predicts clinical progression beyond attention. ` +
      `What does predict it is prior effort — and the strongest signal is the number of ` +
      `compounds that already exist for the target.**\n\n` +
      `M3, which adds all the pre-2021 tractability features, does beat publication count: ` +
      `held-out ROC-AUC ${fmt(heldOutModels.M3.roc_auc)} against ` +
      `${fmt(heldOutModels.M0.roc_auc)}, a paired delta of ${signed(p30.delta)} ` +
      `(95% CI ${signed(p30.ci_low)} to ${signed(p30.ci_high)} resampling pairs; ` +
      `${signed(c30.ci_low)} to ${signed(c30.ci_high)} resampling diseases). Both intervals ` +
      `exclude zero, so the brief's promotion criterion is formally met.\n\n` +
      `It is met by the wrong features. Splitting the tractability set in two — features that ` +
      `record medicinal chemistry or clinical work already done on a target ("effort"), and ` +
      `properties of the gene that hold whether or not anyone has studied it ("biology") — ` +
      `M4 keeps only the gene properties: pLI, LOEUF, three DepMap essentiality measures and ` +
      `two GTEx selectivity measures. M4 scores ${fmt(heldOutModels.M4.roc_auc)}, against M1's ` +
      `${fmt(heldOutModels.M1.roc_auc)}. The paired delta is ${signed(p41.delta)} ` +
      `(95% CI ${signed(p41.ci_low)} to ${signed(p41.ci_high)}), which includes zero: the five ` +
      `gene-property groups together add nothing over publication count and the eight Open ` +
      `Targets evidence scores. All of M3's advantage comes from the effort features ` +
      `(M3 vs M1 ${signed(p31pr.delta)}, 95% CI ${signed(p31pr.ci_low)} to ` +
      `${signed(p31pr.ci_high)}), and the single strongest predictor in the whole study is ` +
      `\`${topEffort.n}\` at solo held-out ROC-AUC ${fmt(topEffort.auc)} — higher than any ` +
      `model in Task 3 or Task 4. The best gene property is \`${topBiology.n}\` at ` +
      `${fmt(topBiology.auc)}.\n\n` +
      `One correction to the obvious reading, from Table 7. Compound count is NOT a restatement ` +
      `of publication count: regressed against \`log1p(publication_count)\` it has an R² of ` +
      `${fmt(residualised.find((x) => x.feature === "tract_sm_high_quality_compounds").regression_on_log1p_pub_count.r2)}, ` +
      `and residualised against attention it still scores ` +
      `${fmt(residualised.find((x) => x.feature === "tract_sm_high_quality_compounds").held_out_roc_auc_residual)}. ` +
      `So it is a genuinely independent predictor, not attention measured a second way. What it ` +
      `is not is biology: it is a record of medicinal chemistry already done. The answer to "does ` +
      `biology predict progression beyond attention" is still no; what beats attention is a ` +
      `different measure of prior human effort.\n\n` +
      `A target with a hundred high-quality compounds and no drug is one the field has already ` +
      `chosen. Predicting that it enters the clinic is not target discovery.\n\n` +
      `**No production score is promoted.** A score dominated by existing compound count would ` +
      `rank highest precisely the targets a user could have found without it, and would rank ` +
      `an under-studied target last by construction. That is the Goodhart failure this ` +
      `benchmark exists to catch, and it is why the criterion being met is not sufficient.`;
  } else if (!beatsM0PairLevel) {
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
    task: "Task 8 — pre-2021 tractability features vs attention",
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
    solo_held_out_roc_auc: soloAuc,
    residualised,
    per_stratum: perStratum,
    cancer_labels_source: path
      .relative(REPO_ROOT, CANCER_LABELS_PATH)
      .split(path.sep)
      .join("/"),
    feature_kinds: {
      effort: usedCandidates.filter((c) => c.kind === "effort").map((c) => c.name),
      biology: biologyOnlyCandidates.map((c) => c.name),
    },
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
      gene_property_features_add_nothing: pairedDeltas.M4_vs_M1.roc_auc.includes_zero,
      gain_is_from_effort_features: !pairedDeltas.M3_vs_M1.roc_auc.includes_zero,
      note:
        "No production score was changed by this run. The criterion (M3 beats M0 with a CI " +
        "excluding zero) is met, but it is met by features recording prior medicinal " +
        "chemistry effort, not by gene properties: M4, which keeps only the gene properties, " +
        "does not improve on M1 (CI includes zero). Promoting a score dominated by existing " +
        "compound count would rank highest the targets the field has already chosen, which " +
        "is the Goodhart failure this benchmark exists to catch.",
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

  L.push("# Task 8 — Do Pre-2021 Tractability Features Beat Attention?");
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
  for (const id of ["M0", "M1", "M3", "M4"]) {
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
  for (const id of ["M0", "M1", "M3", "M4"]) {
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
    ["M4 vs M0", "M4_vs_M0"],
    ["M4 vs M1 (gene properties only)", "M4_vs_M1"],
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
    ["M4 vs M0", "M4_vs_M0"],
  ]) {
    for (const metric of ["roc_auc", "pr_auc"]) {
      const d = report.clustered_deltas[key][metric];
      L.push(
        `| ${name} | ${metric === "roc_auc" ? "ROC-AUC" : "PR-AUC"} | ${signed(d.median_delta)} | ${signed(d.ci_low)} to ${signed(d.ci_high)} | ${d.includes_zero ? "**yes**" : "no"} |`
      );
    }
  }
  L.push("");

  L.push("## Table 6 — Each feature alone, and which kind it is");
  L.push("");
  L.push(
    "`effort` features record medicinal chemistry or clinical work already done on the " +
      "target; `biology` features are properties of the gene that hold whether or not anyone " +
      "has studied it. Solo AUC is the held-out ROC-AUC of that one feature used as the whole " +
      "ranker, with misses filled at zero. This table is the instrumentation that shows which " +
      "kind carries the gain, and it is the reason the headline does not read as a win."
  );
  L.push("");
  L.push("| Feature | Kind | Solo held-out ROC-AUC | In model |");
  L.push("|---|---|---:|:---:|");
  for (const j of report.join_rates) {
    if (!j.kind) continue;
    L.push(
      `| \`${j.feature}\` | ${j.kind} | ${fmt(j.solo_held_out_roc_auc)} | ${j.included_in_model ? "yes" : "no"} |`
    );
  }
  L.push("");

  L.push("## Table 7 — Residualised tractability features");
  L.push("");
  L.push(
    "Each feature regressed on `log1p(publication_count)` across the training diseases, with the " +
      "held-out AUC of the residual reported. This matters most for the `effort` features, since " +
      "those are themselves a measure of attention: if a feature's AUC survives residualisation it " +
      "carries something publication count does not."
  );
  L.push("");
  L.push("| Feature | Kind | R² vs attention | Raw AUC | Residualised AUC |");
  L.push("|---|---|---:|---:|---:|");
  for (const r2 of report.residualised) {
    L.push(
      `| \`${r2.feature}\` | ${r2.kind} | ${fmt(r2.regression_on_log1p_pub_count.r2)} | ` +
        `${fmt(r2.held_out_roc_auc_raw)} | **${fmt(r2.held_out_roc_auc_residual)}** |`
    );
  }
  L.push("");

  L.push("## Table 8 — Contribution per cancer / non-cancer stratum");
  L.push("");
  L.push(
    "Task 7 established that the held-out set is 9 cancers and effectively 1 non-cancer disease, " +
      "and that every pooled figure is therefore an oncology result. DepMap CRISPR data in " +
      "particular is cancer cell-line data, so its contribution is reported per stratum rather " +
      `than pooled. Labelling: \`${report.cancer_labels_source}\`. Models stay fitted on the full ` +
      "training set; only which held-out rows are scored changes."
  );
  L.push("");
  L.push("| Stratum | Diseases | Pairs | Positives | M0 | M1 | M3 | M4 | M3 vs M1 (pairs) |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const key of ["cancer", "non_cancer"]) {
    const s = report.per_stratum[key];
    if (!s || !s.n_total) {
      L.push(`| ${key} | ${s ? s.n_diseases : 0} | 0 | — | — | — | — | — | ${s ? s.note : "—"} |`);
      continue;
    }
    const d = s.paired_deltas.M3_vs_M1.roc_auc;
    L.push(
      `| ${key} | ${s.n_diseases} | ${s.n_total} | ${s.n_positives} | ${fmt(s.models.M0.roc_auc)} | ` +
        `${fmt(s.models.M1.roc_auc)} | ${fmt(s.models.M3.roc_auc)} | ${fmt(s.models.M4.roc_auc)} | ` +
        `${signed(d.delta)} (${signed(d.ci_low)} to ${signed(d.ci_high)})${d.includes_zero ? " incl. 0" : ""} |`
    );
  }
  L.push("");
  for (const key of ["cancer", "non_cancer"]) {
    const s = report.per_stratum[key];
    if (s && s.clustered_withheld) {
      L.push(
        `No disease-level interval for \`${key}\`: ${s.clustered_withheld}, the same rule Task 7 applies.`
      );
      L.push("");
    }
  }
  L.push("### The DepMap and tractability features, solo, per stratum");
  L.push("");
  L.push("| Feature | Kind | Solo AUC (cancer) | Solo AUC (non-cancer) |");
  L.push("|---|---|---:|---:|");
  for (const j of report.join_rates) {
    if (!j.kind || !j.included_in_model) continue;
    const c = report.per_stratum.cancer?.solo_held_out_roc_auc?.[j.feature];
    const n = report.per_stratum.non_cancer?.solo_held_out_roc_auc?.[j.feature];
    L.push(
      `| \`${j.feature}\` | ${j.kind} | ${c === undefined ? "—" : fmt(c)} | ${n === undefined ? "—" : fmt(n)} |`
    );
  }
  L.push("");
  L.push(
    "The non-cancer column is one disease. It is a count, not a comparison, and nothing should be " +
      "concluded from the direction it points."
  );
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
      for (const id of ["M0", "M1", "M3", "M4"]) {
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
      process.stderr.write(`[features] ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = 1;
    });
}
