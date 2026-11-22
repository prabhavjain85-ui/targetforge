/**
 * The repurposing score, after Task 10.
 *
 * The score that shipped before this was hand-weighted, never measured, and
 * gave drug count a bonus capped at 0.15 — the one feature Task 3 had already
 * measured as the strongest predictor of a target entering the clinic for a new
 * disease. These tests pin the replacement to the committed run and guard the
 * two claims it must not make.
 */
import fs from "fs";
import path from "path";
import {
  EVIDENCE_PROFILES,
  REPURPOSING_PERFORMANCE,
  REPURPOSING_PROVENANCE,
  repurposingSignal,
} from "../server/noveltyScore";
import { VALIDATION_SECTIONS } from "./shared/validationCopy";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");
const task10 = JSON.parse(read("benchmark/docking/results/task10_repurposing_validation.json"));
const asset = JSON.parse(read("server/data/novelty/fitted-repurposing-weights.json"));
const round = (x, d = 3) => Number(Number(x).toFixed(d));

describe("the shipped repurposing score is the fitted model", () => {
  test("its coefficients come from the committed Task 10 run", () => {
    const chosen = task10.conclusions.recommended_model;
    expect(chosen).toBe("R2");
    expect(asset.coefficients).toEqual(task10.coefficients[chosen].coefficients);
    expect(asset.intercept).toBe(task10.coefficients[chosen].intercept);
    expect(REPURPOSING_PERFORMANCE.rocAuc).toBe(task10.held_out.models[chosen].roc_auc);
  });

  test("it uses drug count and publication count, and nothing else", () => {
    expect(asset.feature_order).toEqual(["log1p_drug_count", "log1p_pub_count"]);
    // The old formula read seven datatype scores, an overall score and
    // tractability. The new one takes drug count and publication count.
    // Checked against the source, not Function.length, which is 0 here because
    // both parameters are defaulted.
    const src = read("server/noveltyScore.js");
    expect(src).toMatch(
      /export function repurposingSignal\(drugCount = 0, publicationCount = 0\)/
    );
    // Same two inputs at the one call site.
    expect(src).toMatch(/repurposingSignal\(drugCount, publicationCount\)/);
  });

  test("drug count dominates, as the measurement says it should", () => {
    expect(asset.coefficients.log1p_drug_count).toBeGreaterThan(
      asset.coefficients.log1p_pub_count * 5
    );
  });

  test("it rises monotonically with drug count", () => {
    const scores = [0, 1, 5, 27, 82].map((d) => repurposingSignal(d, 100));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
    expect(scores[0]).toBeGreaterThanOrEqual(0);
    expect(scores[scores.length - 1]).toBeLessThanOrEqual(100);
  });

  test("the hand-weighted formula is gone from production", () => {
    const src = read("server/noveltyScore.js");
    expect(src).not.toMatch(/REPURPOSING_WEIGHTS/);
    expect(src).not.toMatch(/globalDrugBonus/);
    expect(src).not.toMatch(/tractBoost/);
    const mod = require("../server/noveltyScore");
    expect(mod.REPURPOSING_WEIGHTS).toBeUndefined();
  });

  test("the historical weights survive only in the benchmark that condemned them", () => {
    const bench = read("benchmark/docking/scripts/repurposing_validation.mjs");
    expect(bench).toMatch(/const REPURPOSING_WEIGHTS = \{/);
    // The comment wraps, so match on a phrase that does not span a line.
    expect(bench).toMatch(/historical artifact/i);
    expect(bench).toMatch(/nothing outside this script should use them/i);
  });

  test("the evidence profile describes what the score now does", () => {
    const p = EVIDENCE_PROFILES.repurposing;
    expect(p.weights).toEqual(asset.coefficients);
    expect(p.description).toMatch(/0\.910/);
    expect(p.description).toMatch(/NEW disease/);
    // It must not still advertise tractability and pathway weighting.
    expect(p.description).not.toMatch(/affected pathways/i);
  });
});

describe("Task 10 figures trace to the committed run", () => {
  const section = VALIDATION_SECTIONS.find((s) => s.id === "repurposing");

  test("the validation page carries the section and its source", () => {
    expect(section).toBeTruthy();
    expect(section.source).toBe(
      "benchmark/docking/results/task10_repurposing_validation.json"
    );
  });

  test("every model figure on the page matches the artifact", () => {
    const m = task10.held_out.models;
    expect(round(m.R2.roc_auc)).toBe(0.91);
    expect(round(m.R1.roc_auc)).toBe(0.872);
    expect(round(m.R0.roc_auc)).toBe(0.707);
    expect(round(m.RS.roc_auc)).toBe(0.787);
    for (const n of ["0.910", "0.872", "0.707", "0.787", "0.195", "0.240"]) {
      expect(section.body).toContain(n);
    }
    expect(section.body).toContain("13,601");
    expect(section.body).toContain("300 positives");
  });

  test("the gain over the old score excludes zero under both schemes", () => {
    const p = task10.paired_deltas.R2_vs_RS.roc_auc;
    const c = task10.clustered_deltas.R2_vs_RS.roc_auc;
    expect(p.includes_zero).toBe(false);
    expect(c.includes_zero).toBe(false);
    expect(round(p.delta)).toBe(0.123);
    expect(section.body).toContain("+0.123");
    expect(section.body).toContain("+0.048");
  });

  test("the attention confound was checked and cleared", () => {
    const c = task10.clustered_deltas.R1_vs_R0.roc_auc;
    expect(task10.conclusions.drug_count_beats_attention).toBe(true);
    expect(c.includes_zero).toBe(false);
    expect(section.body).toContain("+0.164");
    expect(section.body).toMatch(/not just a popularity measure/i);
  });

  test("the biology null result is reported, not omitted", () => {
    expect(task10.conclusions.biology_features_add_over_drug_count).toBe(false);
    expect(section.body).toMatch(/adds nothing/i);
  });

  test("the old score's precision@25 edge is reported as noise, with the interval", () => {
    const pe = task10.precision_at_25_deltas.R2_vs_RS;
    expect(pe.includes_zero).toBe(true);
    expect(section.body).toContain("0.320");
    expect(section.body).toContain("−0.080");
    expect(section.body).toContain("+0.160");
    expect(section.body).toMatch(/no evidence it was better/i);
  });

  test("the page says what the score does not support", () => {
    expect(section.body).toMatch(/where effort has gone/i);
    expect(section.body).toMatch(/not about biology/i);
    expect(section.body).toMatch(/cannot tell you a repurposing hypothesis is correct/i);
    expect(section.body).toMatch(/oncology-scoped/i);
  });

  test("nothing was fitted on the held-out diseases", () => {
    expect(task10.n_train_diseases).toBe(11);
    expect(task10.n_test_diseases).toBe(11);
    expect(task10.leakage_controls.join(" ")).toMatch(/fitted on the 11 training diseases/i);
    expect(task10.leakage_controls.join(" ")).toMatch(/shipped score is not fitted/i);
  });
});
