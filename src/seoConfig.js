import { dockingStatusFromFlags } from "./shared/dockingStatus";

/** Derived once: the only place docking status is written is dockingStatus.js. */
const DOCKING_STATUS = dockingStatusFromFlags();

const SITE_URL = "https://www.targetforge.in";
const SITE_NAME = "TargetForge";

const DEFAULT_TITLE = "TargetForge — AI-Powered Drug Discovery & Target Identification";
const DEFAULT_DESCRIPTION =
  `Computational drug discovery workbench: knowledge-based triage scoring, target identification, repurposing screens, and ADME analysis. ${DOCKING_STATUS.short}.`;

export const ROUTE_SEO = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}/`,
  },
  "/target-discovery": {
    title: "Target Identification & Discovery — TargetForge",
    description:
      "Find genetically validated, underexplored protein targets for a disease using Open Targets evidence. Helps researchers prioritize candidates for follow-up screening.",
    canonical: `${SITE_URL}/target-discovery`,
  },
  "/repurposing": {
    title: "Drug Repurposing Screen — TargetForge",
    description:
      "Screen approved drugs against a protein target to surface repurposing candidates. Uses a knowledge-based triage score (curated rules), not a validated activity predictor, across a curated library.",
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
    h1: "AI-Powered Drug Discovery & Target Identification",
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
    intro:
      "Find genetically validated but underexplored protein targets for a disease — opportunities with strong biological evidence and little to no existing drug coverage. TargetForge supports target identification by ranking Open Targets associations; it does not replace experimental target validation.",
    breadcrumbLabel: "Target identification",
  },
  "/repurposing": {
    eyebrow: "TargetForge · drug repurposing screen",
    h1: "Drug Repurposing Screen",
    intro:
      "Search a target and screen approved drugs for repurposing candidates. TargetForge scores each compound against the selected structure using target-aware heuristics across a curated library of marketed small molecules. Results help researchers prioritize follow-up — not confirm clinical activity.",
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
    intro:
      "TargetForge is an early-stage computational workbench designed to accelerate hit triage, structural evaluation, and hypothesis generation. This page documents scoring criteria, cheminformatics rules, algorithmic design choices, and operational boundaries for computational drug discovery.",
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
