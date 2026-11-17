import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockRunNeglectScreen = jest.fn();
jest.mock("./serverApi", () => ({
  runNeglectScreen: (...args) => mockRunNeglectScreen(...args),
}));

// eslint-disable-next-line import/first
import NeglectScreenPage from "./NeglectScreenPage";

/**
 * Renders the screen against a payload shaped like the server's, so the
 * rules that matter are checked as displayed rather than as source text:
 * unknown effort must not appear as 0, burden must not appear as a number when
 * unavailable, and the limitations must be on the page.
 */
describe("NeglectScreenPage", () => {
  let container;
  let root;

  beforeEach(() => {
    mockRunNeglectScreen.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => {
      root.render(
        <MemoryRouter>
          <NeglectScreenPage />
        </MemoryRouter>
      );
    });
  }

  const payload = {
    burdenAsset: {
      available: true,
      country: "India",
      referenceYear: 2023,
      units: "DALYs in thousands, as published",
      totalDalyThousands: 514949.08,
      populationThousands: 1438069.589,
      nDiseases: 82,
      mappingCoverage: { mapping_rate: 0.434, n_unmapped: 107 },
      source: { dataset: "Global Health Estimates 2023" },
    },
    limitations: [
      {
        id: "why-passed-over",
        title: "It cannot tell you why a target was passed over",
        detail:
          "Most of the zero-effort tail is there for reasons no public dataset records, so absence of effort is not evidence of a missed opportunity.",
        source: null,
      },
      {
        id: "absence-is-not-zero",
        title: "Missing effort data is not zero effort",
        detail:
          "Open Targets 21.04 tractability joined 72.8% of targets, so a target with no record has unknown prior chemistry.",
        source: "benchmark/docking/results/task8_tractability.json",
      },
    ],
    diseases: [
      {
        query: "tuberculosis",
        disease: { id: "MONDO_0018076", name: "tuberculosis" },
        error: "",
        burden: {
          available: true,
          dalyThousands: 14014.93,
          gheCause: "Tuberculosis",
          referenceYear: 2023,
        },
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
      {
        query: "amyotrophic lateral sclerosis",
        disease: { id: "EFO_0000253", name: "amyotrophic lateral sclerosis" },
        error: "",
        burden: { available: false, reason: "no exact-match mapping from a WHO GHE cause" },
        counts: { considered: 500, none: 0, minimal: 0, active: 200, unknown: 300 },
        rows: [],
      },
    ],
  };

  test("renders the caveat banner before any table", () => {
    render();
    const text = container.textContent;
    expect(text).toMatch(/Read this before the table/i);
    expect(text).toMatch(/not opportunities/i);
    expect(text).toMatch(/filter, never a positive term/i);
    expect(text).toMatch(/not zero effort/i);
  });

  test("quotes the measured performance of the evidence axis", () => {
    render();
    const text = container.textContent;
    expect(text).toContain("0.721");
    expect(text).toContain("0.667");
    expect(text).toContain("0.772");
    expect(text).toMatch(/oncology-scoped/i);
  });

  /**
   * React tracks the input's value setter, so assigning `.value` directly does
   * not produce a change event it will act on. Going through the prototype
   * setter is the standard way to drive a controlled input without Testing
   * Library, which this project does not depend on.
   */
  function typeInto(el, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function runWith(data) {
    mockRunNeglectScreen.mockResolvedValue(data);
    render();
    const textarea = container.querySelector("#neglect-diseases");
    act(() => {
      typeInto(textarea, "tuberculosis");
    });
    const button = container.querySelector(".neglect-controls button");
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockRunNeglectScreen).toHaveBeenCalled();
  }

  test("an unknown compound count renders as 'unknown', never as 0", async () => {
    await runWith(payload);
    const rows = container.querySelectorAll(".neglect-table tbody tr");
    expect(rows.length).toBe(2);
    // Second row has hqCompounds2021 === null.
    expect(rows[1].textContent).toMatch(/unknown/i);
    // And the compound cell is not the digit zero.
    const cells = rows[1].querySelectorAll("td");
    expect(cells[3].textContent.trim()).not.toBe("0");
  });

  test("unavailable burden renders as Unavailable, not as a number", async () => {
    await runWith(payload);
    const text = container.textContent;
    expect(text).toMatch(/Unavailable/);
    // The ALS block has no rows and says so rather than showing an empty table.
    expect(text).toMatch(/That is a result, not an error/i);
  });

  test("available burden shows the published figure", async () => {
    await runWith(payload);
    expect(container.textContent).toMatch(/14,015k DALYs|14,015k/);
  });

  test("reports how many rows were excluded as unknown effort", async () => {
    await runWith(payload);
    const text = container.textContent;
    expect(text).toMatch(/497 excluded as unknown effort/);
    expect(text).toMatch(/400 filtered out as active/);
  });

  test("names the burden source substitution", async () => {
    await runWith(payload);
    const text = container.textContent;
    expect(text).toMatch(/not the ICMR/i);
    expect(text).toMatch(/43\.4%/);
  });

  test("renders every limitation the server returned", async () => {
    await runWith(payload);
    const items = container.querySelectorAll(".neglect-limitations li");
    expect(items.length).toBe(payload.limitations.length);
    expect(container.textContent).toMatch(/not evidence of a missed opportunity/i);
  });

  test("marks the Task 8 gene properties as context only", async () => {
    await runWith(payload);
    expect(container.querySelectorAll(".context-col").length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/do not enter the ranking/i);
    expect(container.textContent).toContain("−0.002");
  });

  test("carries no promotional language", async () => {
    await runWith(payload);
    const text = container.textContent.toLowerCase();
    for (const w of ["untapped", "unlock", "breakthrough", "revolutionary", "goldmine"]) {
      expect(text).not.toContain(w);
    }
  });
});
