import React from "react";
import { Link } from "react-router-dom";
import SeoIntroLinks from "./SeoIntroLinks";
import {
  VALIDATION_COMMIT_SHORT,
  VALIDATION_GENERATED_AT,
  VALIDATION_GENERATOR,
  VALIDATION_INTRO,
  VALIDATION_SECTIONS,
} from "./shared/validationCopy";
import "./validation.css";

/**
 * Public record of how every score in the app performs on held-out data.
 *
 * All copy comes from src/shared/validationCopy.js, which is checked against
 * the committed benchmark artifacts by src/methodologyProvenance.test.js. No
 * figure is computed here.
 */
export default function ValidationPage() {
  return (
    <div className="validation-page">
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · validation</div>
        <h1>Measured performance of every score</h1>
        <p className="hero-sub">{VALIDATION_INTRO}</p>
      </div>

      <div className="validation-meta">
        Figures on this page were produced by <code>{VALIDATION_GENERATOR}</code> at{" "}
        <code>{VALIDATION_GENERATED_AT}</code>, from commit{" "}
        <code>{VALIDATION_COMMIT_SHORT}</code>. Each section names the file it comes from.
        The generator, timestamp and commit are read from the shipped weights asset at build
        time, so the page cannot quote a run it did not come from.
      </div>

      {VALIDATION_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="validation-section">
          <h2>{section.title}</h2>
          {section.body.split("\n").map((line, i) => (
            <p key={i} className="validation-line">
              {line}
            </p>
          ))}
          <div className="validation-source">
            Source: <code>{section.source}</code> · commit <code>{VALIDATION_COMMIT_SHORT}</code>
          </div>
        </section>
      ))}

      <section className="validation-section">
        <h2>How to read these numbers</h2>
        <p className="validation-line">
          ROC-AUC 0.500 is chance. A score close to it carries no information. PR-AUC matters more
          than ROC-AUC here because positives are rare: the target benchmark has a 2.2% base rate, so
          a PR-AUC of 0.052 against a 0.022 base rate is a real but small improvement.
        </p>
        <p className="validation-line">
          The progression model puts most of its weight on the literature feature, so it behaves
          largely as a publication-count proxy. Publication count alone scores ROC-AUC 0.667 against
          the model's 0.708.
        </p>
        <p className="validation-line">
          Retrospective validation asks whether a 2021 score predicted what happened by 2026. It does
          not establish that a high-scoring target today will yield a drug.
        </p>
      </section>

      <div className="validation-footer">
        <Link to="/methodology">Methodology</Link> · <Link to="/">Run a screen</Link>
      </div>

      <SeoIntroLinks />
    </div>
  );
}
