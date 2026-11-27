import React from "react";
import { Link } from "react-router-dom";
import { dockingStatusFromFlags } from "./shared/dockingStatus";
import { MEASURED } from "./shared/validationCopy";
import HeroVisual from "./HeroVisual";

/** Derived once: the only place docking status is written is dockingStatus.js. */
const DOCKING_STATUS = dockingStatusFromFlags();

const STEPS = [
  { n: "1", title: "Pick a protein target", detail: "RCSB PDB, gene, or disease handoff" },
  { n: "2", title: "Add 2–5 compounds", detail: "PubChem search & drug-likeness pre-check" },
  { n: "3", title: "Rank & follow up", detail: "Similarity to the bound ligand, then ADME" },
];

/**
 * The two readouts flanking the hero visual.
 *
 * Both describe THIS workflow — staging a structure and ranking compounds
 * against it. The repurposing model's 0.910 is the strongest figure in the
 * repository and would look better here, but it scores targets rather than
 * compounds and belongs to a different page; putting it on the compound
 * workflow would attach the best number to work it did not measure.
 *
 * Every value comes from MEASURED, so the hero cannot drift from /validation.
 */
const SIGNALS = [
  {
    id: "01",
    label: "Compound ranking",
    detail: "Tanimoto to the bound ligand",
    value: MEASURED.compoundTriage.tanimoto,
    unit: "held-out ROC-AUC",
    /** Bars filled out of 10, from the figure itself. Not a quality rating. */
    fill: Math.round(Number(MEASURED.compoundTriage.tanimoto) * 10),
  },
  {
    id: "02",
    label: "Triage filter",
    detail: `heuristic-v2 · vs ${MEASURED.compoundTriage.random} random`,
    value: MEASURED.compoundTriage.heuristicV2,
    unit: "held-out ROC-AUC",
    fill: Math.round(Number(MEASURED.compoundTriage.heuristicV2) * 10),
  },
];

export default function HomepageIntro({ onLoadDemo, onStartBlank, demoLoading }) {
  return (
    <div className="hero hero-v2">
      <section className="hero-stage" aria-labelledby="hero-title">
        <div className="hero-stage-copy">
          <div className="hero-eyebrow">TargetForge · computational drug discovery</div>
          <h1 id="hero-title" className="hero-display">
            Rank compounds against a protein target
          </h1>
          <p className="hero-lead">
            Stage a structure, shortlist molecules, and rank them by similarity to the co-crystallised
            ligand before ADME follow-up.
          </p>
          <p className="hero-claim">
            Every score here has been measured on held-out data — including the ones that failed and
            were removed. The numbers are on the{" "}
            <Link to="/validation">validation page</Link>.
          </p>

          <div className="intro-actions intro-actions-primary">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onLoadDemo}
              disabled={demoLoading}
              aria-busy={demoLoading}
            >
              {demoLoading ? "Loading demo…" : "One-click demo: EGFR screen"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onStartBlank}>
              Start with a blank screen
            </button>
          </div>
          <p className="intro-demo-note">
            Stages EGFR (<span className="mono">1M17</span>), compares <strong>imatinib</strong> (weak on
            EGFR) with <strong>osimertinib</strong> (EGFR inhibitor), and runs the triage ranking — a quick
            walkthrough with no manual PDB search.
          </p>
        </div>

        <div className="hero-stage-figure">
          <HeroVisual />

          <div className="hero-signal hero-signal-left">
            <div className="hero-signal-head">
              <span className="hero-dot" />
              <span className="hero-signal-id">Signal {SIGNALS[0].id}</span>
            </div>
            <div className="hero-signal-label">{SIGNALS[0].label}</div>
            <div className="hero-signal-detail">{SIGNALS[0].detail}</div>
            <div className="hero-bars" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < SIGNALS[0].fill ? "on" : ""} />
              ))}
            </div>
            <div className="hero-signal-value">
              {SIGNALS[0].value} <span>{SIGNALS[0].unit}</span>
            </div>
          </div>

          <div className="hero-signal hero-signal-right">
            <div className="hero-signal-head">
              <span className="hero-dot" />
              <span className="hero-signal-id">Signal {SIGNALS[1].id}</span>
            </div>
            <div className="hero-signal-label">{SIGNALS[1].label}</div>
            <div className="hero-signal-detail">{SIGNALS[1].detail}</div>
            <div className="hero-bars" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < SIGNALS[1].fill ? "on" : ""} />
              ))}
            </div>
            <div className="hero-signal-value">
              {SIGNALS[1].value} <span>{SIGNALS[1].unit}</span>
            </div>
          </div>

          <div className="hero-status">
            <div className="hero-status-left">
              <div className="hero-signal-head">
                <span className="hero-dot" />
                <span className="hero-signal-id">System status</span>
              </div>
              <div className="hero-status-line">{DOCKING_STATUS.short}</div>
              <div className="hero-ticks" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            </div>
            <div className="hero-status-figure">
              <div className="hero-status-caption">
                Compound ranking
                <br />
                held-out ROC-AUC
              </div>
              <div className="hero-bignum">{MEASURED.compoundTriage.tanimoto}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="hero-steps-section">
        <h2 className="intro-section-title">How it works</h2>
        <ol className="intro-steps intro-steps-three" aria-label="How a screen works">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="intro-step-n">{step.n}</span>
              <span>
                <strong>{step.title}</strong>
                <span className="intro-step-detail">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="intro-methodology-link">
          Station-by-station detail, scoring rules, and validation notes live on{" "}
          <Link to="/methodology#staging-bench">Methodology</Link>.
        </p>
      </section>
    </div>
  );
}
