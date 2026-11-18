import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { runNeglectScreen } from "./serverApi";
import { NEGLECT_SCREEN_COPY } from "./shared/validationCopy";
import {
  SCREEN_LIMITATIONS,
  VALIDATION_PANEL,
  axisMismatchLimitation,
  isNonCancerDisease,
} from "./shared/screenLimitations";
import TargetChecklist from "./NeglectChecklist";
import "./validation.css";
import "./neglectScreen.css";

/**
 * Targets with strong evidence and near-zero prior medicinal-chemistry effort,
 * shown alongside India's disease burden.
 *
 * The screen inverts the Task 8 finding rather than exploiting it: prior effort
 * predicts clinical progression better than anything else measured, so the
 * zero-effort tail is what the field has passed over. Effort is a filter here,
 * never a positive term in the ranking.
 *
 * Every figure comes from src/shared/validationCopy.js or the server payload,
 * which in turn reads committed benchmark artifacts. Nothing is computed here.
 */

const TIER_LABEL = {
  none: "No recorded effort",
  minimal: "Minimal effort",
  active: "Active",
  unknown: "Unknown",
};

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN");
}

/** DALYs arrive in thousands, as published; shown as published. */
function BurdenCell({ burden }) {
  if (!burden || !burden.available) {
    return (
      <span className="burden-unavailable" title={burden?.reason || "unknown"}>
        Unavailable
      </span>
    );
  }
  return (
    <span className="burden-value" title={`WHO GHE cause: ${burden.gheCause}`}>
      {fmtInt(Math.round(burden.dalyThousands))}k DALYs
    </span>
  );
}

export default function NeglectScreenPage() {
  const [input, setInput] = useState("");
  const [state, setState] = useState({ status: "idle", data: null, error: "" });

  const run = useCallback(async () => {
    const queries = input
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!queries.length) return;
    setState({ status: "running", data: null, error: "" });
    try {
      const data = await runNeglectScreen(queries);
      setState({ status: "done", data, error: "" });
    } catch (err) {
      setState({ status: "error", data: null, error: String(err?.message || err) });
    }
  }, [input]);

  /**
   * The limitations list is static — generated from committed benchmark
   * artifacts — so it renders on first paint with no run and no network call.
   * It used to be read from the response, which meant the one panel that must
   * always be visible showed a server-error message until a screen was run.
   */
  const limitations = SCREEN_LIMITATIONS;

  const axisMismatch = useMemo(() => axisMismatchLimitation(), []);

  return (
    <div className="neglect-page">
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · neglect screen</div>
        <h1>{NEGLECT_SCREEN_COPY.title}</h1>
        <p className="hero-sub">{NEGLECT_SCREEN_COPY.intro}</p>
      </div>

      <section className="neglect-banner">
        <h2>Read this before the table</h2>
        <p className="validation-line">{NEGLECT_SCREEN_COPY.notOpportunities}</p>
        <p className="validation-line">{NEGLECT_SCREEN_COPY.evidenceAxis}</p>
        <p className="validation-line">{NEGLECT_SCREEN_COPY.effortIsAFilter}</p>
        <p className="validation-line">
          <strong>{NEGLECT_SCREEN_COPY.unknownIsNotZero}</strong>
        </p>
        <div className="validation-source">
          Full measured performance of every score on the{" "}
          <Link to="/validation">validation page</Link>.
        </div>
      </section>

      <section className="neglect-section neglect-priorart">
        <h2>{NEGLECT_SCREEN_COPY.priorArtTitle}</h2>
        {NEGLECT_SCREEN_COPY.priorArt.split("\n").map((line, i) => (
          <p className="validation-line" key={i}>
            {line}
          </p>
        ))}
        <div className="validation-source">
          <a
            href={NEGLECT_SCREEN_COPY.priorArtHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {NEGLECT_SCREEN_COPY.priorArtLinkLabel} ↗
          </a>
        </div>
      </section>

      <section className="neglect-controls">
        <label htmlFor="neglect-diseases">
          Disease, or several (one per line, or comma separated)
        </label>
        <textarea
          id="neglect-diseases"
          rows={3}
          value={input}
          placeholder={"tuberculosis\nvisceral leishmaniasis\nrheumatic heart disease"}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" onClick={run} disabled={state.status === "running" || !input.trim()}>
          {state.status === "running" ? "Screening…" : "Run screen"}
        </button>
      </section>

      {state.status === "error" && (
        <div className="neglect-error" role="alert">
          {state.error}
        </div>
      )}

      {state.data?.burdenAsset && (
        <section className="neglect-section">
          <h2>Burden source</h2>
          {state.data.burdenAsset.available ? (
            <>
              <p className="validation-line">
                {state.data.burdenAsset.country}, {state.data.burdenAsset.referenceYear}.{" "}
                {fmtInt(Math.round(state.data.burdenAsset.totalDalyThousands))}k DALYs across all
                causes, population {fmtInt(Math.round(state.data.burdenAsset.populationThousands))}
                k. {state.data.burdenAsset.nDiseases} diseases have an accepted mapping.
              </p>
              <p className="validation-line">
                Mapping coverage:{" "}
                {fmt(100 * (state.data.burdenAsset.mappingCoverage?.mapping_rate ?? 0), 1)}% of
                non-aggregate causes. An unmapped disease shows burden as unavailable, never as a
                default or an interpolation.
              </p>
              <p className="validation-line">{NEGLECT_SCREEN_COPY.burdenSourceCaveat}</p>
              <div className="validation-source">
                Source: <code>{state.data.burdenAsset.source?.dataset}</code>
              </div>
            </>
          ) : (
            <p className="validation-line">
              The India burden asset is not built in this deployment, so burden shows as unavailable
              throughout.
            </p>
          )}
        </section>
      )}

      {(state.data?.diseases || []).map((d) => (
        <section className="neglect-section" key={d.query}>
          <h2>
            {d.disease?.name || d.query}
            {d.disease?.id ? <code className="neglect-eid">{d.disease.id}</code> : null}
          </h2>

          {d.error ? (
            <p className="validation-line">No result: {d.error}</p>
          ) : (
            <>
              {/* Part 5: the ranking is unvalidated outside oncology, and the
                  screen's intended use is high-burden Indian disease, most of
                  which is not cancer. Shown here, not only in the panel below. */}
              {isNonCancerDisease(d.disease?.id) && axisMismatch ? (
                <div className="neglect-inline-warning" role="note">
                  <strong>Outside the validated range.</strong> The committed labelling marks{" "}
                  {d.disease?.name || d.query} as non-cancer. The evidence model was validated on
                  a panel where {VALIDATION_PANEL.cancerDiseases} of the{" "}
                  {VALIDATION_PANEL.contributingDiseases} contributing held-out diseases were
                  cancers, and on the one non-cancer disease it did not beat counting publications
                  ({VALIDATION_PANEL.nonCancerRocAucPubCountOnly} against{" "}
                  {VALIDATION_PANEL.nonCancerRocAucEvidenceModel}). Treat the order of the rows
                  below as unvalidated.
                  <div className="validation-source">
                    Source: <code>{axisMismatch.source}</code>
                  </div>
                </div>
              ) : null}

              <p className="validation-line">
                India burden: <BurdenCell burden={d.burden} />
                {d.counts ? (
                  <>
                    {" · "}
                    {d.counts.considered} targets considered · {d.rows.length} shown ·{" "}
                    {d.counts.active} filtered out as active ·{" "}
                    <span title={NEGLECT_SCREEN_COPY.unknownIsNotZero}>
                      {d.counts.unknown} excluded as unknown effort
                    </span>
                  </>
                ) : null}
              </p>

              {d.rows.length === 0 ? (
                <p className="validation-line">
                  No target for this disease has strong evidence and no recorded chemistry. That is
                  a result, not an error.
                </p>
              ) : (
                <div className="neglect-table-wrap">
                  <table className="neglect-table">
                    <thead>
                      <tr>
                        <th>Target</th>
                        <th title={NEGLECT_SCREEN_COPY.evidenceAxis}>Evidence score</th>
                        <th>Effort tier</th>
                        <th>Compounds (2021)</th>
                        <th>Drugs</th>
                        <th>Publications</th>
                        <th>India DALYs</th>
                        <th className="context-col" title={NEGLECT_SCREEN_COPY.contextOnly}>
                          pLI
                        </th>
                        <th className="context-col" title={NEGLECT_SCREEN_COPY.contextOnly}>
                          LOEUF
                        </th>
                        <th className="context-col" title={NEGLECT_SCREEN_COPY.contextOnly}>
                          DepMap
                        </th>
                        <th className="context-col" title={NEGLECT_SCREEN_COPY.contextOnly}>
                          GTEx τ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={r.ensemblId || r.symbol}>
                          <td>
                            <b>{r.symbol}</b>
                            <div className="neglect-name">{r.name}</div>
                          </td>
                          <td className="mono">{fmt(r.evidenceScore)}</td>
                          <td>
                            <span className={`effort-tier effort-${r.effortTier}`} title={r.effortReason}>
                              {TIER_LABEL[r.effortTier] || r.effortTier}
                            </span>
                          </td>
                          <td className="mono">
                            {r.hqCompounds2021 === null ? (
                              <span title={NEGLECT_SCREEN_COPY.unknownIsNotZero}>unknown</span>
                            ) : (
                              fmtInt(r.hqCompounds2021)
                            )}
                          </td>
                          <td className="mono">{fmtInt(r.drugCount)}</td>
                          <td className="mono">{fmtInt(r.publicationCount)}</td>
                          <td>
                            <BurdenCell burden={d.burden} />
                          </td>
                          <td className="mono context-col">{fmt(r.context?.pli, 2)}</td>
                          <td className="mono context-col">{fmt(r.context?.loeuf, 2)}</td>
                          <td className="mono context-col">
                            {fmt(r.context?.depmapMeanGeneEffect, 2)}
                          </td>
                          <td className="mono context-col">{fmt(r.context?.gtexTau, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="validation-line context-note">{NEGLECT_SCREEN_COPY.contextOnly}</p>

                  <div className="neglect-checks">
                    <h3>Prior-art checks, per target</h3>
                    <p className="validation-line nc-statement">
                      <strong>{NEGLECT_SCREEN_COPY.cannotEstablishUnpursued}</strong>
                    </p>
                    <p className="validation-line context-note">
                      {NEGLECT_SCREEN_COPY.checklistNote}
                    </p>
                    <ul className="neglect-check-targets">
                      {d.rows.map((r) => (
                        <li key={`chk-${r.ensemblId || r.symbol}`}>
                          <span className="nc-symbol">{r.symbol}</span>
                          <TargetChecklist
                            symbol={r.symbol}
                            proteinName={r.name}
                            ensemblId={r.ensemblId}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ))}

      <section className="neglect-section">
        <h2>What this screen cannot know</h2>
        <ul className="neglect-limitations">
          {limitations.map((l) => (
            <li key={l.id}>
              <strong>{l.title}.</strong> {l.detail}
              {l.source ? (
                <div className="validation-source">
                  Source: <code>{l.source}</code>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
