/**
 * Provenance stamped on every exported report.
 *
 * An exported report leaves the app and gets read, mailed and filed without
 * the page around it, so it has to carry enough to say where its numbers came
 * from. Two different commits matter and they are not the same thing:
 *
 *   benchmarkCommit — the commit whose benchmark run produced the measured
 *     figures quoted in the report. Read from the fitted-weights asset, which
 *     is the same source /validation uses, so a report and the validation page
 *     can never quote figures from different runs.
 *
 *   appCommit — the commit of the code that generated the report. Only
 *     available when the build injects it; CRA exposes REACT_APP_* only, and
 *     Vercel supplies VERCEL_GIT_COMMIT_SHA to the build, which the build
 *     script forwards. When it is absent the report says so rather than
 *     printing a plausible-looking blank.
 */
import { VALIDATION_COMMIT_SHORT, VALIDATION_GENERATED_AT } from "./validationProvenance.js";

const rawAppCommit =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_COMMIT) || "";

/** Short form of the app commit, or null when the build did not inject one. */
export const APP_COMMIT = rawAppCommit ? String(rawAppCommit).slice(0, 7) : null;

export const REPORT_PROVENANCE = {
  appCommit: APP_COMMIT,
  benchmarkCommit: VALIDATION_COMMIT_SHORT,
  benchmarkGeneratedAt: VALIDATION_GENERATED_AT,
};

/**
 * One line for a report header. Never invents an app commit: an unstamped
 * build says "not recorded", which is a true statement a reader can act on.
 */
export function reportProvenanceLine() {
  const app = APP_COMMIT ? `\`${APP_COMMIT}\`` : "not recorded in this build";
  return (
    `**Provenance:** app commit ${app}; measured figures from benchmark commit ` +
    `\`${VALIDATION_COMMIT_SHORT}\` (${VALIDATION_GENERATED_AT})`
  );
}
