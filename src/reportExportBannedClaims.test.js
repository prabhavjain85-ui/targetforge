/**
 * An exported report leaves the app and is read without the page around it, so
 * a claim in a report cannot be corrected by a caveat elsewhere. These phrases
 * are banned from report output because each one asserts something the
 * benchmark does not support:
 *
 *   "ΔG" / "Ki" — the Vina service returns a scoring-function value. The app
 *     carried it as `deltaG` in kcal/mol and derived a Ki from it by the
 *     Boltzmann relation. Against measured potency that score correlated at
 *     Spearman −0.291, 95% CI −0.681 to 0.478, so neither the energy reading
 *     nor the derived constant is supported.
 *
 *   "Monte Carlo" / "Morris" — both described the in-browser empirical
 *     engine's search and force field. That engine is disabled and failed
 *     co-crystal redocking on every target tested, so citing its method
 *     described work no report contains.
 *
 *   "in-browser" — the engine that runs is AutoDock Vina as a service. The
 *     in-browser one is the one that failed, so the phrase tells a reader the
 *     opposite of what is true.
 *
 * The check runs against GENERATED MARKDOWN, not source text. src/
 * reportPdfParser.js legitimately contains "ΔG" in its Greek transliteration
 * table, and a grep over source would flag that.
 */
import {
  buildBenchReportMarkdown,
  buildDockingReportMarkdown,
  buildHistoryEntryReportMarkdown,
  buildRepurposingReportMarkdown,
  buildTargetDiscoveryReportMarkdown,
} from "./reportExport";

const BANNED = [
  // Word boundary on Ki so a target named "Kinase domain" is not a failure.
  // "ΔG" needs no boundary: it only ever appeared as a field label.
  { label: "ΔG", pattern: /ΔG/ },
  { label: "Ki", pattern: /\bKi\b/ },
  { label: "Monte Carlo", pattern: /Monte Carlo/i },
  { label: "Morris", pattern: /Morris/i },
  { label: "in-browser", pattern: /in-browser/i },
];

/**
 * Fixtures deliberately carry the old payload fields (deltaG, kiFormatted,
 * per-residue energy) and a target name containing "Kinase". A builder that
 * renders any of them fails here.
 */
const dockingArgs = {
  targetTitle: "EGFR Kinase domain",
  pdbId: "1M17",
  compoundName: "Erlotinib",
  smiles: "CCO",
  cid: 176870,
  dockingResults: {
    target: { pocketResiduesCount: 42, boxSize: 12 },
    rankedPoses: [
      { rank: 1, deltaG: -8.2, kiFormatted: "1.2 nM", rmsd: 0, hbondCount: 3 },
      { rank: 2, deltaG: -7.5, kiFormatted: "3.4 nM", rmsd: 1.24, hbondCount: 2 },
    ],
  },
  activePose: {
    rank: 1,
    deltaG: -8.2,
    kiFormatted: "1.2 nM",
    kiMolar: 1.2e-9,
    vdw: -8.2,
    hbondEnergy: -1.1,
    electrostatic: -0.4,
    desolvation: -0.2,
    torsional: 0.9,
    rmsd: 0,
    hbondCount: 3,
    hydrophobicCount: 6,
    residueBreakdown: [
      { resName: "MET", resSeq: 793, minDistance: 2.1, energy: -1.2, hbonds: 1 },
    ],
  },
};

const benchArgs = {
  protein: { id: "1M17", gene: "EGFR", title: "EGFR Kinase domain", resolution: "2.6 Å" },
  candidates: [{ cid: 176870 }],
  aiResult: {
    source: "heuristic",
    recommended: { cid: 176870, score: 81, reason: "Fits the hinge" },
    ranking: [{ name: "Erlotinib", cid: 176870, score: 81, reasoning: ["Hinge contact"] }],
    limitations: ["Triage only"],
  },
};

const repurposingArgs = {
  result: {
    target: { name: "EGFR Kinase domain", pdb_id: "1M17" },
    librarySize: 2400,
    scoredCount: 2100,
    recommended: { name: "Erlotinib", cid: 176870, score: 81 },
    ranking: [{ name: "Erlotinib", cid: 176870, score: 81, indication: "NSCLC" }],
    excluded: [{ cid: 1 }],
  },
};

const discoveryArgs = {
  result: {
    disease: { id: "EFO_0000305", name: "breast carcinoma", associationCount: 1200 },
    novelty: [{ symbol: "PALB2", noveltyScore: 72.8, geneticScore: 0.61, drugCount: 0 }],
    established: [{ symbol: "ERBB2", noveltyScore: 3.7, geneticScore: 0.9, drugCount: 14 }],
  },
  query: "breast cancer",
};

const REPORTS = [
  ["docking", () => buildDockingReportMarkdown(dockingArgs)],
  ["staging bench", () => buildBenchReportMarkdown(benchArgs)],
  ["repurposing", () => buildRepurposingReportMarkdown(repurposingArgs)],
  ["target discovery (novelty)", () => buildTargetDiscoveryReportMarkdown(discoveryArgs)],
  [
    "target discovery (established)",
    () => buildTargetDiscoveryReportMarkdown({ ...discoveryArgs, view: "established" }),
  ],
  [
    "history: staging bench",
    () =>
      buildHistoryEntryReportMarkdown({
        type: "staging-bench",
        title: "Bench run",
        snapshot: { protein: benchArgs.protein, candidates: benchArgs.candidates, aiResult: benchArgs.aiResult },
      }),
  ],
  [
    "history: repurposing",
    () =>
      buildHistoryEntryReportMarkdown({
        type: "repurposing-run",
        title: "Screen",
        snapshot: { ...repurposingArgs.result, topCandidates: repurposingArgs.result.ranking },
      }),
  ],
  [
    "history: target discovery",
    () =>
      buildHistoryEntryReportMarkdown({
        type: "target-discovery",
        title: "Discovery",
        snapshot: { result: discoveryArgs.result, query: "breast cancer", view: "novelty" },
      }),
  ],
  [
    "history: pdb search",
    () =>
      buildHistoryEntryReportMarkdown({
        type: "pdb-search",
        title: "PDB search",
        inputs: { query: "EGFR", pdbId: "1M17" },
        snapshot: { protein: benchArgs.protein },
      }),
  ],
  [
    "history: unknown type falls through to a JSON dump",
    () =>
      buildHistoryEntryReportMarkdown({
        type: "docking-run",
        title: "Docking",
        snapshot: { activePose: dockingArgs.activePose },
      }),
  ],
];

describe("exported reports never assert an energy, an affinity, or the failed engine", () => {
  test("every builder under test produces a non-empty report", () => {
    for (const [name, build] of REPORTS) {
      expect(build().length).toBeGreaterThan(200);
      expect(name).toBeTruthy();
    }
  });

  for (const [name, build] of REPORTS) {
    for (const { label, pattern } of BANNED) {
      test(`${name} report does not contain "${label}"`, () => {
        const markdown = build();
        const offending = markdown
          .split("\n")
          .filter((line) => pattern.test(line))
          .slice(0, 5);
        expect(offending).toEqual([]);
      });
    }
  }

  test("the docking report still reports what Vina does produce", () => {
    const markdown = buildDockingReportMarkdown(dockingArgs);
    expect(markdown).toContain("Vina score");
    expect(markdown).toMatch(/RMSD/);
    expect(markdown).toContain("Hydrogen bonds");
    expect(markdown).toContain("Hydrophobic contacts");
    expect(markdown).toContain("MET-793");
    // The score itself is rendered, unitless.
    expect(markdown).toMatch(/\*\*Vina score[^*]*:\*\* -8\.20/);
    expect(markdown).not.toMatch(/-8\.20?\s*kcal/);
  });

  test("the docking report carries the measured Vina limitations, not a method citation", () => {
    const markdown = buildDockingReportMarkdown(dockingArgs);
    expect(markdown).toContain("10/11");
    expect(markdown).toContain("15/25");
    expect(markdown).toContain("Spearman −0.291 (95% CI −0.681 to 0.478)");
    expect(markdown).toContain("benchmark/docking/RESULTS.md");
  });

  test("every report is stamped with its generating commit and a timestamp", () => {
    for (const [name, build] of REPORTS) {
      const markdown = build();
      expect(markdown).toMatch(/\*\*Generated:\*\* .+/);
      expect(markdown).toMatch(/\*\*Provenance:\*\* app commit .+benchmark commit/s);
      expect(name).toBeTruthy();
    }
  });

  test("the banned patterns actually bite", () => {
    // A guard that cannot fail is not a guard. Each pattern is checked against
    // the string it exists to catch, and against a lookalike it must allow.
    expect(BANNED.find((b) => b.label === "ΔG").pattern.test("**Predicted ΔG_bind:** -8.2")).toBe(true);
    expect(BANNED.find((b) => b.label === "Ki").pattern.test("**Est. Ki:** 1.2 nM")).toBe(true);
    expect(BANNED.find((b) => b.label === "Ki").pattern.test("EGFR Kinase domain")).toBe(false);
    expect(BANNED.find((b) => b.label === "Monte Carlo").pattern.test("Monte Carlo search")).toBe(true);
    expect(BANNED.find((b) => b.label === "Morris").pattern.test("Morris et al. 2009")).toBe(true);
    expect(BANNED.find((b) => b.label === "in-browser").pattern.test("in-browser docking engine")).toBe(true);
  });
});
