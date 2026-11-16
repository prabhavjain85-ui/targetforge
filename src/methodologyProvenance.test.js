/**
 * Acceptance test for the methodology validation section: every figure quoted
 * on the public page must trace to a generated file under benchmark/.
 *
 * The page previously said the docking engine "failed redocking on every
 * target tested" while RESULTS.md reported 10/11 passing for the Vina path.
 * Both were true of different engines and the page did not say which, so a
 * reader could not reconcile them. This test fails if the page and the
 * benchmark artifacts drift apart again.
 */
import fs from "fs";
import path from "path";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const page = read("src/MethodologyPage.jsx");
const results = read("benchmark/docking/RESULTS.md");
const task1 = read("benchmark/docking/TASK1_BASELINES.md");
const approved25 = JSON.parse(read("benchmark/docking/results/approved_25.json"));
const enrichment = JSON.parse(read("benchmark/docking/results/enrichment.json"));

describe("methodology page separates the two docking engines", () => {
  test("no longer claims blanket failure without naming the engine", () => {
    expect(page).not.toContain("failed redocking on every target tested");
  });

  test("names both engines and their different outcomes", () => {
    expect(page).toMatch(/in-browser empirical engine/i);
    expect(page).toMatch(/autodock vina/i);
    // The in-browser engine fails; the Vina path passes 10/11.
    expect(page).toMatch(/10 of 11 targets pass/i);
  });

  test("keeps the known ADRB2 failure visible with its reason", () => {
    expect(page).toMatch(/ADRB2/);
    expect(page).toMatch(/3SN6/);
    expect(page).toMatch(/fusion construct/i);
  });
});

describe("every quoted figure traces to a benchmark artifact", () => {
  test("redocking panel result matches RESULTS.md", () => {
    expect(results).toMatch(/10\/11 \(91%\)/);
    expect(page).toMatch(/10 of 11 targets pass \(91%\)/i);
  });

  test("pair reliability matches RESULTS.md", () => {
    expect(results).toMatch(/Reliable: 15\/25/);
    expect(page).toMatch(/15 of 25/i);
  });

  test("Spearman rho and its confidence interval match approved_25.json", () => {
    const rho = approved25.spearman_vina_vs_pchembl.rho;
    expect(rho).toBeCloseTo(-0.291, 3);
    expect(page).toContain("−0.291");
    // The interval spans zero; the page must not imply a reliable correlation.
    expect(page).toContain("−0.681 to 0.478");
    expect(page).toMatch(/spans zero/i);
  });

  test("per-target enrichment figures match enrichment.json", () => {
    const byTarget = {};
    for (const r of enrichment.targets || []) byTarget[String(r.target_id).toLowerCase()] = r;

    // Guard: if the artifact shape changes, fail loudly rather than pass vacuously.
    expect(Object.keys(byTarget).length).toBeGreaterThanOrEqual(3);

    // Each ROC-AUC, CI bound and EF@1% quoted on the page is read back from the
    // artifact and matched against the page text, so the two cannot drift.
    const expectations = [
      { id: "egfr", auc: "0.636", lo: "0.459", hi: "0.791", ef: "0.00", actives: 15, decoys: 50 },
      { id: "jak2", auc: "0.744", lo: "0.589", hi: "0.870", ef: "3.50", actives: 16, decoys: 40 },
      { id: "pde5a", auc: "0.800", lo: "0.668", hi: "0.911", ef: "0.00", actives: 18, decoys: 38 },
    ];

    for (const e of expectations) {
      const row = byTarget[e.id];
      expect(row).toBeDefined();
      expect(row.roc_auc).toBeCloseTo(Number(e.auc), 2);
      expect(row.roc_auc_ci_95[0]).toBeCloseTo(Number(e.lo), 2);
      expect(row.roc_auc_ci_95[1]).toBeCloseTo(Number(e.hi), 2);
      expect(row.ef1pct).toBeCloseTo(Number(e.ef), 2);
      expect(row.n_test_actives).toBe(e.actives);
      expect(row.n_test_decoys).toBe(e.decoys);
      // ...and the same numbers appear on the page.
      expect(page).toContain(e.auc);
      expect(page.toUpperCase()).toContain(e.id.toUpperCase());
    }

    // Two of the three targets show no early enrichment; the page states that.
    expect(page).toMatch(/EF@1% 0\.00/);
    expect(page).toMatch(/EF@1% 3\.50/);
    expect(page).toMatch(/no early enrichment/i);
  });

  test("the triage baseline finding matches TASK1_BASELINES.md", () => {
    expect(task1).toMatch(/DOES NOT beat/);
    expect(page).toMatch(/0\.583/);
    expect(page).toMatch(/0\.777/);
    expect(page).toMatch(/below chance/i);
  });

  test("provenance names the commit and the generation dates", () => {
    expect(page).toMatch(/2026-10-13/);
    expect(page).toMatch(/2026-11-16/);
    expect(page).toMatch(/83655b4/);
  });
});
