import React from "react";
import { Link } from "react-router-dom";
import { CopyField, Panel } from "./benchUi";
import AdversarialCritique from "./AdversarialCritique";
import QuantumInsight from "./QuantumInsight";
import { CandidateScoreTable } from "./CandidateViews";
import HistoricalTrialSuccessContext from "./HistoricalTrialSuccessContext";
import { DOCKING_ENGINE_ENABLED, DOCKING_ENABLED, DOCKING_UNAVAILABLE_NOTICE } from "./featureFlags";
import ReportExportButtons from "./ReportExportButtons";
import { buildBenchReportMarkdown, defaultReportFilename } from "./reportExport";

export default function HandoffStations({ b }) {
  const {
    protein, candidates, aiLoading, aiError, aiResult, setHandoffCid,
    aiSort, recommendedCid, rankingRows, fitTargetName, fitPdbId,
    compound, smiles, winner, winnerCandidate, analyze, toggleAiSort,
  } = b;
  return (
    <>
      <div className="handoff-panel">
        <Panel eyebrow="Station 3 — Ranking and filters" title="How do these molecules compare?" kind="handoff">
          <div className="ai-toolbar">
            <div>
              <div className="ai-kicker">Rank the shortlist for this target</div>
              <div className="hint" style={{ margin: "6px 0 0" }}>
                Ranks 2–5 molecules by Tanimoto similarity to the ligand co-crystallised in the selected PDB structure, which is the best-performing ranker measured on the scaffold-split decoy benchmark (ROC-AUC 0.662 against 0.523 for heuristic-v2 and 0.520 for random). The heuristic-v2 score shown alongside is a drug-likeness and liability filter built from Lipinski/Veber properties and PAINS flags; on held-out chemistry its target rules do not fire, and it does not predict binding or activity. If an OpenAI key is configured, a language model writes the comparison.
              </div>
            </div>
            <button className="btn btn-handoff" onClick={analyze} disabled={candidates.length < 2 || aiLoading} type="button">
              {aiLoading ? <span className="spinner" /> : null}
              {aiLoading ? "Analyzing…" : `Analyze ${candidates.length || ""} candidate${candidates.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {aiError && <div className="error-msg">{aiError}</div>}
          {!aiResult && !aiLoading && (
            <div className="empty-state">
              Select 2–5 molecules in Station 2, then run analysis. TargetForge will score each compound for the staged target — not as a universal drug-likeness rank.
            </div>
          )}
          {aiResult && (
            <div className="score-block">
              <div className="recommend compact">
                <div className="recommend-label">Best fit for this structure</div>
                <div className="winner">
                  {fitPdbId
                    ? `Best fit for ${fitTargetName || "this target"} (${fitPdbId})`
                    : "Best fit (no structure selected — scores are not pocket-specific)"}
                </div>
                <div className="winner-score">
                  {winner?.displayName || (recommendedCid ? `CID ${recommendedCid}` : "—")} · {aiResult.recommended?.score ?? "—"}/100
                </div>
                <div className="winner-reason">{aiResult.recommended?.reason}</div>
                {winnerCandidate && (
                  <div style={{ marginTop: 10 }}>
                    <AdversarialCritique
                      candidate={winnerCandidate}
                      target={protein}
                      label="See the case against this top candidate"
                    />
                  </div>
                )}
              </div>
              <CandidateScoreTable
                rows={rankingRows}
                selectedCid={compound?.CID}
                recommendedCid={recommendedCid}
                sortKey={aiSort.key}
                sortDir={aiSort.dir}
                onSort={toggleAiSort}
                onSelect={setHandoffCid}
                target={protein}
                candidates={candidates}
              />
              <HistoricalTrialSuccessContext target={protein} />
              <div className="lipinski-note" style={{ marginTop: 12 }}>{aiResult.summary}</div>
              <div className="lipinski-note"><strong>Limitations:</strong> {(aiResult.limitations || []).join(" ")}</div>
              <div className="source-pill">
                {aiResult.source === "llm"
                  ? "Ranked with OpenAI for this specific target"
                  : aiResult.source === "cache"
                    ? "Reused cached scores for this (compound, PDB) pair"
                    : "Ranked by similarity to the co-crystallised ligand"}
              </div>
              <ReportExportButtons
                label="Export report"
                filename={defaultReportFilename(
                  "staging-bench-report",
                  protein?.id || protein?.pdb_id || fitPdbId
                )}
                getMarkdown={() =>
                  buildBenchReportMarkdown({
                    protein,
                    candidates,
                    aiResult,
                  })
                }
              />
            </div>
          )}
        </Panel>
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 4 — handoff" title="Follow-up: ADME prediction (docking paused)" kind="handoff">
          {!protein && !candidates.length && (
            <div className="empty-state">
              Stage a target and a shortlist above — TargetForge will prepare inputs for ADME prediction.
              Molecular docking is temporarily unavailable during validation.
            </div>
          )}
          {(protein || candidates.length > 0) && (
            <div>
              <div className="lipinski-note" style={{ marginTop: 0, marginBottom: 14 }}>
                Use the handoff below for ADME on your selected compound. Neither the similarity ranking nor the drug-likeness filter replaces experimental assays or ADME modelling.
              </div>
              {candidates.length > 1 && (
                <div className="handoff-pick">
                  {candidates.map((c) => (
                    <button
                      key={c.CID}
                      type="button"
                      className={"chip" + (String(compound?.CID) === String(c.CID) ? " active" : "")}
                      onClick={() => setHandoffCid(c.CID)}
                    >
                      {c.displayName}{String(recommendedCid) === String(c.CID) ? " · AI pick" : ""}
                    </button>
                  ))}
                </div>
              )}
              {protein && <CopyField label="Target — PDB ID" value={protein.id} />}
              {compound && <CopyField label={`${compound.displayName} — SMILES`} value={smiles} />}
              {compound && smiles && (
                <div style={{ marginTop: 14 }}>
                  <QuantumInsight compound={compound} smiles={smiles} protein={protein} />
                </div>
              )}
              <div className="handoff-actions">
                {DOCKING_ENABLED || DOCKING_ENGINE_ENABLED ? (
                  <Link
                    to={`/docking?pdb=${encodeURIComponent(protein?.id || "")}&smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                    className="btn btn-primary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Run Native Docking →
                  </Link>
                ) : (
                  <span className="lipinski-note" style={{ margin: 0, flex: "1 1 100%" }}>
                    {DOCKING_UNAVAILABLE_NOTICE}
                  </span>
                )}
                <Link
                  to={`/adme?smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                  className={DOCKING_ENABLED || DOCKING_ENGINE_ENABLED ? "btn btn-secondary" : "btn btn-primary"}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Predict Native ADME →
                </Link>
              </div>
              <div className="lipinski-note" style={{ marginTop: 14 }}>
                ADME descriptors are computed on the TargetForge backend via RDKit.
                Docking poses and binding scores are not available while the docking engine is under validation.
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
