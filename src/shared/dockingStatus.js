/**
 * The only place in this repository where docking status is written in English.
 *
 * It replaced twelve hardcoded strings across Layout, HomepageIntro, seoConfig
 * (five of them), featureFlags, MethodologyPage, HandoffStations,
 * DockingRunCocrystalSection and DockingPage, which had drifted out of
 * agreement with the flags, with each other and with /validation. If you need
 * to say something about docking status anywhere, add it here and render it
 * from here. src/methodologyProvenance.test.js greps src/ and api/ and fails if
 * a status string appears anywhere else.
 *
 * TWO PHRASES ARE BANNED, for reasons that are measurements rather than taste:
 *
 *   "under validation" — the in-browser engine was not awaiting validation. It
 *   was validated and it failed: in-place RMSD 5.5-11.5 A against co-crystal
 *   ligands, with no valid pose produced on six of the eleven targets tested.
 *   Calling that "under validation" describes a finished negative result as
 *   work in progress.
 *
 *   "in-browser" — the engine that works is AutoDock Vina running as a service.
 *   The in-browser engine is the one that failed and is now disabled, so
 *   attaching "in-browser" to a docking status tells the reader the opposite of
 *   what is true.
 */
// Explicit .js extension: seoConfig.js imports this module, and seoConfig is
// loaded as plain Node ESM by scripts/inject-seo-html.mjs during the build,
// where extensionless specifiers do not resolve.
import { DOCKING_ENABLED, DOCKING_ENGINE_ENABLED } from "../featureFlags.js";

/** The three states docking can actually be in. */
export const DOCKING_STATE = {
  /** Vina is configured and answering. Poses and scores are real Vina output. */
  VINA_LIVE: "vina_live",
  /** Vina is switched on in the build but the service is not answering. */
  VINA_UNREACHABLE: "vina_unreachable",
  /** Docking is off: no engine will run and nothing will be scored. */
  OFF: "off",
};

/**
 * Measured performance of the Vina path, from the committed benchmark. Quoted
 * wherever the status copy claims docking works, so the claim arrives with its
 * numbers attached.
 */
export const VINA_MEASURED = {
  redockUnder2A: "10/11",
  pairReliability: "15/25",
  potencyCorrelation: "Spearman −0.291 (95% CI −0.681 to 0.478)",
  source: "benchmark/docking/RESULTS.md",
};

/** Why the in-browser engine is off. Stated as the finished result it is. */
export const IN_BROWSER_ENGINE_RESULT = {
  disabled: true,
  summary:
    "The legacy in-browser engine is disabled. It failed co-crystal redocking on every target " +
    "tested — in-place RMSD 5.5–11.5 Å, and no valid pose at all on six of eleven — so it is a " +
    "completed negative result, not work in progress.",
  source: "benchmark/docking/RESULTS.md",
};

/**
 * Resolve the state from the build flags and, when available, a health payload
 * from /api/docking/health.
 *
 * `health` may be null, which is the state before the check returns. That is
 * reported as unreachable rather than live: claiming docking works before
 * anything has confirmed it is the failure mode this module exists to stop.
 */
export function dockingState(health = null) {
  if (!DOCKING_ENABLED) return DOCKING_STATE.OFF;
  if (!health) return DOCKING_STATE.VINA_UNREACHABLE;
  if (health.serviceConfigured === false) return DOCKING_STATE.OFF;
  if (health.serviceReachable === false || health.serviceUnavailable === true) {
    return DOCKING_STATE.VINA_UNREACHABLE;
  }
  if (health.status === "unavailable") return DOCKING_STATE.VINA_UNREACHABLE;
  return DOCKING_STATE.VINA_LIVE;
}

const COPY = {
  [DOCKING_STATE.VINA_LIVE]: {
    short: "Docking: AutoDock Vina service",
    sentence:
      "Docking runs on the AutoDock Vina service. Redocking reproduced the co-crystal pose " +
      `within 2 Å on ${VINA_MEASURED.redockUnder2A} targets, and ${VINA_MEASURED.pairReliability} ` +
      "drug–structure pairs pass sanity checks; poses are shown only for those. Scores correlate " +
      `with measured potency at ${VINA_MEASURED.potencyCorrelation} — that is, not at all — so a ` +
      "score is not an affinity estimate.",
    seo:
      "Molecular docking runs on an AutoDock Vina service; poses are shown only for " +
      "drug–structure pairs that pass co-crystal sanity checks, and scores are not affinity estimates.",
    canRun: true,
    showsScores: true,
  },
  [DOCKING_STATE.VINA_UNREACHABLE]: {
    short: "Docking: service not reachable",
    sentence:
      "The AutoDock Vina service is not reachable from this deployment, so no docking will run " +
      "and no poses or scores are produced. Experimental co-crystal structures are still shown " +
      "where they exist, because those are measured, not computed.",
    seo:
      "Molecular docking is switched on but its AutoDock Vina service is not reachable from this " +
      "deployment, so no binding scores or poses are produced.",
    canRun: false,
    showsScores: false,
  },
  [DOCKING_STATE.OFF]: {
    short: "Docking: off",
    sentence:
      "Docking is off on this deployment: no engine runs and no poses or scores are produced. " +
      "Experimental co-crystal structures are still shown where they exist, because those are " +
      "measured, not computed. The legacy in-browser engine is disabled for good — it failed " +
      "co-crystal redocking on every target tested.",
    seo:
      "Molecular docking is off on this deployment: no binding scores or poses are produced. " +
      "Experimental co-crystal structures are shown where they exist.",
    canRun: false,
    showsScores: false,
  },
};

/** Full status for a state, or for the state implied by a health payload. */
export function dockingStatus(health = null) {
  const state = dockingState(health);
  return { state, ...COPY[state] };
}

/**
 * Status without a health check, for module-load contexts such as SEO metadata
 * that cannot await anything. It can only distinguish "off" from "switched on",
 * so a switched-on build reports unreachable until the check confirms
 * otherwise — deliberately the cautious direction.
 */
export function dockingStatusFromFlags() {
  return dockingStatus(null);
}

/** One short clause for appending to a longer sentence. */
export function dockingStatusClause(health = null) {
  return dockingStatus(health).short;
}

/** True when the UI should offer any docking control at all. */
export function dockingUiAvailable() {
  return DOCKING_ENABLED;
}

/** The legacy engine is never a route to a score again. */
export function inBrowserEngineEnabled() {
  return DOCKING_ENGINE_ENABLED;
}
