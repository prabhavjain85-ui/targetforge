// Explicit .js extension: this module is also loaded as plain Node ESM by
// scripts/inject-seo-html.mjs during the build, and Node does not resolve
// extensionless specifiers the way webpack does. Deploy failed on exactly this.
import { dockingStatusFromFlags } from "./shared/dockingStatus.js";
import { SITE_COPY, TARGET_DISCOVERY_COPY } from "./shared/validationCopy.js";

/** Derived once: the only place docking status is written is dockingStatus.js. */
const DOCKING_STATUS = dockingStatusFromFlags();

const SITE_URL = "https://www.targetforge.in";
const SITE_NAME = "TargetForge";

/**
 * Title and H1 come from SITE_COPY. They said "AI-Powered" while the
 * methodology page said "Neither is AI" two scrolls down. Nothing in this
 * repository is AI, so the claim is simply gone rather than softened.
 */
const DEFAULT_TITLE = SITE_COPY.title;
const DEFAULT_DESCRIPTION =
  `Computational drug-discovery workbench: compound triage, target identification, repurposing screens, and ADME analysis, with held-out performance published for every score. ${DOCKING_STATUS.short}.`;

export const ROUTE_SEO = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}/`,
  },
  "/target-discovery": {
    title: "Target Identification & Discovery — TargetForge",
    // Was "genetically validated, underexplored protein targets". Genetic
    // association alone scored at chance in both cohorts, and zero prior
    // chemistry predicts against progression, so both halves were refuted.
    description: TARGET_DISCOVERY_COPY.seo,
    canonical: `${SITE_URL}/target-discovery`,
  },
  "/repurposing": {
    title: "Drug Repurposing Screen — TargetForge",
    description:
      "Screen approved drugs against a protein target. Ranking is a hand-written rule table and drug-likeness filter that scored at chance on a scaffold-split benchmark, so it filters rather than ranks and predicts neither binding nor activity.",
    canonical: `${SITE_URL}/repurposing`,
  },
  "/adme": {
    title: "ADME & Pharmacokinetic Analysis — TargetForge",
    description:
      "Compute ADME properties, Lipinski/Veber filters, and BOILED-Egg absorption models with RDKit on the TargetForge backend. Supports lead optimization and compound triage.",
    canonical: `${SITE_URL}/adme`,
  },
  "/docking": {
    title: "Molecular Docking Simulation — TargetForge",
    description:
      DOCKING_STATUS.seo,
    canonical: `${SITE_URL}/docking`,
  },
  "/methodology": {
    title: "Scientific Methodology & Validation — TargetForge",
    description:
      "Transparent documentation of TargetForge scoring heuristics, cheminformatics rules, data sources, and operational boundaries for computational drug discovery.",
    canonical: `${SITE_URL}/methodology`,
  },
  "/contact": {
    title: "Contact TargetForge",
    description:
      "Get in touch about TargetForge workflows, collaborations, or feedback on computational drug discovery tools.",
    canonical: `${SITE_URL}/contact`,
  },
  "/history": {
    title: "Session History — TargetForge",
    description: "Review past TargetForge staging and screening sessions saved in your browser.",
    canonical: `${SITE_URL}/history`,
    noindex: true,
  },
};

export function getSeoForPath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_SEO[path] || {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}${path === "/" ? "/" : path}`,
  };
}

/** Indexable routes that receive build-time static HTML shells (excludes /history). */
export const INDEXABLE_ROUTES = [
  "/",
  "/target-discovery",
  "/repurposing",
  "/adme",
  "/docking",
  "/methodology",
  "/contact",
];

const WORKFLOW_LINKS = [
  { path: "/target-discovery", label: "Target identification" },
  { path: "/repurposing", label: "Drug repurposing" },
  { path: "/docking", label: "Molecular docking" },
  { path: "/adme", label: "ADME analysis" },
  { path: "/methodology", label: "Methodology" },
  { path: "/contact", label: "Contact" },
];

/**
 * Semantic HTML placed inside #root before React hydration.
 * Consumed by scripts/inject-seo-html.mjs at build time.
 */
export const STATIC_ROUTE_CONTENT = {
  "/": {
    eyebrow: "TargetForge · computational drug discovery",
    h1: SITE_COPY.h1,
    intro:
      `Rank compounds against a protein target in minutes: stage a PDB structure, shortlist PubChem molecules, rank by similarity to the co-crystallised ligand, then run ADME. ${DOCKING_STATUS.short}.`,
    sections: [
      {
        h2: "How it works",
        text:
          `Pick a target, add 2–5 compounds, and get a shortlist ranked by similarity to the co-crystallised ligand, with ADME follow-up. ${DOCKING_STATUS.short}. Station-by-station detail is documented on Methodology`,
        path: "/methodology#staging-bench",
        linkLabel: "see the staging bench workflow",
      },
      {
        h2: "More workflows",
        text:
          "Target discovery, drug repurposing, molecular docking, and ADME profiling are available from the Tools menu. Scoring rules and limitations are on Methodology",
        path: "/methodology",
        linkLabel: "read methodology and disclaimers",
      },
    ],
    footerLinks: [
      { path: "/methodology", label: "Methodology & validation transparency" },
      { path: "/contact", label: "Contact TargetForge" },
    ],
    includeHomeJsonLd: true,
  },
  "/target-discovery": {
    eyebrow: "TargetForge · target discovery",
    h1: "Target Discovery",
    intro: TARGET_DISCOVERY_COPY.lead,
    breadcrumbLabel: "Target identification",
  },
  "/repurposing": {
    eyebrow: "TargetForge · drug repurposing screen",
    h1: "Drug Repurposing Screen",
    // Was "target-aware heuristics", which implied the rules carry target
    // information that works. On the scaffold-split benchmark the rule table
    // alone scored below a seeded random ranker, because its drug-name regexes
    // fire on no held-out molecule.
    intro:
      "Search a target and screen approved drugs against the selected structure. Ranking is a hand-written rule table plus Lipinski and Veber drug-likeness, measured at chance against a seeded random ranker on a scaffold-split benchmark. It filters out liabilities; it does not confirm clinical activity and does not predict binding.",
    breadcrumbLabel: "Drug repurposing",
  },
  "/adme": {
    eyebrow: "TargetForge · ADME profiling",
    h1: "ADME & Pharmacokinetic Profiling",
    intro:
      "Calculate physicochemical properties, rule-based druglikeness filters (Lipinski, Veber, Ghose), and BOILED-Egg absorption models — evaluated locally with RDKit. Supports ADME triage for lead optimization.",
    breadcrumbLabel: "ADME analysis",
  },
  "/docking": {
    eyebrow: "TargetForge · molecular docking",
    h1: "Receptor-Ligand Molecular Docking",
    intro:
      DOCKING_STATUS.sentence,
    breadcrumbLabel: "Molecular docking",
  },
  "/methodology": {
    eyebrow: "Scientific methodology & validation transparency",
    h1: "Evaluation Criteria, Computational Heuristics & Operational Boundaries",
    // "hypothesis generation" named a module that has since been deleted.
    intro:
      "TargetForge is an early-stage computational workbench for hit triage and structural evaluation. This page documents scoring criteria, cheminformatics rules, design choices, and the measured held-out performance of every score — including the ones that failed and were removed.",
    breadcrumbLabel: "Methodology",
  },
  "/contact": {
    eyebrow: "TargetForge · get in touch",
    h1: "Contact us",
    intro:
      "Questions about TargetForge workflows, collaborations, or feedback on computational drug discovery tools — send a note and we will get back to you.",
    breadcrumbLabel: "Contact",
  },
};

export function getRelatedWorkflowLinks(currentPath) {
  return WORKFLOW_LINKS.filter((item) => item.path !== currentPath);
}

export { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION, WORKFLOW_LINKS };
