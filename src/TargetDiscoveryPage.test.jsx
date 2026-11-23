/**
 * The target discovery page had no render test, which is how a JSX comment
 * placed illegally as the direct child of a `&&` expression passed the whole
 * Jest suite and failed `npm run build` instead. The content sweep rewrote
 * this page's hero, tooltip and undrugged grouping, so it is mounted here.
 *
 * This is a smoke test plus the copy guarantees the sweep requires. It does
 * not exercise a search: the page fetches on submit, and the strings checked
 * here all render before any request.
 */
import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import TargetDiscoveryPage from "./TargetDiscoveryPage";
import { MEASURED, TARGET_DISCOVERY_COPY } from "./shared/validationCopy";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("TargetDiscoveryPage", () => {
  let container;
  let root;
  let fetchSpy;

  beforeEach(() => {
    // Nothing should fetch on mount; if anything does, it resolves empty
    // rather than leaving an unhandled rejection in the suite.
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({}), text: async () => "{}" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    fetchSpy.mockRestore();
  });

  function renderPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <TargetDiscoveryPage />
        </MemoryRouter>
      );
    });
    return container.textContent || "";
  }

  test("mounts without throwing", () => {
    expect(renderPage().length).toBeGreaterThan(100);
  });

  test("the hero renders the shared lead, not its own wording", () => {
    const text = renderPage();
    expect(text).toContain(TARGET_DISCOVERY_COPY.lead);
    expect(text).toMatch(/not opportunities/i);
  });

  test("no refuted claim is rendered", () => {
    const text = renderPage();
    for (const phrase of [
      /AI[-\s]?powered/i,
      /genetically[-\s]valid/i,
      /underexplored/i,
      /High-novelty/i,
    ]) {
      expect(text).not.toMatch(phrase);
    }
    // "novelty score" only ever as a denial.
    for (const sentence of text.split(/(?<=\.)\s*/)) {
      if (/novelty\s+score/i.test(sentence)) {
        expect(sentence).toMatch(/not a novelty score/i);
      }
    }
  });

  test("the empty state does not sell the absence of drugs", () => {
    const text = renderPage();
    expect(text).toMatch(/drug count for each shown as its own column/i);
    expect(text).not.toMatch(/little\s+existing drug coverage/i);
  });

  test("no evidence profile is labelled as finding novel targets", () => {
    // The default profile chip read "Novel Discovery", which asserts the one
    // thing no surface may assert.
    const text = renderPage();
    expect(text).not.toMatch(/Novel Discovery/);
    expect(text).toMatch(/Genetic & Somatic Evidence/);
  });

  test("no literal unicode escape reaches the rendered page", () => {
    // The old headline carried "🆕" as JSX text, so users saw the
    // escape sequence. Nothing may render one again.
    expect(renderPage()).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  /**
   * The results table, its score chips and the evidence tooltip only render
   * once a search returns, which needs a live Open Targets response. They are
   * covered as source text by src/methodologyProvenance.test.js instead; what
   * is NOT covered anywhere is their rendered form.
   */
  test("the tooltip and score columns are wired to the shared constants", () => {
    const source = require("fs").readFileSync(`${__dirname}/TargetDiscoveryPage.jsx`, "utf8");
    expect(source).toMatch(/MEASURED\.understudy\.rocUndrugged/);
    expect(source).toMatch(/MEASURED\.geneticAlone\.rocCohort2/);
    expect(source).toMatch(/MEASURED\.removedNoveltyFormula\.roc/);
    expect(source).toMatch(/TARGET_DISCOVERY_COPY\.evidenceTipTitle/);
    expect(source).toMatch(/SCORE_CHIPS\.understudy/);
    expect(source).toMatch(/SCORE_CHIPS\.progression/);
    expect(source).toMatch(/SCORE_CHIPS\.publications/);
    // The constants they point at are non-empty, so the wiring cannot resolve
    // to undefined without this failing.
    expect(TARGET_DISCOVERY_COPY.evidenceTipTitle.length).toBeGreaterThan(5);
    expect(MEASURED.understudy.rocUndrugged).toMatch(/^0\.\d+$/);
    expect(MEASURED.removedNoveltyFormula.roc).toMatch(/^0\.\d+$/);
  });
});
