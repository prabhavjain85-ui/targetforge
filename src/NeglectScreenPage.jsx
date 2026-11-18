import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { runNeglectScreen } from "./serverApi";
import { NEGLECT_SCREEN_COPY } from "./shared/validationCopy";
import {
  SCOPE_IN,
  SCREEN_LIMITATIONS,
  VALIDATION_PANEL,
  axisMismatchLimitation,
  burdenForDisease,
  scopeForDisease,
} from "./shared/screenLimitations";
import DiseaseTypeahead from "./shared/DiseaseTypeahead";
import NeglectScatter from "./NeglectScatter";
import TargetChecklist from "./NeglectChecklist";
import "./validation.css";
import "./neglectScreen.css";

/**
 * Targets with strong evidence and little recorded medicinal chemistry, shown
 * against India's disease burden.
 *
 * The page's honesty is the point of it. Two rules govern the presentation and
 * neither is negotiable for the sake of looks:
 *
 *   Nothing here is styled as desirable. Task 8 measured low prior effort as
 *   predicting AGAINST clinical progression, so there is no green, no
 *   highlight, no "opportunity" language and no ranking vocabulary implying a
 *   winner. The scatter's low-effort edge carries a printed caveat saying so.
 *
 *   Every caveat that was on this page stays on it and stays findable. What
 *   changed is that the detail moved into the always-rendered limitations panel
 *   instead of stacking three bold paragraphs above the input, so each sentence
 *   lives in exactly one place and the lead reads as a lead.
 */

const TIER_LABEL = {
  none: "No recorded effort",
  minimal: "Minimal effort",
  active: "Active",
  unknown: "Unknown",
};

/**
 * Presets chosen to be honest about the tension rather than flattering: one
 * cancer, which the ranking was validated on, and four high-burden Indian
 * conditions which it was not. Each renders its own scope badge, so the
 * mismatch is visible before anything is run.
 */
const PRESETS = [
  { id: "MONDO_0005002", name: "chronic obstructive pulmonary disease", isOncology: false },
  { id: "MONDO_0005015", name: "diabetes mellitus", isOncology: false },
  { id: "MONDO_0018076", name: "tuberculosis", isOncology: false },
  { id: "MONDO_0006955", name: "rheumatic heart disease", isOncology: false },
  { id: "MONDO_0007254", name: "breast cancer", isOncology: true },
  { id: "MONDO_0018177", name: "glioblastoma", isOncology: true },
];

const fmt = (n, digits = 1) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(digits);

const fmtInt = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-IN");

/** DALYs arrive in thousands, as published, and are shown as published. */
function BurdenCell({ burden }) {
  if (!burden || !burden.available) {
    return (
      <span className="burden-unavailable" title={burden?.reason || "unknown"}>
        burden unavailable
      </span>
    );
  }
  return (
    <span className="burden-value" title={`WHO GHE cause: ${burden.gheCause || burden.gheLabel}`}>
      {fmtInt(Math.round(burden.dalyThousands))}k DALYs
    </span>
  );
}

function ScopeBadge({ scope }) {
  const inScope = scope.badge === SCOPE_IN;
  return (
    <span
      className={`ns-scope ${inScope ? "ns-scope-in" : "ns-scope-out"}`}
      title={`Basis: ${scope.basis}`}
    >
      {scope.badge}
    </span>
  );
}

export default function NeglectScreenPage() {
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState([]);
  const [state, setState] = useState({ status: "idle", data: null, error: "" });
  const [focusRow, setFocusRow] = useState(null);
  const rowRefs = useRef({});

  const limitations = SCREEN_LIMITATIONS;
  const axisMismatch = useMemo(() => axisMismatchLimitation(), []);

  /** Each chip carries its resolved identity, burden and validated-scope status. */
  const chips = useMemo(
    () =>
      picked.map((d) => ({
        ...d,
        burden: burdenForDisease(d.id),
        scope: scopeForDisease(d),
      })),
    [picked]
  );

  const addDisease = useCallback((hit) => {
    if (!hit || !hit.id) return;
    setPicked((prev) => (prev.some((p) => p.id === hit.id) ? prev : [...prev, hit]));
    setInput("");
  }, []);

  const removeDisease = useCallback((id) => {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const run = useCallback(async () => {
    if (!picked.length) return;
    setState({ status: "running", data: null, error: "" });
    setFocusRow(null);
    try {
      const data = await runNeglectScreen(picked.map((p) => p.name));
      setState({ status: "done", data, error: "" });
    } catch (err) {
      setState({ status: "error", data: null, error: String(err?.message || err) });
    }
  }, [picked]);

  /** Clicking a scatter point brings the matching table row into view. */
  const onPointClick = useCallback((point) => {
    const key = point.ensemblId || point.symbol;
    setFocusRow(key);
    const el = rowRefs.current[key];
    if (el && typeof el.scrollIntoView === "function") {
      const reduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }
  }, []);

  const outOfScopeChips = chips.filter((c) => c.scope.badge !== SCOPE_IN);

  return (
    <div className="neglect-page">
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · neglect screen</div>
        <h1>{NEGLECT_SCREEN_COPY.title}</h1>
        <p className="hero-sub">{NEGLECT_SCREEN_COPY.intro}</p>
      </div>

      {/* One lead paragraph, normal prose, one bolded phrase. The detail it
          used to carry lives once each in the limitations panel below. */}
      <p className="ns-lead">
        This screen lists targets with substantial biological evidence for a disease and little or
        no recorded medicinal chemistry, ranked by evidence and weighted by India&apos;s disease
        burden. <strong>They are not opportunities</strong>: a target with good biology and no
        compounds is usually one the field has already looked at and left, and the reasons are
        rarely published. What the ranking can and cannot support is set out below the results.
      </p>

      <section className="ns-card ns-input-card">
        <h2 className="ns-card-title">Diseases</h2>

        <DiseaseTypeahead
          value={input}
          onChange={setInput}
          onSelect={addDisease}
          placeholder="Search a disease (e.g. tuberculosis, glioblastoma)"
          listId="neglect-disease-suggest"
          inputId="neglect-diseases"
        />

        <div className="ns-presets">
          <span className="ns-presets-label">Or start from:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ns-preset"
              onClick={() => addDisease(p)}
              disabled={picked.some((x) => x.id === p.id)}
            >
              {p.name}
              <ScopeBadge scope={scopeForDisease(p)} />
            </button>
          ))}
        </div>

        {chips.length > 0 && (
          <ul className="ns-chips">
            {chips.map((c) => (
              <li className="ns-chip" key={c.id}>
                <span className="ns-chip-name" title={c.id}>
                  {c.name}
                </span>
                <span className="ns-chip-burden">
                  {c.burden.available ? (
                    `${fmtInt(Math.round(c.burden.dalyThousands))}k DALYs`
                  ) : (
                    <span className="burden-unavailable">burden unavailable</span>
                  )}
                </span>
                <ScopeBadge scope={c.scope} />
                <button
                  type="button"
                  className="ns-chip-remove"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => removeDisease(c.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {outOfScopeChips.length > 0 && (
          <p className="ns-scope-note">
            {outOfScopeChips.length === 1 ? "One selection is" : `${outOfScopeChips.length} selections are`}{" "}
            outside the range the evidence ranking was validated on. It was validated on a panel
            where {VALIDATION_PANEL.cancerDiseases} of {VALIDATION_PANEL.contributingDiseases}{" "}
            contributing held-out diseases were cancers.
          </p>
        )}

        <div className="ns-actions">
          <button
            type="button"
            className="btn btn-target ns-primary"
            onClick={run}
            disabled={state.status === "running" || picked.length === 0}
          >
            {state.status === "running" ? <span className="spinner" /> : null}
            {state.status === "running" ? "Screening…" : "Run screen"}
          </button>
          {picked.length > 0 && (
            <button type="button" className="ns-clear" onClick={() => setPicked([])}>
              Clear
            </button>
          )}
        </div>
      </section>

      {state.status === "error" && (
        <div className="neglect-error" role="alert">
          {state.error}
        </div>
      )}

      {state.status === "idle" && (
        <section className="ns-card ns-empty">
          <p className="validation-line">{NEGLECT_SCREEN_COPY.emptyState}</p>
        </section>
      )}

      {state.data?.burdenAsset && (
        <section className="ns-card">
          <h2 className="ns-card-title">Burden source</h2>
          {state.data.burdenAsset.available ? (
            <>
              <p className="validation-line">
                {state.data.burdenAsset.country}, {state.data.burdenAsset.referenceYear}.{" "}
                {fmtInt(Math.round(state.data.burdenAsset.totalDalyThousands))}k DALYs across all
                causes, population {fmtInt(Math.round(state.data.burdenAsset.populationThousands))}k.{" "}
                {state.data.burdenAsset.nDiseases} diseases have an accepted mapping, covering{" "}
                {fmt(100 * (state.data.burdenAsset.mappingCoverage?.mapping_rate ?? 0), 1)}% of
                non-aggregate causes; an unmapped disease shows burden as unavailable rather than a
                default.
              </p>
              <p className="validation-line context-note">
                {NEGLECT_SCREEN_COPY.burdenSourceCaveat}
              </p>
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

      {state.data?.diseases?.some((d) => !d.error && d.rows?.length) && (
        <section className="ns-card">
          <h2 className="ns-card-title">Effort against evidence</h2>
          <NeglectScatter diseases={state.data.diseases} onPointClick={onPointClick} />
        </section>
      )}

      {(state.data?.diseases || []).map((d) => (
        <section className="ns-card" key={d.query}>
          <h2 className="ns-card-title">
            {d.disease?.name || d.query}
            {d.disease?.id ? <code className="neglect-eid">{d.disease.id}</code> : null}
          </h2>

          {d.error ? (
            <p className="validation-line">No result: {d.error}</p>
          ) : (
            <>
              {!scopeForDisease({ id: d.disease?.id }).inScope && axisMismatch ? (
                <div className="neglect-inline-warning" role="note">
                  <strong>Outside the validated range.</strong> The evidence model was validated on
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

              <p className="validation-line ns-counts">
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
                        <th>Evidence score</th>
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
                      {d.rows.map((r) => {
                        const key = r.ensemblId || r.symbol;
                        return (
                          <tr
                            key={key}
                            ref={(el) => {
                              rowRefs.current[key] = el;
                            }}
                            className={focusRow === key ? "ns-row-focused" : undefined}
                          >
                            <td>
                              <b>{r.symbol}</b>
                              <div className="neglect-name">{r.name}</div>
                            </td>
                            <td className="mono">{fmt(r.evidenceScore)}</td>
                            <td>
                              <span
                                className={`effort-tier effort-${r.effortTier}`}
                                title={r.effortReason}
                              >
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
                        );
                      })}
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

      <section className="ns-card neglect-priorart">
        <h2 className="ns-card-title">{NEGLECT_SCREEN_COPY.priorArtTitle}</h2>
        {NEGLECT_SCREEN_COPY.priorArt.split("\n").map((line, i) => (
          <p className="validation-line" key={i}>
            {line}
          </p>
        ))}
        <div className="validation-source">
          <a href={NEGLECT_SCREEN_COPY.priorArtHref} target="_blank" rel="noopener noreferrer">
            {NEGLECT_SCREEN_COPY.priorArtLinkLabel} ↗
          </a>
        </div>
      </section>

      <section className="ns-card">
        <h2 className="ns-card-title">What this screen cannot know</h2>
        <p className="validation-line context-note">
          Every figure below is read from a committed benchmark file. Measured performance of every
          score is on the <Link to="/validation">validation page</Link>.
        </p>
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
