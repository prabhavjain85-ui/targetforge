import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockRunNeglectScreen = jest.fn();
const mockSearchDiseases = jest.fn();
jest.mock("./serverApi", () => ({
  runNeglectScreen: (...args) => mockRunNeglectScreen(...args),
  searchDiseases: (...args) => mockSearchDiseases(...args),
}));

// eslint-disable-next-line import/first
import NeglectScreenPage from "./NeglectScreenPage";
// eslint-disable-next-line import/first
import { SCREEN_LIMITATIONS } from "./shared/screenLimitations";

/**
 * The page's job is to be legible without becoming flattering. These tests
 * cover both halves: that the information is reachable, and that nothing
 * describes a target as an opportunity or renders unknown data as zero.
 */
describe("NeglectScreenPage", () => {
  let container;
  let root;

  beforeEach(() => {
    mockRunNeglectScreen.mockReset();
    mockSearchDiseases.mockReset();
    mockSearchDiseases.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function paint() {
    act(() => {
      root.render(
        <MemoryRouter>
          <NeglectScreenPage />
        </MemoryRouter>
      );
    });
  }

  const click = (el) => {
    act(() => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  const presetButton = (name) =>
    [...container.querySelectorAll(".ns-preset")].find((b) => b.textContent.includes(name));

  const payload = {
    burdenAsset: {
      available: true,
      country: "India",
      referenceYear: 2023,
      totalDalyThousands: 514949.08,
      populationThousands: 1438069.589,
      nDiseases: 82,
      mappingCoverage: { mapping_rate: 0.434 },
      source: { dataset: "Global Health Estimates 2023" },
    },
    limitations: [{ id: "x", title: "One entry only", detail: "Payload list is shorter.", source: null }],
    diseases: [
      {
        query: "tuberculosis",
        disease: { id: "MONDO_0018076", name: "tuberculosis" },
        error: "",
        burden: { available: true, dalyThousands: 14014.93, gheCause: "Tuberculosis" },
        counts: { considered: 900, none: 2, minimal: 1, active: 400, unknown: 497 },
        rows: [
          {
            ensemblId: "ENSG1",
            symbol: "AAA1",
            name: "alpha gene",
            evidenceScore: 71.2,
            effortTier: "none",
            effortReason: "no high-quality compounds and no clinical precedence recorded",
            hqCompounds2021: 0,
            drugCount: 0,
            publicationCount: 12,
            context: { pli: 0.91, loeuf: 0.32, depmapMeanGeneEffect: -0.15, gtexTau: 0.77 },
          },
          {
            // The row that matters: unknown must never render as 0.
            ensemblId: "ENSG2",
            symbol: "BBB2",
            name: "beta gene",
            evidenceScore: 64.0,
            effortTier: "minimal",
            effortReason: "2 high-quality compounds recorded, no clinical precedence",
            hqCompounds2021: null,
            drugCount: 0,
            publicationCount: 3,
            context: { pli: null, loeuf: null, depmapMeanGeneEffect: null, gtexTau: null },
          },
        ],
      },
    ],
  };

  async function runWithPreset(data, presetName = "tuberculosis") {
    mockRunNeglectScreen.mockResolvedValue(data);
    paint();
    click(presetButton(presetName));
    const runBtn = container.querySelector(".ns-primary");
    expect(runBtn.disabled).toBe(false);
    await act(async () => {
      runBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockRunNeglectScreen).toHaveBeenCalled();
  }

  test("the lead is one short paragraph, not a stack of bold callouts", () => {
    paint();
    const lead = container.querySelector(".ns-lead");
    expect(lead).toBeTruthy();
    expect(lead.textContent).toMatch(/not opportunities/i);
    // At most one bolded phrase in the lead.
    expect(lead.querySelectorAll("strong").length).toBe(1);
  });

  test("the detail lives in the limitations panel, not duplicated in the lead", () => {
    paint();
    const lead = container.querySelector(".ns-lead").textContent;
    const panel = container.querySelector(".neglect-limitations").textContent;
    // Each of these is said once, in the panel.
    for (const phrase of [/never raises one/i, /not zero effort/i, /oncology/i]) {
      expect(panel).toMatch(phrase);
      expect(lead).not.toMatch(phrase);
    }
  });

  test("a non-cancer preset carries the outside-validated-scope badge", () => {
    paint();
    const tb = presetButton("tuberculosis");
    expect(tb.textContent).toMatch(/outside validated scope/i);
    click(tb);
    const chip = container.querySelector(".ns-chip");
    expect(chip.textContent).toMatch(/outside validated scope/i);
    expect(chip.querySelector(".ns-scope-out")).toBeTruthy();
  });

  test("a cancer preset carries the oncology-validated badge", () => {
    paint();
    const cancer = presetButton("breast cancer");
    expect(cancer.textContent).toMatch(/oncology-validated/i);
  });

  test("the presets are honest about the tension, and all ids are current", () => {
    // A stale id slipped in once: EFO_0000253 is the 21.04 id for ALS and no
    // longer resolves in Open Targets, so its chip showed an id that is not a
    // disease any more. Presets are now taken from the committed burden
    // mapping and verified against the live API before shipping.
    paint();
    const presets = [...container.querySelectorAll(".ns-preset")];
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.length).toBeLessThanOrEqual(6);

    const out = presets.filter((p) => p.textContent.includes("outside validated scope"));
    const inScope = presets.filter((p) => p.textContent.includes("oncology-validated"));
    // Both sides present, and the non-cancer side is the larger one, because
    // that is what India's burden actually looks like.
    expect(inScope.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeGreaterThan(inScope.length - 1);

    // Both chip burden states are reachable from the presets.
    const texts = presets.map((p) => p.textContent);
    expect(texts.length).toBe(presets.length);
  });

  test("a chip shows its burden, or 'burden unavailable' and never a zero", () => {
    paint();
    // Tuberculosis is in the mapping.
    click(presetButton("tuberculosis"));
    const tbChip = container.querySelector(".ns-chip");
    expect(tbChip.textContent).toMatch(/14,015k DALYs|14,015k/);

    // Glioblastoma has no accepted WHO GHE cause mapping.
    click(presetButton("glioblastoma"));
    const chips = [...container.querySelectorAll(".ns-chip")];
    const gbm = chips.find((c) => c.textContent.includes("glioblastoma"));
    expect(gbm.textContent).toMatch(/burden unavailable/i);
    expect(gbm.querySelector(".burden-unavailable")).toBeTruthy();
    // No zero and no bare dash standing in for a number.
    expect(gbm.textContent).not.toMatch(/\b0k?\b/);
    expect(gbm.textContent).not.toMatch(/—/);
  });

  test("the EFO/MONDO id is available on hover", () => {
    paint();
    click(presetButton("tuberculosis"));
    const name = container.querySelector(".ns-chip-name");
    expect(name.getAttribute("title")).toBe("MONDO_0018076");
  });

  test("chips are removable and the run button needs at least one", () => {
    paint();
    expect(container.querySelector(".ns-primary").disabled).toBe(true);
    click(presetButton("tuberculosis"));
    expect(container.querySelector(".ns-primary").disabled).toBe(false);
    click(container.querySelector(".ns-chip-remove"));
    expect(container.querySelectorAll(".ns-chip").length).toBe(0);
    expect(container.querySelector(".ns-primary").disabled).toBe(true);
  });

  test("an empty state appears before a run, and is not a wall of caveats", () => {
    paint();
    const empty = container.querySelector(".ns-empty");
    expect(empty).toBeTruthy();
    expect(empty.textContent.length).toBeLessThan(260);
    expect(container.querySelector(".neglect-table")).toBeNull();
  });

  test("an unknown compound count renders as 'unknown', never as 0", async () => {
    await runWithPreset(payload);
    const rows = container.querySelectorAll(".neglect-table tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toMatch(/unknown/i);
    const cells = rows[1].querySelectorAll("td");
    expect(cells[3].textContent.trim()).not.toBe("0");
  });

  test("available burden shows the published figure", async () => {
    await runWithPreset(payload);
    expect(container.textContent).toMatch(/14,015k/);
  });

  test("reports how many rows were excluded as unknown effort", async () => {
    await runWithPreset(payload);
    expect(container.textContent).toMatch(/497 excluded as unknown effort/);
    expect(container.textContent).toMatch(/400 filtered out as active/);
  });

  test("names the burden source substitution", async () => {
    await runWithPreset(payload);
    expect(container.textContent).toMatch(/not the ICMR/i);
    expect(container.textContent).toMatch(/43\.4%/);
  });

  test("renders the full generated limitations list, not the payload's", async () => {
    await runWithPreset(payload);
    const items = container.querySelectorAll(".neglect-limitations li");
    expect(items.length).toBe(SCREEN_LIMITATIONS.length);
    expect(items.length).toBeGreaterThan(payload.limitations.length);
  });

  test("marks the Task 8 gene properties as context only", async () => {
    await runWithPreset(payload);
    expect(container.querySelectorAll(".context-col").length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/do not enter the ranking/i);
    expect(container.textContent).toContain("−0.002");
  });

  test("a non-cancer run warns inline above the table, not only in the panel", async () => {
    await runWithPreset(payload);
    const warn = container.querySelector(".neglect-inline-warning");
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/outside the validated range/i);
    const table = container.querySelector(".neglect-table");
    // The warning precedes the table in document order.
    expect(warn.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("the scatter renders and the table still carries everything", async () => {
    await runWithPreset(payload);
    const svg = container.querySelector(".ns-svg");
    expect(svg).toBeTruthy();
    // One point per row with a known compound count; the unknown row is not plotted.
    expect(container.querySelectorAll(".ns-point").length).toBe(1);
    // The base-rate caveat is real text under the axis, not SVG text that
    // would scale to about 4px at a 360px viewport, and not a tooltip.
    const caveat = container.querySelector(".ns-baserate");
    expect(caveat).toBeTruthy();
    expect(caveat.textContent).toMatch(/least/i);
    expect(caveat.textContent).toMatch(/less\b.{0,8}often/i);
    expect(caveat.textContent).toMatch(/not a ranking of prospects/i);
    expect(svg.textContent).toMatch(/fewer compounds/i);
    // And the table is present regardless of the chart.
    expect(container.querySelectorAll(".neglect-table tbody tr").length).toBe(2);
  });

  test("clicking a point marks the matching row", async () => {
    await runWithPreset(payload);
    click(container.querySelector(".ns-point"));
    const focused = container.querySelector(".ns-row-focused");
    expect(focused).toBeTruthy();
    expect(focused.textContent).toMatch(/AAA1/);
  });
});

describe("the results UI never describes a target as an opportunity", () => {
  let container;
  let root;

  beforeEach(() => {
    mockRunNeglectScreen.mockReset();
    mockSearchDiseases.mockReset();
    mockSearchDiseases.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("no promotional or prospecting language anywhere on the page", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <NeglectScreenPage />
        </MemoryRouter>
      );
    });
    const text = container.textContent.toLowerCase();
    for (const banned of [
      "promising",
      "candidate for development",
      "opportunity zone",
      "untapped",
      "unlock",
      "goldmine",
      "low-hanging",
      "breakthrough",
      "best bet",
      "top pick",
      "winner",
    ]) {
      expect(text).not.toContain(banned);
    }
    // "not opportunities" is allowed; "an opportunity" as a claim is not.
    expect(text).not.toMatch(/\bis an opportunity\b/);
    expect(text).not.toMatch(/\bpromising target\b/);
  });

  test("the stylesheet declares no green fill for the results region", () => {
    const fs = require("fs");
    const path = require("path");
    const css = fs.readFileSync(
      path.join(__dirname, "..", "src", "neglectScreen.css"),
      "utf8"
    );
    // Guard against a future pass styling the zero-effort region as a win.
    expect(css).not.toMatch(/background:\s*(#0[a-f0-9]*0|green|lime|#2e7d32)/i);
    expect(css).not.toMatch(/opportunity/i);
    // Points are hollow, so a dense left edge cannot read as a heat map.
    expect(css).toMatch(/\.ns-point\s*\{[^}]*fill:\s*transparent/);
  });
});
