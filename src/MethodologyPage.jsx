import React, { useState, useEffect } from "react";
import SeoIntroLinks from "./SeoIntroLinks";
import { dockingStatusFromFlags, VINA_MEASURED } from "./shared/dockingStatus";
import {
  MEASURED,
  NEGLECT_SCREEN_COPY,
  SITE_COPY,
  VALIDATION_SOURCES,
} from "./shared/validationCopy";

/** Derived once: the only place docking status is written is dockingStatus.js. */
const DOCKING_STATUS = dockingStatusFromFlags();

export default function MethodologyPage() {
  const [activeSection, setActiveSection] = useState("pdb-target-score");

  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = [
        "staging-bench",
        "pdb-target-score",
        "pains-screening",
        "target-aware-scoring",
        "target-discovery",
        "repurposing-screen",
        "validation-benchmark",
        "neglect-screen",
        "prior-art",
        "adme-profiling",
        "molecule-local-search",
        "clinical-disclaimer",
      ];

      const scrollPosition = window.scrollY + 140;

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setActiveSection(sectionIds[i]);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="methodology-container" id="methodology-page">
      {/* Page Header */}
      <div className="methodology-header-block" id="methodology-header">
        <div className="methodology-meta-tag">Scientific Methodology &amp; Validation Transparency</div>
        <h1 className="methodology-title">Evaluation Criteria, Computational Heuristics &amp; Operational Boundaries</h1>
        <p className="methodology-lead">
          TargetForge is an early-stage computational workbench for hit triage and structural evaluation. This
          document details scoring criteria, cheminformatics rules, design choices, and operational boundaries.
          <br />
          <strong>{SITE_COPY.notAi}</strong>
        </p>
        {/*
          The authoritative source, stated once and prominently. This page is
          narrative; /validation is generated from the committed artifacts, and
          when the two disagree the validation page is right.
        */}
        <div className="methodology-validation-callout" id="methodology-validation-link">
          <strong>
            <a href="/validation">The validation page</a>
          </strong>{" "}
          is the authoritative source for every number on this site. It is generated from the committed benchmark
          artifacts and lists the measured held-out performance of every score, including the ones that failed
          validation and were removed. Figures quoted on this page are interpolated from the same constants.
        </div>
        <SeoIntroLinks currentPath="/methodology" />
      </div>

      <div className="methodology-layout">
        {/* Sticky Table of Contents Sidebar */}
        <aside className="methodology-sidebar" id="methodology-sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-heading">Contents</div>
            <nav className="sidebar-nav" aria-label="Methodology sections">
              <button
                type="button"
                id="toc-link-staging-bench"
                className={`sidebar-link ${activeSection === "staging-bench" ? "active" : ""}`}
                onClick={() => scrollToSection("staging-bench")}
              >
                <span className="sidebar-num">00</span> Discovery Staging Bench
              </button>
              <button
                type="button"
                id="toc-link-pdb"
                className={`sidebar-link ${activeSection === "pdb-target-score" ? "active" : ""}`}
                onClick={() => scrollToSection("pdb-target-score")}
              >
                <span className="sidebar-num">01</span> PDB Target Selection
              </button>
              <button
                type="button"
                id="toc-link-pains"
                className={`sidebar-link ${activeSection === "pains-screening" ? "active" : ""}`}
                onClick={() => scrollToSection("pains-screening")}
              >
                <span className="sidebar-num">02</span> PAINS &amp; Toxicophores
              </button>
              <button
                type="button"
                id="toc-link-scoring"
                className={`sidebar-link ${activeSection === "target-aware-scoring" ? "active" : ""}`}
                onClick={() => scrollToSection("target-aware-scoring")}
              >
                <span className="sidebar-num">03</span> Target-Aware Ranking
              </button>
              <button
                type="button"
                id="toc-link-discovery"
                className={`sidebar-link ${activeSection === "target-discovery" ? "active" : ""}`}
                onClick={() => scrollToSection("target-discovery")}
              >
                <span className="sidebar-num">04</span> Target Discovery
              </button>
              <button
                type="button"
                id="toc-link-repurposing"
                className={`sidebar-link ${activeSection === "repurposing-screen" ? "active" : ""}`}
                onClick={() => scrollToSection("repurposing-screen")}
              >
                <span className="sidebar-num">05</span> Repurposing Screen
              </button>
              <button
                type="button"
                id="toc-link-validation"
                className={`sidebar-link ${activeSection === "validation-benchmark" ? "active" : ""}`}
                onClick={() => scrollToSection("validation-benchmark")}
              >
                <span className="sidebar-num">06</span> Validation Benchmark
              </button>
              <button
                type="button"
                id="toc-link-neglect-screen"
                className={`sidebar-link ${activeSection === "neglect-screen" ? "active" : ""}`}
                onClick={() => scrollToSection("neglect-screen")}
              >
                <span className="sidebar-num">07</span> Neglect Screen
              </button>
              <button
                type="button"
                id="toc-link-prior-art"
                className={`sidebar-link ${activeSection === "prior-art" ? "active" : ""}`}
                onClick={() => scrollToSection("prior-art")}
              >
                <span className="sidebar-num">—</span> Prior art (IDG / Pharos)
              </button>
              <button
                type="button"
                id="toc-link-adme"
                className={`sidebar-link ${activeSection === "adme-profiling" ? "active" : ""}`}
                onClick={() => scrollToSection("adme-profiling")}
              >
                <span className="sidebar-num">08</span> ADME &amp; PK Profiling
              </button>
              <button
                type="button"
                id="toc-link-molecule-local-search"
                className={`sidebar-link ${activeSection === "molecule-local-search" ? "active" : ""}`}
                onClick={() => scrollToSection("molecule-local-search")}
              >
                <span className="sidebar-num">10</span> Local molecular search
              </button>
              <button
                type="button"
                id="toc-link-disclaimer"
                className={`sidebar-link ${activeSection === "clinical-disclaimer" ? "active" : ""}`}
                onClick={() => scrollToSection("clinical-disclaimer")}
              >
                <span className="sidebar-num">11</span> Clinical Disclaimer
              </button>
            </nav>

            <div className="sidebar-badge-card" id="sidebar-meta-card">
              <div className="sidebar-badge-title">Transparent Science</div>
              <p className="sidebar-badge-text">
                Every calculation is reproducible and traceable to published public databases (RCSB PDB, Open
                Targets, PubChem) or to RDKit, which runs on the backend. See the{" "}
                <a href="/validation">validation page</a> for the measured performance of every score.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Sections */}
        <main className="methodology-main" id="methodology-main-content">
          {/* Section 0: Discovery staging bench workflow */}
          <section className="methodology-section" id="staging-bench">
            <div className="section-eyebrow">Workflow Overview</div>
            <h2 className="section-title">Discovery Staging Bench</h2>
            <p className="section-text">
              The home screen (<strong>Run a screen</strong>) is a four-station pipeline for structure-based hit triage.
              Each station builds on the previous one; you can hand off to native docking and ADME when you are ready.
            </p>
            <ol className="methodology-staging-steps">
              <li>
                <strong>Station 1 — RCSB PDB target search.</strong> Stage a crystallographic structure with TargetForge&apos;s
                Target Selection Score (resolution, co-ligand, pocket geometry, completeness, and method).
              </li>
              <li>
                <strong>Station 2 — PubChem shortlist (up to five molecules).</strong> Search compounds one at a time, review
                Lipinski/Veber pre-checks and PAINS/toxicophore flags, and build a 2–5 molecule shortlist for ranking.
              </li>
              <li>
                <strong>Station 3 — Ranking and filters.</strong> The shortlist is ranked by Tanimoto similarity to the ligand
                co-crystallised in the <em>selected PDB</em>, which is the only ranker measured to beat random on the scaffold-split
                decoy benchmark (held-out ROC-AUC {MEASURED.compoundTriage.tanimoto}, BEDROC20{" "}
                {MEASURED.compoundTriage.tanimotoBedroc20}). The heuristic-v2 score shown alongside is a
                drug-likeness and liability filter built from Lipinski/Veber properties and PAINS flags; it scores{" "}
                {MEASURED.compoundTriage.heuristicV2} against {MEASURED.compoundTriage.random} for random,
                so it filters rather than prioritises and predicts neither binding nor activity. Neither is AI, and neither is a
                validated prediction of potency.
              </li>
              <li>
                <strong>Station 4 — ADME handoff.</strong> Pick a compound and launch RDKit-based ADME profiling with
                the staged SMILES pre-filled. {DOCKING_STATUS.sentence}
              </li>
            </ol>
            <p className="section-text">
              The <strong>One-click demo: EGFR screen</strong> on the homepage loads PDB <code>1M17</code> with imatinib and osimertinib
              so you can compare a weak vs strong EGFR binder without manual setup.
            </p>
          </section>

          {/* Section 1: PDB Target Selection Score */}
          <section className="methodology-section" id="pdb-target-score">
            <div className="section-eyebrow">Criterion 01</div>
            <h2 className="section-title">PDB Target Selection Score</h2>
            <p className="section-text">
              To conduct reliable structure-based screening, researchers must select a high-fidelity representative model
              from the Protein Data Bank (PDB). Not all PDB files are equally suited for virtual screening. TargetForge scores
              candidate crystal and cryo-EM structures on a normalized scale (0–100) based on five core structural criteria:
            </p>

            <div className="methodology-criteria-grid">
              <div className="criteria-card" id="card-criteria-resolution">
                <div className="criteria-header">
                  <span className="criteria-tag">Structural Metric</span>
                  <h3 className="criteria-title">Experimental Resolution</h3>
                </div>
                <p className="criteria-desc">
                  Atomic resolution indicates coordinate uncertainty. High-resolution structures (≤ 2.0 Å) provide precise
                  spatial coordinates for side chains and water networks, while structures worse than 3.0 Å have broader electron
                  density envelopes that obscure critical pocket contact points.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-ligand">
                <div className="criteria-header">
                  <span className="criteria-tag">Binding Site Metric</span>
                  <h3 className="criteria-title">Co-Crystallized Ligand</h3>
                </div>
                <p className="criteria-desc">
                  A structure crystallized with a bound small-molecule inhibitor confirms that the binding cavity is sterically
                  competent and captures the protein in a biologically relevant binding conformation (induced fit). Apo (unbound)
                  structures frequently exhibit collapsed or occluded active sites.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-pocket">
                <div className="criteria-header">
                  <span className="criteria-tag">Cavity Geometry</span>
                  <h3 className="criteria-title">Binding Pocket Detection</h3>
                </div>
                <p className="criteria-desc">
                  Identifies whether a defined cavity with suitable volume, depth, and hydrophobic surface area is present
                  to accommodate drug-like small molecules, rather than an undruggable flat protein surface.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-completeness">
                <div className="criteria-header">
                  <span className="criteria-tag">Integrity Check</span>
                  <h3 className="criteria-title">Structural Completeness</h3>
                </div>
                <p className="criteria-desc">
                  Penalizes structures with missing backbone residues, disordered flexible loops intersecting the binding cleft,
                  or artificial mutation artifacts that distort the native wild-type active site.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-method">
                <div className="criteria-header">
                  <span className="criteria-tag">Biophysical Origin</span>
                  <h3 className="criteria-title">Experimental Method</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates the experimental technique (X-ray diffraction, high-resolution Cryo-EM, or solution NMR). Static
                  crystallographic models provide rigid atomic coordinates ideal for geometry matching, whereas NMR conformational
                  ensembles require distinct multi-conformation handling.
                </p>
              </div>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-pdb">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                A high PDB Target Selection Score reflects crystallographic and geometric quality in the static experimental model.
                It cannot predict allosteric conformational switches, physiological pH variations, dynamic breathing motions,
                or post-translational modifications that may be absent in recombinant in vitro protein constructs.
              </p>
            </div>
          </section>

          {/* Section 2: PAINS & Toxicophores */}
          <section className="methodology-section" id="pains-screening">
            <div className="section-eyebrow">Criterion 02</div>
            <h2 className="section-title">PAINS &amp; Toxicophore Flagging</h2>
            <p className="section-text">
              Pan-Assay Interference Compounds (PAINS) are chemical structures that repeatedly yield false-positive readouts
              in biochemical screening assays. Instead of specifically binding to the target protein's pocket, these molecules
              often disrupt experiments through non-specific, artifactual mechanisms:
            </p>

            <ul className="methodology-bullet-list">
              <li>
                <strong>Covalent Reactivity:</strong> Compounds containing electrophilic warheads that react indiscriminately
                with nucleophilic protein residues (like cysteine thiol groups) rather than forming reversible non-covalent complexes.
              </li>
              <li>
                <strong>Redox Cycling:</strong> Molecules that generate hydrogen peroxide or free radicals in the assay buffer,
                causing artificial protein denaturation or fluorescent quenching.
              </li>
              <li>
                <strong>Colloidal Aggregation:</strong> Hydrophobic molecules that form sub-micromolar aggregates, sequestering
                target proteins non-specifically on their surface.
              </li>
              <li>
                <strong>Photochemical Interference:</strong> Chemotypes that fluoresce at the exact wavelengths used by standard
                optical detection assays, generating false readings.
              </li>
            </ul>

            <p className="section-text">
              TargetForge runs candidate SMILES structures against algorithmic substructure pattern matching based on established
              rules (including Baell &amp; Holloway filters) to flag liabilities early in the triage pipeline.
            </p>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-pains">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                PAINS flagging identifies known chemical motifs associated with assay promiscuity; a "Clean" result is not a guarantee
                of biological safety, selectivity, or non-toxicity in animals or humans. Importantly, a flagged substructure is
                <strong> not an automatic disqualifier</strong>. Multiple approved, effective pharmaceutical drugs contain motifs
                that trigger standard alerts (e.g., catecholamines, quinone-derived antibiotics, or rhodanine scaffolds). Flags
                are warnings for medicinal chemists to verify mechanism of action, not instant filters.
              </p>
            </div>
          </section>

          {/* Section 3: Target-Aware Compound Ranking (heuristic-v2) */}
          <section className="methodology-section" id="target-aware-scoring">
            <div className="section-eyebrow">Criterion 03</div>
            <h2 className="section-title">Compound Triage Filter (heuristic-v2)</h2>

            {/*
              Measured performance first. This section used to open by
              explaining why the score was better than generic drug-likeness
              rules and only mentioned validation at the bottom of Criterion
              06, which left the score bands below reading as meaningful
              rankings. They are not; they are documentation of what the
              filter computes.
            */}
            <div className="limitation-callout" id="limitation-scoring-headline">
              <div className="limitation-header">
                <span className="limitation-badge">Measured performance</span>
              </div>
              <p className="limitation-body">
                On a property-matched, Bemis–Murcko scaffold-split decoy benchmark (
                {MEASURED.compoundTriage.targetsPassingDecoyChecks} targets passing decoy sanity checks, mean AVE
                bias {MEASURED.compoundTriage.meanAveBias}, zero leaked scaffolds),{" "}
                <code>heuristic-v2</code> scores held-out ROC-AUC{" "}
                <strong>{MEASURED.compoundTriage.heuristicV2}</strong> against{" "}
                <strong>{MEASURED.compoundTriage.random}</strong> for a seeded random ranker — that is, no better
                than chance. The gene/PDB rule table on its own scores{" "}
                <strong>{MEASURED.compoundTriage.ruleTableOnly}</strong>, below random, because its hardcoded
                drug-name rules fire on 0% of held-out molecules. Tanimoto similarity to the staged co-crystallised
                ligand scores {MEASURED.compoundTriage.tanimoto} (BEDROC20{" "}
                {MEASURED.compoundTriage.tanimotoBedroc20}) on the same benchmark and is what the app actually
                ranks by. Source: <code>{VALIDATION_SOURCES.task2Md}</code>.
              </p>
            </div>

            <p className="section-text">
              So <code>heuristic-v2</code> is a drug-likeness and liability <em>filter</em>, not a ranker: it
              removes compounds with obvious problems and predicts neither binding nor activity. The 0–100 output
              is tagged programmatically as <code>source: &quot;heuristic-v2&quot;</code>. The two components and
              their bands are documented below so you can see what the number is composed of — not because the
              bands indicate pharmacological relevance.
            </p>

            <div className="scoring-tiers-grid">
              <div className="scoring-tier-box" id="tier-physicochemical">
                <div className="scoring-tier-num">Part 1</div>
                <h3 className="scoring-tier-title">Lipinski &amp; Veber Drug-Likeness</h3>
                <p className="scoring-tier-desc">
                  Evaluates 6 oral bioavailability parameters using trapezoidal scoring functions (up to ~24 points): Molecular Weight (≤ 500 Da),
                  calculated LogP (≤ 5.0), Hydrogen Bond Donors (≤ 5), Hydrogen Bond Acceptors (≤ 10), Rotatable Bonds (≤ 10), and Topological
                  Polar Surface Area (TPSA ≤ 140 Å²). This establishes baseline oral bioavailability feasibility.
                </p>
              </div>

              <div className="scoring-tier-box" id="tier-pharmacological">
                <div className="scoring-tier-num">Part 2</div>
                <h3 className="scoring-tier-title">Gene / PDB Target Rule Table</h3>
                <p className="scoring-tier-desc">
                  Maps the resolved target gene and PDB structure against curated pharmacological rules spanning major therapeutic classes:
                  EGFR, ABL1, BRAF, HER2, β2-AR (ADRB2), COX-1/2, HMGCR, DPP-4, HIV-1 Protease, SARS-CoV-2 Mpro, PDE5, HDAC, and Nuclear
                  Receptors (ER/ESR1). Differentiates on-target actives, same-family off-target analogs, and unrelated chemistries.
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "8px" }}>
                Score Bands &amp; Score Composition
              </h4>
              <p className="section-text">
                What the filter computes, band by band. These describe the arithmetic, not a ranking you should
                act on: on held-out chemistry the target-rule component contributes nothing, because its rules
                name specific drugs.
              </p>
              <ul className="methodology-bullet-list">
                <li>
                  <strong>On-Target (~67 points):</strong> Awarded when a compound has proven, established on-target clinical pharmacology
                  matching the resolved gene or PDB rule (+55 on-target bonus + ~12–18 drug-likeness points).
                </li>
                <li>
                  <strong>Same-Family (~24 points):</strong> Awarded when a compound shares the broad target class but is demoted due to
                  primary target divergence (+12 family bonus + ~12–16 drug-likeness points), such as testing an EGFR kinase inhibitor against ABL1.
                </li>
                <li>
                  <strong>Generic Drug-Like (~12 points):</strong> Assigned to drug-like small molecules with zero established target or class
                  relevance (+0 target bonus + ~12–18 drug-likeness points).
                </li>
                <li>
                  <strong>Optional Co-Crystal Name Bonus (+20 points):</strong> Awarded when a candidate directly matches the co-crystallized
                  reference ligand in the experimental PDB complex (e.g., STI-571 / Imatinib in PDB 2HYY), bringing the score to ~87.
                </li>
              </ul>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-scoring">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                The <code>heuristic-v2</code> scoring engine is a <strong>rule-based prioritization heuristic</strong>, not molecular docking,
                not a trained machine learning model, and not measured binding affinity. It does not predict free energy of binding (ΔG),
                equilibrium dissociation constants (Kd), or experimental IC50 values. Its output field is explicitly tagged as <code>source: &quot;heuristic-v2&quot;</code>.
              </p>
            </div>
          </section>

          {/* Section 4: Target Discovery / Novelty Scoring */}
          <section className="methodology-section" id="target-discovery">
            <div className="section-eyebrow">Criterion 04</div>
            <h2 className="section-title">Target Discovery</h2>
            <p className="section-text">
              This section used to describe a single &quot;novelty score&quot;: biology signal divided by{" "}
              <code>1 + drugCount</code>, presented as a way of finding targets nobody had pursued yet. A
              retrospective on Open Targets {MEASURED.cohort.window} measured that formula at
              held-out ROC-AUC <strong>{MEASURED.removedNoveltyFormula.roc}</strong> — below chance — because
              dividing by drug count inverts the strongest real-world predictor of a target entering the clinic.
              The inverse drug-count term on its own scored {MEASURED.removedNoveltyFormula.inverseDrugCountAlone}.
              It was removed, and what follows is what replaced it. Every figure here is also on the{" "}
              <a href="/validation">validation page</a>, which is the authoritative source.
            </p>

            <div className="discovery-columns">
              <div className="discovery-col" id="col-understudy-score">
                <h4 className="col-heading">Evidence strength score</h4>
                <p className="col-text">
                  The hand-set weighting of the eight Open Targets biology scores, with the drug-count penalty
                  deleted. Held-out ROC-AUC <strong>{MEASURED.understudy.rocUndrugged}</strong> (PR-AUC{" "}
                  {MEASURED.understudy.prUndrugged}) on targets with no approved or clinical drug in 2021, and{" "}
                  <strong>{MEASURED.understudy.rocAllTargets}</strong> (PR-AUC {MEASURED.understudy.prAllTargets})
                  across all targets. It <em>rises</em> with evidence, so the best-studied targets score highest.
                  It is not a novelty score.
                </p>
              </div>
              <div className="discovery-col" id="col-progression-score">
                <h4 className="col-heading">Progression score</h4>
                <p className="col-text">
                  A logistic model fitted on {MEASURED.cohort.trainingDiseases} training diseases and evaluated on{" "}
                  {MEASURED.cohort.heldOutDiseases} held out: ROC-AUC{" "}
                  <strong>{MEASURED.progression.roc}</strong> (PR-AUC {MEASURED.progression.pr}), precision@25{" "}
                  {MEASURED.progression.precisionAt25} — about 3 true positives in a top-25 list. The fitted
                  weights put {MEASURED.literatureSimplexWeight} of the simplex on the literature feature, so this
                  behaves largely as a publication-count proxy; publication count alone scores{" "}
                  {MEASURED.publications.roc}.
                </p>
              </div>
            </div>

            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Genetic evidence did not predict progression
              </h3>
              <p className="section-text">
                The page previously described these as genetically validated targets. On this benchmark genetic
                association on its own scored ROC-AUC <strong>{MEASURED.geneticAlone.rocCohort1}</strong> on the
                disease-undrugged cohort and <strong>{MEASURED.geneticAlone.rocCohort2}</strong> on the
                globally-undrugged cohort — chance in both — and the fitted model gave it{" "}
                {MEASURED.geneticAlone.simplexWeight} of the simplex. Open Targets records genetic evidence for a
                target; in this benchmark that evidence did not predict clinical progression, so nothing here is
                described as validated by it. Source: <code>{VALIDATION_SOURCES.task3Md}</code>.
              </p>
            </div>

            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Does the biology add anything over counting papers?
              </h3>
              <p className="section-text">
                Because the fitted model is mostly a publication-count proxy, the question worth testing is
                whether the Open Targets evidence adds ranking signal once attention is controlled for. Three
                nested models on the same cohort and split: publication count alone{" "}
                {MEASURED.attention.publicationsOnly}, publication count plus the eight biology features{" "}
                <strong>{MEASURED.attention.publicationsPlusBiology}</strong>, the biology features alone{" "}
                {MEASURED.attention.biologyOnly}. The paired gain from adding biology is{" "}
                <strong>{MEASURED.attention.deltaRoc}</strong> ROC-AUC (95% CI{" "}
                {MEASURED.attention.deltaRocCiPairs} resampling pairs).
              </p>
              <p className="section-text">
                That is weaker than it looks. The held-out rows cluster into {MEASURED.cancerStratification.heldOutCancers}{" "}
                cancers plus one non-cancer disease rather than being independent, and resampling whole diseases
                widens the interval to {MEASURED.attention.deltaRocCiDiseases} — still excluding zero, but barely
                — while the PR-AUC interval becomes {MEASURED.attention.deltaPrCiDiseases}, which includes zero.
                The gain in ranking holds; the gain in precision among the rare positives does not. Source:{" "}
                <code>{VALIDATION_SOURCES.task4Md}</code>.
              </p>
            </div>

            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Read all of it as an oncology result
              </h3>
              <p className="section-text">
                The signal is carried by somatic mutation evidence, which in Open Targets comes largely from
                cancer genomics, so the comparison was re-run on the cancer and non-cancer held-out diseases
                separately, with the cancer labelling committed as its own file so it can be disputed. On the{" "}
                {MEASURED.cancerStratification.heldOutCancers} held-out cancers (
                {MEASURED.cancerStratification.cancerPairs} pairs, {MEASURED.cancerStratification.cancerPositives}{" "}
                positives) biology adds {MEASURED.cancerStratification.cancerDelta} over publication count (95% CI{" "}
                {MEASURED.cancerStratification.cancerCiDiseases} resampling diseases) — essentially the pooled
                figure, because most held-out pairs are cancer.
              </p>
              <p className="section-text">
                Whether it holds outside cancer is <strong>underpowered to tell</strong>, which is the answer
                rather than a hedge. Only {MEASURED.cancerStratification.nonCancerDiseases} held-out disease is
                non-cancer: {MEASURED.cancerStratification.nonCancerPairs} pairs with{" "}
                {MEASURED.cancerStratification.nonCancerPositives} positives. On it the biology features do not
                help — {MEASURED.cancerStratification.nonCancerDelta} (95% CI{" "}
                {MEASURED.cancerStratification.nonCancerCi}, including zero) — and{" "}
                <strong>
                  publication count alone scores higher there (
                  {MEASURED.cancerStratification.nonCancerPublicationsOnly} against{" "}
                  {MEASURED.cancerStratification.nonCancerPublicationsPlusBiology})
                </strong>
                . No disease-level interval is reported for that stratum, because resampling one disease would
                produce something that looks like a measurement and is not one. Settling this needs more
                non-cancer diseases in the panel. Source: <code>{VALIDATION_SOURCES.task7Json}</code>.
              </p>
            </div>

            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Gene properties add nothing; prior chemistry is what predicts
              </h3>
              <p className="section-text">
                Five more pre-2021 feature groups were tested on the same cohort and split: Open Targets 21.04
                tractability, ChEMBL protein class, gnomAD v2.1.1 pLI and LOEUF, DepMap 21Q2 CRISPR essentiality,
                and GTEx v8 expression selectivity. Everything together reaches ROC-AUC{" "}
                <strong>{MEASURED.tractability.everything}</strong> (PR-AUC {MEASURED.tractability.everythingPr},
                precision@25 {MEASURED.tractability.everythingPrecisionAt25}), a gain of{" "}
                {MEASURED.tractability.gainOverPublications} over publication count (95% CI{" "}
                {MEASURED.tractability.gainOverPublicationsCi}).
              </p>
              <p className="section-text">
                None of that gain is biology. Keeping only properties of the gene itself — pLI, LOEUF, three
                DepMap measures, two GTEx measures — gives {MEASURED.tractability.genePropertiesOnly} against{" "}
                {MEASURED.attention.publicationsPlusBiology} without them: a paired difference of{" "}
                <strong>{MEASURED.tractability.genePropertyDelta}</strong> (95% CI{" "}
                {MEASURED.tractability.genePropertyCi}), which includes zero. The best single gene property is pLI
                at {MEASURED.tractability.bestGeneProperty}; DepMap essentiality and GTEx selectivity sit at
                chance.
              </p>
              <p className="section-text">
                The whole gain comes from one feature: the number of high-quality compounds that already existed
                for the target in 2021, which alone scores{" "}
                <strong>{MEASURED.tractability.compoundCount}</strong> — better than any model in the report. It
                is not publication count again (R² {MEASURED.tractability.compoundCountAttentionR2} against
                attention, {MEASURED.tractability.compoundCountResidualised} residualised), but it is not biology
                either: it records medicinal chemistry already done.{" "}
                <strong>No score was shipped on this result</strong>, and the reason is the point. A target with a
                hundred compounds and no drug is one the field has already picked, so such a score would rank
                highest the targets a user could have found without it, and rank a genuinely unstudied target last
                by construction. Source: <code>{VALIDATION_SOURCES.task8Json}</code>.
              </p>
            </div>

            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                The repurposing evidence profile
              </h3>
              <p className="section-text">
                The &quot;repurposing&quot; weighting profile on the discovery page is a separate fitted model, and
                the strongest result in this repository. Measured on the cohort that actually poses the
                repurposing question — targets associated with a disease in 2021 with no clinical drug for that
                disease, scored on whether they acquired one by 2026 ({MEASURED.repurposing.heldOutPairs} held-out
                pairs, {MEASURED.repurposing.heldOutPositives} positives) — drug count plus publication count
                reaches ROC-AUC <strong>{MEASURED.repurposing.shipped}</strong> (PR-AUC{" "}
                {MEASURED.repurposing.shippedPr}, precision@25 {MEASURED.repurposing.shippedPrecisionAt25}),
                against {MEASURED.repurposing.drugCountAlone} for drug count alone,{" "}
                {MEASURED.repurposing.publicationsAlone} for publication count alone, and{" "}
                {MEASURED.repurposing.handWeighted} for the hand-weighted formula it replaced — a gain of{" "}
                {MEASURED.repurposing.gain} (95% CI {MEASURED.repurposing.gainCiDiseases} resampling diseases).
              </p>
              <p className="section-text">
                What it does not support: the score ranks by how often the field has already drugged a target
                elsewhere. That is a statement about where effort has gone, not about biology, and it cannot tell
                you a repurposing hypothesis is correct. Like everything else here it is oncology-scoped. Source:{" "}
                <code>{VALIDATION_SOURCES.task10Json}</code>.
              </p>
            </div>

            {/* Zero Associations & Anti-Hype Clarification */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Data Source Transparency &amp; Zero-Association Policy
              </h3>
              <p className="section-text">
                The sole data source for disease-target associations is the Open Targets Platform. A query returning <strong>0 associations</strong> means
                there is <strong>no Open Targets hit</strong> for that indication in public ontologies. It does <em>not</em> indicate a hidden or
                secret novel target.
              </p>
              <div style={{ background: "var(--surface-muted)", borderLeft: "3px solid var(--primary)", padding: "10px 14px", borderRadius: "0 6px 6px 0", fontSize: "13px", color: "var(--text)", marginBottom: 12 }}>
                <strong style={{ color: "var(--primary)", display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  Anti-Hype Reporting Policy
                </strong>
                No surface in this application asserts that a target is novel, unpursued, or an opportunity, and
                none describes a target as validated by its genetic evidence. Where a score failed validation it
                is reported as having failed and disabled rather than shipped with a caveat. Where a result is
                negative it is stated as the finding. This policy used to be contradicted two paragraphs above it,
                by the section that has since been rewritten;{" "}
                <code>src/methodologyProvenance.test.js</code> fails the build if that language returns.
              </div>
            </div>

            {/* Gene Expression Specificity Subsection */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Gene Expression Context &amp; Physiological Selectivity
              </h3>
              <p className="section-text">
                Where a target is expressed in the human body directly influences therapeutic index. Narrow baseline tissue expression (GTEx v8)
                suggests favorable selectivity with lower risk of systemic on-target side effects, whereas ubiquitous expression across vital
                organs (heart, liver, CNS) signals mechanism-based toxicity risk.
              </p>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-discovery">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                Open Targets associations synthesize public genetic studies and literature text-mining. They do not capture confidential, unreleased
                biopharmaceutical pipelines. Furthermore, GTEx RNA expression data reflects healthy adult donors; diseased, inflamed, or
                malignant microenvironments frequently exhibit altered transcriptional levels or aberrant isoform expression.
              </p>
            </div>
          </section>

          {/* Section 5: Repurposing Screen */}
          <section className="methodology-section" id="repurposing-screen">
            <div className="section-eyebrow">Criterion 05</div>
            <h2 className="section-title">Systematic Repurposing Screen</h2>
            <p className="section-text">
              Drug repurposing explores new indications for already approved pharmaceutical agents with established human pharmacokinetic profiles,
              clinical safety records, and existing chemical manufacturing.
            </p>
            {/*
              This criterion described the screen as reliable given enough
              protein context, and claimed granular gene-level rules prevented
              target collapse. The scaffold-split benchmark measured those
              rules firing on no held-out molecule at all. Two different things
              are called "repurposing" in this app and they have very different
              results, so they are now stated separately.
            */}
            <div className="limitation-callout" id="limitation-repurposing-headline">
              <div className="limitation-header">
                <span className="limitation-badge">Measured performance</span>
              </div>
              <p className="limitation-body">
                This screen ranks approved drugs against a structure with <code>heuristic-v2</code>, the filter
                documented in Criterion 03 — held-out ROC-AUC{" "}
                <strong>{MEASURED.compoundTriage.heuristicV2}</strong> against{" "}
                {MEASURED.compoundTriage.random} for a seeded random ranker, with the gene/PDB rule table alone at{" "}
                {MEASURED.compoundTriage.ruleTableOnly}. It is a liability filter, not a ranker, and it predicts
                neither binding nor activity. The claim this section used to make — that granular gene-level rules
                preserve target selectivity — is what the benchmark refuted: the rules are keyed to specific drug
                names and fire on 0% of held-out molecules. Source: <code>{VALIDATION_SOURCES.task2Md}</code>.
              </p>
              <p className="limitation-body">
                A separate, much stronger result is often confused with this one. The fitted{" "}
                <strong>repurposing evidence profile</strong> on the target discovery page predicts which{" "}
                <em>targets</em> acquire a clinical drug (ROC-AUC {MEASURED.repurposing.shipped}) and is described
                in Criterion 04. It does not score compounds, and nothing on this page transfers its performance
                to this screen.
              </p>
            </div>
            <p className="section-text">
              TargetForge evaluates approved small molecules against a selected PDB structure. The screen resolves{" "}
              <strong>target gene symbol</strong>, <strong>protein name</strong>, <strong>PDB ID</strong>, and{" "}
              <strong>co-crystallized ligand name</strong>. Rows are ordered by the <code>heuristic-v2</code>{" "}
              score. Where the structure has a co-crystallised ligand, Tanimoto similarity to it is computed and
              shown as its own sortable column — that signal scores {MEASURED.compoundTriage.tanimoto} on the
              benchmark against {MEASURED.compoundTriage.heuristicV2} for the default ordering, so sorting by
              similarity is the better-measured way to read this table.
            </p>

            <div style={{ marginTop: "16px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                Screening Library Scope
              </h4>
              <p className="section-text">
                The dedicated Repurposing bench systematically evaluates an exhaustive library of over 2,900 approved small molecules.
              </p>
            </div>

            {/* Clinical Safety Cross-Reference Subsection */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Clinical Safety &amp; Post-Market Surveillance Cross-Reference (FAERS)
              </h3>
              <p className="section-text">
                Approved therapeutics come with documented human tolerability and safety surveillance. Cross-referencing adverse event records
                from the FDA Adverse Event Reporting System (FAERS) and boxed warnings provides real-world clinical tolerability context before
                advancing a candidate into secondary screening.
              </p>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-repurposing">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                Adverse event reports from public registries (FDA FAERS) are voluntary, spontaneous, and <strong>do not establish clinical causation</strong>.
                Reporting frequency correlates with commercial prescription volume and underlying disease severity.
              </p>
            </div>
          </section>

          {/* Section 6: Validation */}
          <section className="methodology-section" id="validation-benchmark">
            <div className="section-eyebrow">Criterion 06</div>
            <h2 className="section-title">Validation Status</h2>
            <p className="section-text">
              TargetForge reports validation outcomes honestly. The knowledge-based triage score is for computational prioritization only;
              it is not evidence of binding affinity, enzymatic inhibition, or clinical efficacy.
            </p>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Triage score (heuristic-v2)
            </h3>
            <ul className="methodology-bullet-list">
              <li>
                <strong>Circular first test (withdrawn):</strong> Early checks used known drugs that are explicitly encoded in the app&apos;s own
                target rule table (for example, comparing osimertinib vs imatinib on EGFR). Those drugs scored highly because the rules were written
                around them — this is not independent validation.
              </li>
              {/*
                These two bullets quoted the superseded Task 1 run ("~0.35",
                "3 of 15", "~0.48") as current and in progress. Task 2 rebuilt
                the benchmark with property-matched decoys and scaffold
                splitting; its figures come from MEASURED so this list and
                /validation cannot diverge again.
              */}
              <li>
                <strong>Rebuilt benchmark (complete):</strong> the property-matched, scaffold-split decoy
                benchmark finished with {MEASURED.compoundTriage.targetsPassingDecoyChecks} targets passing decoy
                sanity checks (mean AVE bias {MEASURED.compoundTriage.meanAveBias}, zero leaked scaffolds).{" "}
                <code>heuristic-v2</code> scores held-out ROC-AUC {MEASURED.compoundTriage.heuristicV2} against{" "}
                {MEASURED.compoundTriage.random} for a seeded random ranker; the rule table alone scores{" "}
                {MEASURED.compoundTriage.ruleTableOnly}. Tanimoto similarity to the staged co-crystal ligand
                scores {MEASURED.compoundTriage.tanimoto}. Source: <code>{VALIDATION_SOURCES.task2Md}</code>.
              </li>
              <li>
                <strong>The earlier run is superseded, not pending:</strong> the figures in{" "}
                <code>{VALIDATION_SOURCES.task1Md}</code> used ChEMBL weak binders as decoys and only 3 of 15
                targets passed its sanity checks. They are not quoted anywhere on this site as current.
              </li>
            </ul>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Molecular docking: validation status
            </h3>
            <p className="section-text">
              Measured performance for every score in the app, including the ones that failed validation, is
              listed on the <a href="/validation">validation page</a>.
            </p>
            <p className="section-text">
              Two different docking engines exist in this repository and they have very different results, so they are
              reported separately. Every figure below is generated by a script in <code>benchmark/docking/</code> and
              written to a file in that directory; the provenance line at the end of this section gives the commit and
              generation dates.
            </p>
            <ul className="methodology-bullet-list">
              <li>
                <b>In-browser empirical engine — fails redocking, not used.</b> Redocking a ligand into the structure it
                was crystallised in returns poses 5.5–11.5 Å from the experimental pose where a pose is returned at all,
                and no valid pose on six targets. A spot check on 2026-11-04 reproduced this: erlotinib redocked into
                1M17 gave 10.13 Å with a reported affinity attached, and imatinib (1IEP) and celecoxib (1CX2) returned no
                pose. This engine is not a validated predictor and its output is not shown.
              </li>
              <li>
                <b>AutoDock Vina service — passes redocking.</b> Vina 1.2.5, receptor protonation at pH 7.4, ligands
                prepared with RDKit and Meeko, symmetry-corrected in-place RMSD, exhaustiveness 16. Per-target rule: best
                seed RMSD ≤ 2.0 Å. Result: <b>10 of 11 targets pass (91%)</b>. The one failure is ADRB2 (3SN6) at 5.80 Å
                best / 7.95 Å median, a GPCR fusion construct whose pocket definition is sensitive to chain and stripping
                choices. Source: <code>benchmark/docking/results/redock_multiseed.json</code>.
              </li>
              <li>
                <b>Pair reliability: 15 of 25 approved-drug pairs.</b> Each drug/PDB pair is checked for a co-crystal
                ligand present in the entry, an embeddable SMILES, a Vina score between −14.0 and −5.0 kcal/mol, and a
                redock RMSD ≤ 2 Å. Ten pairs fail, including erlotinib/1M17 (5.88 Å) and osimertinib/4ZAU (8.79 Å). A
                pose for a failing pair is not a validated binding mode. Source:{" "}
                <code>benchmark/docking/results/pair_sanity_checks.json</code>.
              </li>
              <li>
                <b>Vina score does not track measured potency.</b> Spearman ρ between the inverted Vina score and median
                ChEMBL pChEMBL is <b>{VINA_MEASURED.potencySpearman}</b>, with a 95% bootstrap confidence interval
                of <b>{VINA_MEASURED.potencySpearmanCi}</b>. The interval spans zero, so no reliable monotonic
                relationship is demonstrated on this sample; the sign is the opposite of what a useful affinity
                proxy would give. Vina scores are not calibrated affinities. Source:{" "}
                <code>{VINA_MEASURED.potencySource}</code>.
              </li>
              <li>
                <b>Enrichment on the held-out test split ({VINA_MEASURED.enrichment.length} targets).</b>{" "}
                {VINA_MEASURED.enrichment.map((e, i) => (
                  <React.Fragment key={e.target}>
                    {i > 0 ? " " : null}
                    {e.target}: ROC-AUC {e.roc} (95% CI {e.ci}), EF@1% {e.ef1}, from {e.actives} actives and{" "}
                    {e.decoys} decoys.
                  </React.Fragment>
                ))}{" "}
                Two of the three targets show no early enrichment at the 1% cut-off. Source:{" "}
                <code>{VINA_MEASURED.enrichmentSource}</code>.
              </li>
              <li>
                <b>The heuristic triage score does not beat a simple similarity baseline.</b> On the
                property-matched, scaffold-split benchmark ({MEASURED.compoundTriage.targetsPassingDecoyChecks}{" "}
                targets passing decoy sanity checks), heuristic-v2 scores ROC-AUC{" "}
                {MEASURED.compoundTriage.heuristicV2} against {MEASURED.compoundTriage.tanimoto} for Tanimoto
                similarity to the staged co-crystal ligand — and against {MEASURED.compoundTriage.random} for a
                seeded random ranker, so it is a drug-likeness and liability filter rather than a ranker. The rule
                table alone scores {MEASURED.compoundTriage.ruleTableOnly}, because hardcoded drug-name rules never
                fire on held-out molecules. Source: <code>{VALIDATION_SOURCES.task2Md}</code>. The earlier figures
                from <code>{VALIDATION_SOURCES.task1Md}</code> are superseded: that benchmark used ChEMBL weak
                binders as decoys and only 3 of 15 targets passed its sanity checks.
              </li>
            </ul>
            <p className="section-text">
              <b>What this means for the app.</b> Docking poses and scores are not displayed. The in-browser engine is
              disabled because it fails redocking; the Vina service is validated for pose reproduction on 10 of 11
              targets but its scores are not calibrated affinities and its enrichment is weak on two of three targets
              tested. Where a pose is shown in future it will be gated on the pair sanity check above.
            </p>
            <p className="section-text" style={{ fontSize: 12.5, opacity: 0.8 }}>
              Provenance: redocking, pair reliability, Spearman and enrichment figures generated 2026-10-13 and written to{" "}
              <code>benchmark/docking/RESULTS.md</code>. Triage baselines generated 2026-11-16 to{" "}
              <code>benchmark/docking/TASK1_BASELINES.md</code> and <code>benchmark/docking/TASK2_DECOY_BENCHMARK.md</code>.
              Figures on this page correspond to repository commit <code>83655b4</code>.
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Predicted pose protein–ligand interactions
            </h3>
            <p className="section-text">
              The interaction view labels contacts inferred from the <strong>predicted docked pose</strong> (and optional offline demo JSON), not
              experimentally validated binding data. Binding-site residues are residues with any protein heavy atom within 4.5 Å of the ligand
              (extended 5.0 Å list shown for context). Contacts use PLIP/ProLIF-style geometric rules on the Fly.io Vina service and a matching
              client classifier: hydrogen bonds (donor–acceptor ≤ 3.5 Å; D–H···A ≥ 120° when polar hydrogens are present, otherwise
              &quot;distance-only&quot;), salt bridges (charged atom pairs ≤ 4.0 Å), hydrophobic C–C contacts (≤ 4.0 Å), π–π stacking (face-to-face or
              T-shaped centroid/normal criteria), cation–π (≤ 6.0 Å), and halogen bonds (Cl/Br/I donors only, not fluorine; C–X···acceptor ≥
              165°). Heavy-atom pairs closer than ~3.0 Å that are not H-bond donor–acceptor pairs are labeled steric clashes, not hydrophobic
              contacts. Each pose is compared to the co-crystal binding site (residues within 4.5 Å of the deposited ligand); recovery below 25%
              marks the pose as off-site and interactions unreliable (PDB vs literature numbering is noted where relevant, e.g. sitagliptin/4FFW).
              Where a co-crystal ligand is available, matching interaction types at the same residue may be flagged as consistent with the crystal
              pose.
            </p>
          </section>

          {/* Section 7: the neglect screen (Task 9) */}
          <section className="methodology-section" id="neglect-screen">
            <div className="section-eyebrow">Criterion 07</div>
            <h2 className="section-title">The Neglect Screen, And What It Is Not</h2>
            <p className="section-text">{NEGLECT_SCREEN_COPY.intro}</p>
            <p className="section-text">
              <strong>{NEGLECT_SCREEN_COPY.notOpportunities}</strong>
            </p>
            <p className="section-text">{NEGLECT_SCREEN_COPY.cannotEstablishUnpursued}</p>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Its two axes disagree about scope
            </h3>
            <p className="section-text">
              This is the first limitation of the screen, not a footnote to it. The evidence model is validated on
              cancers ({MEASURED.cancerStratification.heldOutCancers} of the 10 contributing held-out diseases),
              while India&apos;s recorded burden is mostly not cancer: malignant neoplasms are{" "}
              {MEASURED.cancerStratification.indiaCancerShareOfDalys} of total DALYs. So the screen&apos;s
              intended use — a high-burden Indian disease — is largely outside the range where its ranking was
              validated. The page says so inline whenever the selected disease is one the committed labelling
              marks non-cancer.
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              How effort and gene properties are used
            </h3>
            <ul className="methodology-bullet-list">
              <li>{NEGLECT_SCREEN_COPY.effortIsAFilter}</li>
              <li>{NEGLECT_SCREEN_COPY.unknownIsNotZero}</li>
              <li>{NEGLECT_SCREEN_COPY.contextOnly}</li>
              <li>{NEGLECT_SCREEN_COPY.burdenSourceCaveat}</li>
            </ul>
            <p className="section-text" style={{ fontSize: 12.5, opacity: 0.8 }}>
              Source: <code>{VALIDATION_SOURCES.task8Json}</code> for the effort finding,{" "}
              <code>{VALIDATION_SOURCES.task7Json}</code> for the oncology scope, and{" "}
              <code>{VALIDATION_SOURCES.cancerLabels}</code> for the cancer labelling.
            </p>
          </section>

          {/* Section: prior-art disclosure (IDG / Pharos) */}
          <section className="methodology-section" id="prior-art">
            <div className="section-eyebrow">Prior art</div>
            <h2 className="section-title">{NEGLECT_SCREEN_COPY.priorArtTitle}</h2>
            {NEGLECT_SCREEN_COPY.priorArt.split("\n").map((para) => (
              <p className="section-text" key={para.slice(0, 40)}>
                {para}
              </p>
            ))}
            <p className="section-text">
              <a href={NEGLECT_SCREEN_COPY.priorArtHref} target="_blank" rel="noreferrer">
                {NEGLECT_SCREEN_COPY.priorArtLinkLabel}
              </a>{" "}
              — the portal that publishes the target development level classification this repository
              reimplements.
            </p>
          </section>

          {/* Section 8: ADME & Pharmacokinetic Profiling */}
          <section className="methodology-section" id="adme-profiling">
            <div className="section-eyebrow">Criterion 08</div>
            <h2 className="section-title">ADME &amp; Pharmacokinetic Profiling</h2>
            <p className="section-text">
              Early attrition in drug discovery is predominantly driven by poor absorption, distribution, metabolism, and safety liabilities.
              TargetForge includes a backend ADME engine powered by <strong>RDKit</strong>, allowing researchers to evaluate
              physicochemical properties and predictive pharmacokinetic filters using deterministic cheminformatics rules.
            </p>

            <div className="methodology-criteria-grid">
              <div className="criteria-card" id="criteria-druglikeness">
                <div className="criteria-header">
                  <span className="criteria-tag">Oral Filters</span>
                  <h3 className="criteria-title">Druglikeness Assessment</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates <strong>Lipinski Rule of 5</strong> (MW ≤ 500, cLogP ≤ 5, HBD ≤ 5, HBA ≤ 10), <strong>Veber rules</strong> (RotB ≤ 10,
                  TPSA ≤ 140 Å²), and the <strong>Ghose filter</strong> (MW 160–480, cLogP -0.4–5.6, MR 40–130, atoms 20–70).
                </p>
              </div>

              <div className="criteria-card" id="criteria-solubility">
                <div className="criteria-header">
                  <span className="criteria-tag">Delaney ESOL</span>
                  <h3 className="criteria-title">Aqueous Solubility Estimate</h3>
                </div>
                <p className="criteria-desc">
                  Computes estimated aqueous solubility (LogS, mol/L) via the Delaney (2004) equation based on molecular weight, rotatable bonds,
                  aromatic proportion, and Crippen lipophilicity. Classifies candidates from highly soluble to insoluble.
                </p>
              </div>

              <div className="criteria-card" id="criteria-boiled-egg">
                <div className="criteria-header">
                  <span className="criteria-tag">Passive Transport</span>
                  <h3 className="criteria-title">BOILED-Egg Permeation Model</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates topological polar surface area (TPSA) versus lipophilicity (using Crippen atomic cLogP approximations labeled approximate)
                  to compute <strong>Passive HIA</strong> (Human Intestinal Absorption - the White) and <strong>Passive BBB</strong> (Blood-Brain
                  Barrier permeation - the Yolk).
                </p>
              </div>

              <div className="criteria-card" id="criteria-structural-alerts">
                <div className="criteria-header">
                  <span className="criteria-tag">SMARTS Alerts</span>
                  <h3 className="criteria-title">Structural Liabilities &amp; Organ Alerts</h3>
                </div>
                <p className="criteria-desc">
                  Identifies toxicophoric substructures using SMARTS pattern matching (e.g., reactive warheads, quinone-methides, troglitazone-like
                  thiazolidinediones, hERG pharmacophores, and DILI structural alerts).
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                Pharmacokinetic Scope &amp; Modeling Boundaries
              </h4>
              <ul className="methodology-bullet-list">
                <li>
                  <strong>Labels Must Say &quot;Passive&quot; and &quot;Estimate&quot;:</strong> All BOILED-Egg and solubility readouts represent
                  passive physicochemical estimates, not active transporter-mediated clearance.
                </li>
                <li>
                  <strong>P-glycoprotein (P-gp):</strong> Evaluated through a rule-based physicochemical heuristic (based on MW &gt; 400 and
                  N+O counts ≥ 8 or large TKI chemotypes), explicitly labeled as a heuristic estimate.
                </li>
                <li>
                  <strong>Cytochrome P450 (CYP):</strong> CYP isoform inhibition (CYP1A2, 2C9, 2C19, 2D6, 3A4) and metabolic stability are
                  <strong> not modeled</strong>. TargetForge reports <em>&quot;CYP: not modeled&quot;</em> rather than producing unverified guesses.
                </li>
                <li>
                  <strong>Structural Alerts vs. Clinical Tox:</strong> SMARTS structural alert matches are heuristic flags pointing to potential
                  mechanistic concerns; they do <strong>not</strong> represent clinical toxicity or in vivo animal toxicology findings.
                </li>
              </ul>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-adme">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                ADME descriptors are calculated on the backend from 2D molecular graphs — RDKit WebAssembly
                running in the serverless function, not in your browser; <code>server/rdkitLoader.js</code> is the
                only place it is initialised. They do not simulate active influx/efflux transporters,
                phase I/II hepatic clearance, plasma protein binding, or clinical pharmacokinetics. All computed values are intended strictly for
                preliminary compound triage.
              </p>
            </div>
          </section>

          {/* Section: Local molecular search */}
          <section className="methodology-section" id="molecule-local-search">
            <div className="section-eyebrow">Tools</div>
            <h2 className="section-title">Local search around a seed (drug-likeness &amp; synthesizability heuristics)</h2>
            <p>
              This workflow mutates a user-provided seed with a curated library of RDKit reaction SMARTS (no generative SMILES from language
              models). Survivors are chosen by multi-objective ranking plus fingerprint diversity picking. It is explicitly{" "}
              <strong>not</strong> target binding optimization: there is no docking or affinity term in the objective when no target is staged.
            </p>
            <ul className="methodology-bullet-list">
              <li>
                <strong>Similarity floor:</strong> Variants whose Morgan fingerprint (radius 2, 2048 bits) Tanimoto similarity to the seed falls
                below a configurable floor (default 0.4) are rejected before ranking.
              </li>
              <li>
                <strong>Protected substructure:</strong> By default the seed&apos;s Murcko scaffold (extracted with the same ring/linker rules as
                RDKit&apos;s Murcko framework) must remain intact; users may override with a custom SMARTS query.
              </li>
              <li>
                <strong>SA score:</strong> Ertl &amp; Schuffenhauer (2009) fragment-frequency synthetic accessibility on a hydrogen-stripped,
                canonicalized structure. It is a coarse complexity prior — not retrosynthesis, not purchasability.
              </li>
              <li>
                <strong>Diversity &amp; scaffolds:</strong> Survivors are selected with MaxMin or Butina-style leader picking to avoid near-duplicate
                fingerprints; unique Murcko bucket keys are tracked across generations for collapse monitoring.
              </li>
              <li>
                <strong>Goodhart chart:</strong> Each generation plots the best heuristic score together with mean seed similarity and PAINS alert
                counts so score gains that track falling similarity are visible.
              </li>
              <li>
                <strong>Repeat runs:</strong> Multiple independent RNG seeds report recurring survivors and run-to-run score spread. Offline
                retrosynthesis screening (e.g. AiZynthFinder) on the final top hits is a plausible follow-up but is not run in the browser.
              </li>
            </ul>
          </section>

          {/* Section 10: General Disclaimer */}
          <section className="methodology-section" id="clinical-disclaimer">
            <div className="section-eyebrow">Regulatory Notice &amp; Disclaimer</div>
            <h2 className="section-title">Scientific &amp; Clinical Research Disclaimer</h2>
            <div className="disclaimer-panel" id="disclaimer-box">
              <div className="disclaimer-header">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="disclaimer-title">Intended Use &amp; Limitations Notice</h3>
              </div>
              <div className="disclaimer-content">
                <p>
                  <strong>Hypothesis Generator Only:</strong> TargetForge is strictly an early-stage computational hypothesis generator and hit
                  triage research tool developed for exploratory, academic, and pre-screening workflows.
                </p>
                <p>
                  <strong>No Prescribing or Medical Advice:</strong> The scores, alerts, rankings, and structural assessments generated by this
                  platform do not constitute medical, pharmacological, or clinical advice. TargetForge must not be used to prescribe treatments,
                  guide clinical patient care, diagnose medical conditions, or inform off-label drug administration.
                </p>
                <p>
                  <strong>No Binding-Energy Claim:</strong> Heuristic ranking scores and rule points do not represent thermodynamic free energy
                  of binding (ΔG), equilibrium dissociation constants (Kd), or experimental inhibition potency (IC50).
                </p>
                <p>
                  All computational hypotheses prioritized by TargetForge require formal experimental confirmation, including biophysical binding assays
                  (SPR, ITC), in vitro enzymatic inhibition, cellular target engagement, and rigorous GLP ADMET evaluation conducted by qualified
                  scientific professionals.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
