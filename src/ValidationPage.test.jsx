import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import ValidationPage from "./ValidationPage";

global.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The /validation page is the public record of how every score performs, so
 * it is rendered here rather than only checked as source text.
 */
describe("ValidationPage", () => {
  let container;
  let root;

  beforeEach(() => {
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
          <ValidationPage />
        </MemoryRouter>
      );
    });
    return container.textContent;
  }

  test("renders all three sections", () => {
    const text = render();
    expect(text).toMatch(/Target scores/);
    expect(text).toMatch(/Compound triage/);
    expect(text).toMatch(/Docking/);
  });

  test("shows the held-out figures for each target score", () => {
    const text = render();
    for (const n of ["0.637", "0.708", "0.667", "0.500"]) {
      expect(text).toContain(n);
    }
    expect(text).toContain("11,711");
    expect(text).toContain("258 positives");
    expect(text).toContain("2.2%");
  });

  test("reports the removed formula as below chance rather than omitting it", () => {
    const text = render();
    expect(text).toContain("0.361");
    expect(text).toContain("0.129");
    expect(text).toMatch(/below chance/i);
    expect(text).toMatch(/has been removed/i);
  });

  test("states that heuristic-v2 does not predict binding or activity", () => {
    const text = render();
    expect(text).toContain("0.662");
    expect(text).toContain("0.523");
    expect(text).toMatch(/drug-likeness and liability filter/i);
    expect(text).toMatch(/does not predict binding or activity/i);
  });

  test("reports docking honestly, including the disabled engine", () => {
    const text = render();
    expect(text).toContain("10/11");
    expect(text).toContain("15/25");
    expect(text).toContain("−0.291");
    expect(text).toMatch(/remains disabled/i);
  });

  test("says plainly that the progression model is largely a publication proxy", () => {
    const text = render();
    expect(text).toMatch(/publication-count proxy/i);
  });

  test("names the generating commit and a source file per section", () => {
    const text = render();
    expect(text).toMatch(/commit/i);
    // target scores, attention control, cancer stratification, tractability, triage, docking.
    expect(container.querySelectorAll(".validation-source").length).toBe(6);
    expect(text).toContain("benchmark/docking/results/task3_novelty_validation.json");
    expect(text).toContain("benchmark/docking/results/task4_attention_control.json");
    expect(text).toContain("benchmark/docking/results/task5_tractability.json");
    expect(text).not.toMatch(/Source:s*undefined/);
  });

  test("reports the attention control, including the part that fails", () => {
    const text = render();
    expect(text).toMatch(/Do the biology scores beat counting papers/i);
    // The nested models and the paired delta.
    for (const n of ["0.721", "0.683", "+0.054", "+0.021", "+0.089", "+0.012"]) {
      expect(text).toContain(n);
    }
    // And the stricter disease-level bootstrap, where PR-AUC does not survive.
    expect(text).toContain("0.003");
    expect(text).toContain("0.112");
    expect(text).toMatch(/includes zero/i);
    expect(text).toMatch(/not a replacement/i);
  });

  test("carries no promotional adjectives", () => {
    const text = render().toLowerCase();
    for (const word of ["powerful", "cutting-edge", "state-of-the-art", "revolutionary", "best-in-class"]) {
      expect(text).not.toContain(word);
    }
  });

  test("reports Task 5 as a negative result, not as a win", () => {
    const text = render();
    expect(text).toMatch(/Does anything else beat counting papers/i);
    for (const n of ["0.807", "0.719", "0.772", "0.621", "+0.140"]) {
      expect(text).toContain(n);
    }
    // The headline must be that gene properties add nothing.
    expect(text).toMatch(/add nothing/i);
    expect(text).toContain("−0.002");
    expect(text).toMatch(/no score was promoted/i);
  });

  test("reports the oncology scope limit as underpowered, not as generalisation", () => {
    const text = render();
    expect(text).toMatch(/Is that an oncology result/i);
    expect(text).toMatch(/underpowered to tell/i);
    // The cancer stratum reproducing the pooled result is the established part.
    expect(text).toContain("+0.057");
    expect(text).toContain("10,308");
    // The single non-cancer disease, reported as a count and not a comparison.
    expect(text).toContain("1,403");
    expect(text).toContain("−0.008");
    expect(text).toMatch(/cannot establish/i);
  });
});
