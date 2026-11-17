/**
 * The neglect screen: targets with strong evidence and near-zero prior
 * medicinal-chemistry effort, weighted by disease burden in India.
 *
 * WHY THIS IS THE SHAPE IT IS
 * Task 8 measured that prior effort predicts clinical progression better than
 * anything else available: the number of high-quality compounds already known
 * for a target scored a solo held-out ROC-AUC of 0.772, higher than any fitted
 * model in the study. Task 8 then declined to promote a score using it, because
 * a score dominated by compound count ranks highest exactly the targets the
 * field has already chosen.
 *
 * This screen inverts that finding instead of exploiting it. Effort is a
 * FILTER, never a positive term: the evidence axis contains no effort feature
 * at all, and effort only decides whether a row is shown. That is the whole
 * design constraint, and `assertNoEffortTermInEvidence` below enforces it at
 * runtime rather than leaving it to a comment.
 *
 * WHAT IT IS NOT
 * It does not identify opportunities. The zero-effort tail is mostly passed
 * over for reasons this screen cannot see — no assay, no tool compound, a
 * pocket nobody can drug, a mechanism that failed unpublished. The job is to
 * surface that tail with its caveats attached. `screenLimitations()` returns
 * the list and the UI is expected to render it.
 */
import { nodeRequire } from "./nodeRequire.js";

const M1 = nodeRequire()("./data/novelty/fitted-m1-weights.json");

/** Optional assets: the screen degrades rather than failing when absent. */
function optional(rel) {
  try {
    return nodeRequire()(rel);
  } catch {
    return null;
  }
}
const BURDEN = optional("./data/burden/india-burden.json");

/**
 * The effort table is gzipped: 2.1MB of repeated keys compresses 35x, which
 * matters for a serverless bundle. It cannot go through require(), so the path
 * is resolved with require.resolve — whose base is server/ in both runtimes —
 * rather than import.meta.url, which Jest's CommonJS transform rejects.
 */
function optionalGz(relFromServerDir) {
  try {
    const req = nodeRequire();
    const fs = req("fs");
    const zlib = req("zlib");
    const abs = req.resolve(relFromServerDir);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(abs)).toString("utf8"));
  } catch {
    return null;
  }
}

const PRE2021_EFFORT =
  optionalGz("./data/effort/pre2021-effort.json.gz") ||
  // Uncompressed fallback, so an older working tree keeps working.
  optional("./data/effort/pre2021-effort.json");

export const EVIDENCE_MODEL = {
  id: M1.id,
  featureOrder: M1.feature_order,
  heldOutRocAuc: M1.heldOutPerformance.rocAuc,
  heldOutPrAuc: M1.heldOutPerformance.prAuc,
  scopeLimit: M1.scopeLimit,
  comparators: M1.comparators,
  caveat: M1.caveat,
  provenance: M1.provenance,
};

/**
 * Guard, not decoration: fails loudly if an effort feature ever reaches the
 * evidence model. The whole point of the screen is that effort cannot raise a
 * target's score, and a future edit to the weights asset could silently break
 * that.
 */
const EFFORT_FEATURE_PATTERN =
  /drug|compound|precedence|tractab|clinical|ligand|chembl|molecule|phase/i;

export function assertNoEffortTermInEvidence(featureOrder = M1.feature_order) {
  const offenders = (featureOrder || []).filter((f) => EFFORT_FEATURE_PATTERN.test(String(f)));
  if (offenders.length) {
    throw new Error(
      `the evidence model must contain no measure of prior effort, but carries: ${offenders.join(", ")}. ` +
        "Task 8 declined to ship such a score; see server/neglectScreen.js."
    );
  }
  return true;
}
assertNoEffortTermInEvidence();

/**
 * Evidence score, 0-100, from the fitted M1 coefficients.
 *
 * Deliberately a monotone rescale of the fitted logit, not a recalibration: the
 * ordering is the model's, and the 0-100 is presentation only.
 */
export function evidenceScore(datatypeScores = {}, overallScore = 0, publicationCount = 0) {
  const dt = datatypeScores || {};
  const coef = M1.coefficients;
  let z = M1.intercept;
  for (const name of M1.feature_order) {
    let x;
    if (name === "log1p_pub_count") {
      x = Math.log1p(Math.max(0, Number(publicationCount) || 0)) / (M1.pub_count_scale || 8);
    } else if (name === "overall") {
      x = Number(overallScore) || 0;
    } else {
      x = Number(dt[name]) || 0;
    }
    z += (Number(coef[name]) || 0) * x;
  }
  const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
  return Math.round(p * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Effort axis
// ---------------------------------------------------------------------------

export const EFFORT_TIERS = {
  UNKNOWN: "unknown",
  NONE: "none",
  MINIMAL: "minimal",
  ACTIVE: "active",
};

/** A compound count above this is no longer "minimal" chemistry. */
const MINIMAL_COMPOUND_CEILING = 5;

/**
 * Current Open Targets tractability labels that mean a drug or clinical
 * candidate exists for the target. Checked case-insensitively against whatever
 * the live API returns, because these strings are the API's, not ours.
 */
const LIVE_PRECEDENCE_LABELS = [
  "approved drug",
  "advanced clinical",
  "phase 1 clinical",
  "clinical precedence",
];

/** Live labels that indicate real chemistry short of the clinic. */
const LIVE_CHEMISTRY_LABELS = ["high-quality ligand", "high quality ligand"];

function liveTractabilityFlags(tractability) {
  // Accepts either the raw OT array of {id|label, modality, value} or the
  // app's summarised object; unknown shapes yield nulls, never false.
  if (!tractability) return { precedence: null, chemistry: null };
  const rows = Array.isArray(tractability)
    ? tractability
    : Array.isArray(tractability.rows)
      ? tractability.rows
      : null;

  if (rows) {
    const on = rows
      .filter((r) => r && (r.value === true || r.value === 1))
      .map((r) => String(r.id || r.label || "").toLowerCase());
    return {
      precedence: on.some((l) => LIVE_PRECEDENCE_LABELS.some((p) => l.includes(p))),
      chemistry: on.some((l) => LIVE_CHEMISTRY_LABELS.some((p) => l.includes(p))),
    };
  }

  if (typeof tractability === "object") {
    const pre =
      tractability.clinicalPrecedence === true
        ? true
        : tractability.clinicalPrecedence === false
          ? false
          : null;
    const chem =
      tractability.smallMolecule === true
        ? true
        : tractability.smallMolecule === false
          ? false
          : null;
    return { precedence: pre, chemistry: chem };
  }
  return { precedence: null, chemistry: null };
}

/**
 * Effort profile for one target.
 *
 * The important behaviour is the UNKNOWN tier. `tract_sm_*` joined only 72.8%
 * of targets in the Task 8 benchmark, so a missing compound count means nobody
 * recorded one, not that nobody has made a compound. Rendering that as "no
 * effort" would manufacture exactly the neglected targets this screen claims to
 * find, so it is a tier of its own and is excluded from the screen's results.
 */
export function effortProfile({
  ensemblId,
  drugCount = 0,
  clinicalCandidateCount = 0,
  tractability = null,
} = {}) {
  const pre = PRE2021_EFFORT?.byTarget?.[ensemblId] || null;
  const live = liveTractabilityFlags(tractability);

  const drugs = Math.max(0, Number(drugCount) || 0);
  const candidates = Math.max(0, Number(clinicalCandidateCount) || 0);

  const profile = {
    ensemblId: ensemblId || null,
    // null, not 0, when unknown.
    hqCompounds2021: pre ? pre.hqCompounds : null,
    smClinicalPrecedence2021: pre ? Boolean(pre.smClinicalPrecedence) : null,
    abClinicalPrecedence2021: pre ? Boolean(pre.abClinicalPrecedence) : null,
    drugCount: drugs,
    clinicalCandidateCount: candidates,
    liveClinicalPrecedence: live.precedence,
    liveHighQualityLigand: live.chemistry,
    pre2021DataAvailable: Boolean(pre),
    tier: EFFORT_TIERS.UNKNOWN,
    tierReason: "",
  };

  // Anything currently drugged or in the clinic is active, regardless of what
  // the 2021 snapshot says.
  if (drugs > 0 || candidates > 0 || live.precedence === true) {
    profile.tier = EFFORT_TIERS.ACTIVE;
    profile.tierReason =
      drugs > 0
        ? `${drugs} drug${drugs === 1 ? "" : "s"} or clinical candidate${drugs === 1 ? "" : "s"} against this target`
        : candidates > 0
          ? `${candidates} clinical candidate${candidates === 1 ? "" : "s"}`
          : "Open Targets reports clinical precedence";
    return profile;
  }

  // Pre-2021 precedence also means the target has been worked on.
  if (pre && (pre.smClinicalPrecedence || pre.abClinicalPrecedence)) {
    profile.tier = EFFORT_TIERS.ACTIVE;
    profile.tierReason = "clinical precedence recorded in Open Targets 21.04";
    return profile;
  }

  // Without a pre-2021 record there is no compound count, so effort is unknown.
  if (!pre) {
    profile.tier = EFFORT_TIERS.UNKNOWN;
    profile.tierReason =
      "no Open Targets 21.04 tractability record for this gene, so prior chemistry is unknown, not absent";
    return profile;
  }

  if (pre.hqCompounds === 0 && live.chemistry !== true) {
    profile.tier = EFFORT_TIERS.NONE;
    profile.tierReason = "no high-quality compounds and no clinical precedence recorded";
    return profile;
  }

  if (pre.hqCompounds <= MINIMAL_COMPOUND_CEILING) {
    profile.tier = EFFORT_TIERS.MINIMAL;
    profile.tierReason = `${pre.hqCompounds} high-quality compound${pre.hqCompounds === 1 ? "" : "s"} recorded, no clinical precedence`;
    return profile;
  }

  profile.tier = EFFORT_TIERS.ACTIVE;
  profile.tierReason = `${pre.hqCompounds} high-quality compounds recorded`;
  return profile;
}

// ---------------------------------------------------------------------------
// Burden axis
// ---------------------------------------------------------------------------

/**
 * India DALY burden for a disease id.
 *
 * Returns `available: false` for anything not in the mapping. There is no
 * default, no interpolation and no nearest-ancestor guess: an unmapped disease
 * has unknown burden and the UI says so.
 */
export function indiaBurdenFor(diseaseId) {
  if (!BURDEN) {
    return {
      available: false,
      reason: "the India burden asset is not built in this deployment",
    };
  }
  const hit = BURDEN.byDisease?.[String(diseaseId || "")];
  if (!hit) {
    return {
      available: false,
      reason: `no exact-match mapping from a WHO GHE cause to ${diseaseId || "this disease"}`,
      mappingCoverage: BURDEN.mappingCoverage?.mapping_rate ?? null,
    };
  }
  return {
    available: true,
    dalyThousands: hit.dalyThousands,
    shareOfTotalDaly: hit.shareOfTotalDaly,
    gheCause: hit.gheLabel,
    gheCode: hit.gheCode,
    matchedDiseaseLabel: hit.efoLabel,
    referenceYear: BURDEN.referenceYear,
    country: BURDEN.country,
    source: BURDEN.source,
  };
}

export function burdenAssetInfo() {
  if (!BURDEN) return { available: false };
  return {
    available: true,
    country: BURDEN.country,
    referenceYear: BURDEN.referenceYear,
    units: BURDEN.units,
    totalDalyThousands: BURDEN.totalDalyThousands,
    populationThousands: BURDEN.populationThousands,
    nDiseases: BURDEN.nDiseases,
    mappingCoverage: BURDEN.mappingCoverage,
    source: BURDEN.source,
  };
}

// ---------------------------------------------------------------------------
// What the screen cannot know
// ---------------------------------------------------------------------------

/**
 * The brief required this list and referenced a section that did not arrive in
 * the text I was given, so it is written from what the benchmarks actually
 * establish. Every entry is a limitation that is measured or structural, not a
 * disclaimer added for tone.
 */
export function screenLimitations() {
  return [
    {
      id: "oncology-scope",
      title: "The evidence score is an oncology result",
      detail:
        `Held-out ROC-AUC ${M1.heldOutPerformance.rocAuc} on a panel where ` +
        `${M1.scopeLimit.cancerDiseases} of the ${M1.scopeLimit.cancerDiseases + M1.scopeLimit.nonCancerDiseases} ` +
        "contributing held-out diseases were cancers. On the single non-cancer disease, publication " +
        `count alone scored ${M1.scopeLimit.nonCancerRocAucM0} against the model's ${M1.scopeLimit.nonCancerRocAucM1}: ` +
        "no benefit. Outside oncology this score is untested.",
      source: "benchmark/docking/results/task7_cancer_stratification.json",
    },
    {
      id: "absence-is-not-zero",
      title: "Missing effort data is not zero effort",
      detail:
        "Open Targets 21.04 tractability joined 72.8% of targets in the Task 8 benchmark. A target " +
        "with no record has unknown prior chemistry, not none, and is excluded from these results " +
        "rather than being shown as neglected.",
      source: "benchmark/docking/results/task8_tractability.json",
    },
    {
      id: "why-passed-over",
      title: "It cannot tell you why a target was passed over",
      detail:
        "Most of the zero-effort tail is there for reasons no public dataset records: no tractable " +
        "pocket, no assay, no tool compound, a mechanism that failed in someone's unpublished work, " +
        "or a target nobody can make a selective molecule against. Absence of effort is not evidence " +
        "of a missed opportunity.",
      source: null,
    },
    {
      id: "evidence-is-attention-shaped",
      title: "The evidence score is partly a measure of attention",
      detail:
        `Publication count alone reaches ROC-AUC ${M1.comparators.publicationCountAlone}, against ` +
        `${M1.heldOutPerformance.rocAuc} for the full model: the eight biology features add ` +
        `${M1.gainOverPublicationCount?.rocAucDelta ?? "a small amount"} and that gain does not survive ` +
        "disease-level resampling for PR-AUC. So a high evidence score partly means a well-studied " +
        "target, which is in tension with looking for neglected ones.",
      source: "benchmark/docking/results/task4_attention_control.json",
    },
    {
      id: "burden-not-gbd-india",
      title: "Burden is WHO national data, not the ICMR/PHFI/IHME state-level series",
      detail:
        "The India State-Level Disease Burden Initiative output is published as a PDF of typeset " +
        "tables and the IHME GBD Results Tool has no open bulk endpoint, so WHO Global Health " +
        "Estimates national DALYs are used instead. These will not match published GBD India " +
        "figures, and they carry no state-level detail.",
      source: "benchmark/burden/india_disease_burden.json",
    },
    {
      id: "burden-mapping-partial",
      title: "Most disease burden is unmapped",
      detail:
        "WHO GHE cause labels are not ontology terms, and a mapping is accepted only on an exact " +
        "label match to an EFO or MONDO disease. Unmapped diseases show burden as unavailable.",
      source: "benchmark/burden/ghe_to_efo_mapping.json",
    },
    {
      id: "temporal-extrapolation",
      title: "The model was fitted on 2021 data and is being applied to today's",
      detail:
        "M1 was fitted on Open Targets 21.04 and validated against outcomes to 26.09. Scoring " +
        "current Open Targets data with it assumes the relationship has not moved in the " +
        "intervening years, which has not been tested.",
      source: "benchmark/docking/results/task4_attention_control.json",
    },
    {
      id: "no-commercial-axis",
      title: "There is no market or commercial term, deliberately",
      detail:
        "Burden is DALYs. No per-capita income, market size, willingness-to-pay or other commercial " +
        "proxy enters the ranking at any point.",
      source: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** Effort tiers a result row may have. Anything else is filtered out. */
const SHOWN_TIERS = new Set([EFFORT_TIERS.NONE, EFFORT_TIERS.MINIMAL]);

/**
 * Run the screen for one disease.
 *
 * Ranking is by evidence score alone. Burden does not multiply the score,
 * because a DALY count and a fitted probability have no common scale and
 * multiplying them would invent a quantity neither source supports; it is
 * returned per disease so a multi-disease run can be ordered by it explicitly.
 */
export async function runNeglectScreenForDisease(queryString, { signal, diseaseHint = null } = {}) {
  const { runTargetDiscovery } = await import("./openTargets.js");
  const discovery = await runTargetDiscovery(queryString, { diseaseHint, signal });

  if (discovery.error || !discovery.disease) {
    return {
      query: queryString,
      disease: discovery.disease || null,
      error: discovery.error || "no disease matched",
      hits: discovery.hits || [],
      rows: [],
      burden: { available: false, reason: "no disease resolved" },
      counts: null,
    };
  }

  const burden = indiaBurdenFor(discovery.disease.id);
  const all = Array.isArray(discovery.all) ? discovery.all : [];

  const counts = {
    considered: all.length,
    [EFFORT_TIERS.NONE]: 0,
    [EFFORT_TIERS.MINIMAL]: 0,
    [EFFORT_TIERS.ACTIVE]: 0,
    [EFFORT_TIERS.UNKNOWN]: 0,
  };

  const rows = [];
  for (const row of all) {
    const effort = effortProfile({
      ensemblId: row.ensemblId,
      drugCount: row.drugCount,
      clinicalCandidateCount: 0,
      tractability: row.tractability,
    });
    counts[effort.tier] = (counts[effort.tier] || 0) + 1;
    if (!SHOWN_TIERS.has(effort.tier)) continue;

    rows.push({
      ensemblId: row.ensemblId,
      symbol: row.symbol,
      name: row.name,
      evidenceScore: evidenceScore(row.datatypeScores, row.overallScore, row.publicationCount),
      effortTier: effort.tier,
      effortReason: effort.tierReason,
      hqCompounds2021: effort.hqCompounds2021,
      drugCount: row.drugCount,
      publicationCount: row.publicationCount,
      datatypeScores: row.datatypeScores,
      geneticScore: row.geneticScore,
      // Task 8 measured these as adding nothing over evidence plus attention,
      // so they travel as context and never enter the ranking.
      context: {
        pli: row.pli ?? null,
        loeuf: row.loeuf ?? null,
        depmapMeanGeneEffect: row.depmapMeanGeneEffect ?? null,
        gtexTau: row.gtexTau ?? null,
      },
    });
  }

  rows.sort((a, b) => b.evidenceScore - a.evidenceScore || String(a.symbol).localeCompare(String(b.symbol)));

  return {
    query: queryString,
    disease: discovery.disease,
    error: "",
    hits: discovery.hits || [],
    burden,
    counts,
    rows,
    evidenceModel: EVIDENCE_MODEL,
    limitations: screenLimitations(),
  };
}

/** Run the screen across several diseases, preserving per-disease burden. */
export async function runNeglectScreen(queries, { signal } = {}) {
  const list = (Array.isArray(queries) ? queries : [queries])
    .map((q) => String(q || "").trim())
    .filter(Boolean);

  if (!list.length) {
    return { diseases: [], burdenAsset: burdenAssetInfo(), limitations: screenLimitations() };
  }

  const diseases = [];
  for (const q of list) {
    diseases.push(await runNeglectScreenForDisease(q, { signal }));
  }

  return {
    diseases,
    burdenAsset: burdenAssetInfo(),
    evidenceModel: EVIDENCE_MODEL,
    limitations: screenLimitations(),
  };
}
