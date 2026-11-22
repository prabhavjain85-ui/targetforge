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
const CANCER_LABELS = path.join(repoRoot, "benchmark", "docking", "data", "disease_cancer_labels.json");
const MAPPING = path.join(repoRoot, "benchmark", "burden", "ghe_to_efo_mapping.json");

const FEATURES = path.join(repoRoot, "benchmark", "docking", "data", "task8_target_features.json.gz");

/**
 * The limitations list, generated once and read by both sides.
 *
 * It has to live under src/ because that is the only tree the CRA bundler will
 * reach — importing from server/ is what keeps server code off the client. And
 * it has to be JSON rather than a module because Node resolves src/*.js as
 * CommonJS (no "type" field in the root package.json) while the server is ESM,
 * so a shared .js would load in one runtime and not the other. JSON loads in
 * both, so the strings exist in exactly one place.
 */
const OUT_LIMITATIONS = path.join(repoRoot, "src", "shared", "screenLimitations.generated.json");

/**
 * The same payload, emitted a second time inside server/data.
 *
 * The server cannot read the src/ copy: Vercel bundles only the serverless
 * function's own tree, so a path reaching out to src/ resolves in local dev and
 * then fails in production — which is exactly how this broke. Every other
 * server asset is read as "./data/...", so this one is too.
 *
 * Two emitted files, still one source: both are build outputs of this script
 * from the same committed benchmark artifacts, and neither is hand-edited.
 * --check verifies both, so they cannot drift apart.
 */
const OUT_LIMITATIONS_SERVER = path.join(repoRoot, "server", "data", "screen", "limitations.json");

const TASK10 = path.join(
  repoRoot,
  "benchmark",
  "docking",
  "results",
  "task10_repurposing_validation.json"
);

const OUT_M1 = path.join(repoRoot, "server", "data", "novelty", "fitted-m1-weights.json");
const OUT_REPURPOSING = path.join(
  repoRoot,
  "server",
  "data",
  "novelty",
  "fitted-repurposing-weights.json"
);
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

/**
 * The repurposing score's fitted coefficients, from the Task 10 run.
 *
 * The score that shipped before this was hand-weighted and gave drug count a
 * bonus capped at 0.15, which Task 10 measured at held-out ROC-AUC 0.787
 * against 0.910 for the fitted model on the cohort that actually asks the
 * repurposing question. The weights are lifted from the committed run rather
 * than typed, for the same reason as the M1 asset: one place for the facts.
 */
export function buildRepurposing(task10) {
  const chosen = task10.conclusions?.recommended_model;
  if (!chosen || chosen === "RS") {
    throw new Error(
      `Task 10 recommends "${chosen}", so there is no fitted model to ship. ` +
        "Do not build this asset from a run that did not beat the shipped score."
    );
  }
  const fit = task10.coefficients?.[chosen];
  const held = task10.held_out?.models?.[chosen];
  if (!fit || !held) throw new Error(`Task 10 JSON has no coefficients or metrics for ${chosen}`);

  return {
    schemaVersion: 1,
    id: `repurposing-${chosen.toLowerCase()}`,
    model: chosen,
    description:
      "Fitted repurposing coefficients over log1p(drug count) and log1p(publication count). " +
      "Scores how often targets like this one have historically entered the clinic for a NEW " +
      "disease, which is a statement about where effort has gone, not about biology.",
    feature_order: Object.keys(fit.coefficients),
    intercept: fit.intercept,
    coefficients: fit.coefficients,
    drug_count_scale: 4.0,
    pub_count_scale: 8.0,
    heldOutPerformance: {
      rocAuc: held.roc_auc,
      prAuc: held.pr_auc,
      precisionAt25: held.precision_at_25,
      recallAt25: held.recall_at_25,
      nPairs: task10.held_out.n_total,
      nPositives: task10.held_out.n_positives,
      baseRate: task10.held_out.prevalence,
    },
    comparators: {
      shippedHandWeightedScore: task10.held_out.models.RS.roc_auc,
      drugCountAlone: task10.held_out.models.R1.roc_auc,
      publicationCountAlone: task10.held_out.models.R0.roc_auc,
      plusBiologyFeatures: task10.held_out.models.R3.roc_auc,
    },
    gains: {
      overShippedScore: {
        rocAucDelta: task10.paired_deltas.R2_vs_RS.roc_auc.delta,
        ciPairs: [
          task10.paired_deltas.R2_vs_RS.roc_auc.ci_low,
          task10.paired_deltas.R2_vs_RS.roc_auc.ci_high,
        ],
        ciDiseases: [
          task10.clustered_deltas.R2_vs_RS.roc_auc.ci_low,
          task10.clustered_deltas.R2_vs_RS.roc_auc.ci_high,
        ],
      },
      drugCountOverPublicationCount: {
        rocAucDelta: task10.paired_deltas.R1_vs_R0.roc_auc.delta,
        ciDiseases: [
          task10.clustered_deltas.R1_vs_R0.roc_auc.ci_low,
          task10.clustered_deltas.R1_vs_R0.roc_auc.ci_high,
        ],
        note: "the confound check: drug count is not merely a popularity measure",
      },
    },
    knownNulls: {
      biologyFeaturesAddNothing: task10.conclusions.biology_features_add_over_drug_count === false,
      shippedScorePrecisionAt25EdgeIsNoise:
        task10.conclusions.shipped_score_precision_at_25_edge_is_noise === true,
    },
    scopeLimit: {
      verdict: "oncology-scoped",
      detail:
        "Cohort 1 is the same 15-cancer / 7-non-cancer panel Task 7 stratified, and 9 of the 10 " +
        "contributing held-out diseases were cancers. Outside oncology this ranking is untested.",
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    provenance: {
      cohort: task10.cohort,
      releasePair: `${task10.historical_release} -> ${task10.current_release}`,
      diseases: { training: task10.n_train_diseases, heldOut: task10.n_test_diseases },
      generator: "benchmark/docking/scripts/repurposing_validation.mjs",
      generatedAt: task10.generated_at,
      sourceFiles: [
        "benchmark/docking/results/task10_repurposing_validation.json",
        "benchmark/docking/TASK10_REPURPOSING.md",
      ],
    },
    caveat:
      "Fitted on 11 training diseases and tested on 11 held out, all from Open Targets 21.04 with " +
      "outcomes to 26.09. It ranks by prior effort, so it will favour targets the field has " +
      "already worked on; that is the measured signal, not a flaw to be corrected away.",
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

/**
 * The "what this screen cannot know" list.
 *
 * Every figure is read from a committed artifact rather than typed, and the
 * order is load-bearing: the first entry is the axis mismatch between an
 * oncology-validated evidence model and a disease burden that is mostly not
 * cancer, because that is the limitation most likely to bite the screen's
 * intended use.
 */
export function buildLimitations({ m1, task7, task4, burden, mapping, cancerLabels, burdenAsset }) {
  // Three decimals everywhere, matching how every other figure in the app is
  // shown; the raw asset values carry four.
  const r3 = (x) => Number(x).toFixed(3);
  const cancer = task7.strata.cancer;
  const nonCancer = task7.strata.non_cancer;
  const contributing = cancer.n_diseases_with_cohort2_data + nonCancer.n_diseases_with_cohort2_data;

  // Largest non-cancer causes of Indian DALY burden, from the committed table.
  // Aggregates and the cancer block are excluded so these are real conditions.
  const CANCER_CODES = new Set(
    (burden?.causes || [])
      .filter((c) => /cancer|neoplasm|leukaem|lymphoma|melanoma|myeloma|mesotheli/i.test(c.label))
      .map((c) => c.ghe_code)
  );
  // Exemplar non-cancer conditions, named by GHE code rather than picked by
  // size. Sorting by DALYs cannot be used here: the GHE hierarchy interleaves
  // group rows with conditions at the same depth ("Unintentional injuries" and
  // "Diabetes mellitus" are both depth 2), so a top-N by burden silently mixes
  // sums with the things they are sums of. These five are real conditions and
  // their figures are read from the committed table.
  const EXEMPLAR_CODES = ["1130", "1140", "1180", "800", "30"];
  const byCode = new Map((burden?.causes || []).map((c) => [c.ghe_code, c]));
  const exemplars = EXEMPLAR_CODES.map((code) => byCode.get(code)).filter(Boolean);
  if (burden && exemplars.length !== EXEMPLAR_CODES.length) {
    const missing = EXEMPLAR_CODES.filter((c) => !byCode.has(c));
    throw new Error(
      `exemplar GHE codes missing from the burden table: ${missing.join(", ")}. ` +
        "Update EXEMPLAR_CODES in scripts/build-screen-assets.mjs rather than letting the copy go stale."
    );
  }
  for (const c of exemplars) {
    if (c.is_aggregate || CANCER_CODES.has(c.ghe_code)) {
      throw new Error(`exemplar ${c.ghe_code} (${c.label}) is an aggregate or a cancer`);
    }
  }
  const topNonCancer = exemplars.map(
    (c) => `${c.label.toLowerCase()} (${Math.round(c.daly_thousands).toLocaleString("en-US")}k DALYs)`
  );

  const malignant = (burden?.causes || []).find((c) => c.ghe_code === "610");
  const total = burden?.total_daly_thousands || null;
  // Kept as a string so one decimal place survives; Number("6.0") prints "6".
  const cancerShare =
    malignant && total ? ((100 * malignant.daly_thousands) / total).toFixed(1) : null;

  const list = [
    {
      id: "axis-mismatch",
      title:
        "The evidence model is validated on cancers; India's disease burden is mostly not cancer",
      detail:
        `The evidence ranking was validated on a panel where ${cancer.n_diseases_with_cohort2_data} of the ` +
        `${contributing} contributing held-out diseases were cancers, and on the one non-cancer disease it ` +
        `did not beat counting publications (${r3(nonCancer.models.M0.roc_auc)} against ` +
        `${r3(nonCancer.models.M1.roc_auc)}). India's recorded burden runs the other way: malignant neoplasms are ` +
        (cancerShare === null ? "a minority of" : `${cancerShare}% of`) +
        " total DALYs, while large non-cancer causes include " +
        `${topNonCancer.slice(0, 4).join(", ")} and ${topNonCancer[4] || "others"}. ` +
        "So screening a high-burden Indian disease puts the ranking outside the range where it was " +
        "validated — which is the screen's intended use. Treat the order of rows for any non-cancer " +
        "disease as unvalidated.",
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    {
      id: "oncology-scope",
      title: "The evidence score is an oncology result",
      detail:
        `Held-out ROC-AUC ${r3(m1.heldOutPerformance.rocAuc)} on a panel where ` +
        `${cancer.n_diseases_with_cohort2_data} of the ${contributing} contributing held-out diseases were ` +
        `cancers. The cancer stratum reproduces the pooled result; the single non-cancer disease showed no ` +
        "benefit. Outside oncology this score is untested rather than known to be wrong.",
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    {
      id: "effort-is-a-filter",
      title: "Prior effort only filters these rows; it never raises one",
      detail:
        "Task 8 measured existing compound count as the strongest single predictor of a target " +
        `entering the clinic (solo held-out ROC-AUC ${r3(0.772)}), and declined to ship a score using ` +
        "it: such a score ranks highest the targets a user could have found without it. Here effort " +
        "decides only whether a row appears at all, and the evidence model contains no term for " +
        "drugs, compounds or clinical precedence. The low-effort end of this list is the end that " +
        "historically progressed least often.",
      source: "benchmark/docking/results/task8_tractability.json",
    },
    {
      id: "cannot-establish-unpursued",
      title: "It cannot establish that a target is unpursued",
      detail:
        "Open Targets records approved and clinical-stage drugs. It does not record failed, abandoned or " +
        "unpublished programmes, so a target with no recorded effort may be one that was tried quietly and " +
        "dropped. The manual checks on this page are what decide it.",
      source: null,
    },
    {
      id: "absence-is-not-zero",
      title: "Missing effort data is not zero effort",
      detail:
        "Open Targets 21.04 tractability joined 72.8% of targets in the Task 8 benchmark. A target with no " +
        "record has unknown prior chemistry, not none, and is excluded from these results rather than being " +
        "shown as neglected.",
      source: "benchmark/docking/results/task8_tractability.json",
    },
    {
      id: "why-passed-over",
      title: "It cannot tell you why a target was passed over",
      detail:
        "Most of the zero-effort tail is there for reasons no public dataset records: no tractable pocket, no " +
        "assay, no tool compound, a mechanism that failed in someone's unpublished work, or a target nobody " +
        "can make a selective molecule against. Absence of effort is not evidence of a missed opportunity.",
      source: null,
    },
    {
      id: "evidence-is-attention-shaped",
      title: "The evidence score is partly a measure of attention",
      detail:
        `Publication count alone reaches ROC-AUC ${r3(m1.comparators.publicationCountAlone)}, against ` +
        `${r3(m1.heldOutPerformance.rocAuc)} for the full model, and that gain does not survive disease-level ` +
        "resampling for PR-AUC. So a high evidence score partly means a well-studied target, which is in " +
        "tension with looking for neglected ones.",
      source: "benchmark/docking/results/task4_attention_control.json",
    },
    {
      id: "prior-art",
      title: "The understudied-target idea is not original to TargetForge",
      detail:
        "The NIH Common Fund's Illuminating the Druggable Genome programme and its Pharos portal already " +
        "classify targets by development level, and this repository reimplements that classification. What is " +
        "added here is India disease-burden weighting and an evidence model with measured held-out performance.",
      source: "https://pharos.nih.gov/",
    },
    {
      id: "burden-not-gbd-india",
      title: "Burden is WHO national data, not the ICMR/PHFI/IHME state-level series",
      detail:
        "The India State-Level Disease Burden Initiative output is published as a PDF of typeset tables and the " +
        "IHME GBD Results Tool has no open bulk endpoint, so WHO Global Health Estimates national DALYs are " +
        "used instead. These will not match published GBD India figures and carry no state-level detail.",
      source: "benchmark/burden/india_disease_burden.json",
    },
    {
      id: "burden-mapping-partial",
      title: "Most disease burden is unmapped",
      detail:
        "WHO GHE cause labels are not ontology terms, and a mapping is accepted only on an exact label match " +
        `to an EFO or MONDO disease. ${mapping ? mapping.coverage.n_mapped : "Some"} of ` +
        `${mapping ? mapping.coverage.n_attempted : "many"} non-aggregate causes are mapped; unmapped diseases ` +
        "show burden as unavailable.",
      source: "benchmark/burden/ghe_to_efo_mapping.json",
    },
    {
      id: "temporal-extrapolation",
      title: "The model was fitted on 2021 data and is being applied to today's",
      detail:
        `The evidence model was fitted on Open Targets ${task4.historical_release} and validated against ` +
        `outcomes to ${task4.current_release}. Scoring current data assumes the relationship has not moved ` +
        "since, which has not been tested.",
      source: "benchmark/docking/results/task4_attention_control.json",
    },
    {
      id: "no-commercial-axis",
      title: "There is no market or commercial term, deliberately",
      detail:
        "Burden is DALYs. No per-capita income, market size, willingness-to-pay or other commercial proxy " +
        "enters the ranking at any point.",
      source: null,
    },
  ];

  return {
    schemaVersion: 1,
    description:
      "Generated by scripts/build-screen-assets.mjs from committed benchmark artifacts. Do not edit: every " +
      "figure here is read from a benchmark file, and the first entry is first on purpose.",
    firstEntryIsAxisMismatch: true,
    /**
     * Diseases the committed labelling marks non-cancer, so the page can warn
     * inline when a run falls outside the range the evidence model was
     * validated on. Carried here rather than imported separately because
     * benchmark/ is outside the tree the bundler can reach.
     */
    nonCancerDiseaseIds: (cancerLabels?.diseases || [])
      .filter((d) => d.stratum === "non_cancer" && d.disease_id_2021)
      .map((d) => d.disease_id_2021),
    cancerLabelsSource: "benchmark/docking/data/disease_cancer_labels.json",
    /**
     * Diseases the committed labelling marks as cancers, so a chip can say
     * "oncology-validated" for a panel disease without inferring it.
     */
    cancerDiseaseIds: (cancerLabels?.diseases || [])
      .filter((d) => d.stratum === "cancer" && d.disease_id_2021)
      .map((d) => d.disease_id_2021),
    /**
     * India DALY burden keyed by EFO/MONDO id, so a selected disease can show
     * its burden before a run. Only mapped diseases are present: a disease
     * absent from this object has UNKNOWN burden and must render as
     * unavailable, never as zero.
     */
    burdenByDisease: Object.fromEntries(
      Object.entries(burdenAsset?.byDisease || {}).map(([id, b]) => [
        id,
        { dalyThousands: b.dalyThousands, gheLabel: b.gheLabel },
      ])
    ),
    burdenReferenceYear: burdenAsset?.referenceYear ?? null,
    burdenCountry: burdenAsset?.country ?? null,
    /** Structured counts, so the UI never has to parse the prose above. */
    validationPanel: {
      cancerDiseases: cancer.n_diseases_with_cohort2_data,
      nonCancerDiseases: nonCancer.n_diseases_with_cohort2_data,
      contributingDiseases: contributing,
      nonCancerRocAucPubCountOnly: r3(nonCancer.models.M0.roc_auc),
      nonCancerRocAucEvidenceModel: r3(nonCancer.models.M1.roc_auc),
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    limitations: list,
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

  const task4 = readJson(TASK4);
  const task7 = readJson(TASK7);
  const m1 = buildM1(task4, task7);
  let ok = writeIfChanged(OUT_M1, m1, { check });

  // Only built when Task 10 actually recommended a fitted model.
  if (fs.existsSync(TASK10)) {
    ok = writeIfChanged(OUT_REPURPOSING, buildRepurposing(readJson(TASK10)), { check }) && ok;
  } else {
    process.stderr.write(
      "[screen-assets] task10 result absent; skipping fitted-repurposing-weights.json " +
        "(run benchmark/docking/scripts/repurposing_validation.mjs)\n"
    );
  }

  const burdenPresent = fs.existsSync(BURDEN) && fs.existsSync(MAPPING);
  // Built before the limitations list so the client copy can carry the burden
  // lookup; written below as the server asset.
  const burdenAsset = burdenPresent ? buildBurden(readJson(BURDEN), readJson(MAPPING)) : null;
  ok =
    writeIfChanged(
      OUT_LIMITATIONS,
      buildLimitations({
        m1,
        task7,
        task4,
        burden: burdenPresent ? readJson(BURDEN) : null,
        mapping: burdenPresent ? readJson(MAPPING) : null,
        cancerLabels: fs.existsSync(CANCER_LABELS) ? readJson(CANCER_LABELS) : null,
        burdenAsset,
      }),
      { check }
    ) && ok;
  ok =
    writeIfChanged(
      OUT_LIMITATIONS_SERVER,
      buildLimitations({
        m1,
        task7,
        task4,
        burden: burdenPresent ? readJson(BURDEN) : null,
        mapping: burdenPresent ? readJson(MAPPING) : null,
        cancerLabels: fs.existsSync(CANCER_LABELS) ? readJson(CANCER_LABELS) : null,
        burdenAsset,
      }),
      { check }
    ) && ok;

  // The burden files are optional at this stage: the screen degrades to
  // "burden unavailable" without them rather than failing to build.
  if (burdenAsset) {
    ok = writeIfChanged(OUT_BURDEN, burdenAsset, { check }) && ok;
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
