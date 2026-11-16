/**
 * Unit tests for enrichment metric helpers (server/benchmark/metrics.js & benchmark/docking/lib/metrics.py)
 * and Task 1 four-ranker baseline evaluation artifacts.
 */
import fs from "fs";
import path from "path";
import {
  rocAuc,
  bootstrapAucCi,
  enrichmentFactor,
  bedroc,
  evaluateRankerMetrics,
} from "../../server/benchmark/metrics";

describe("benchmark metrics", () => {
  it("computes perfect ROC-AUC", () => {
    expect(rocAuc([1, 1, 0, 0], [2, 1, 0, -1])).toBe(1);
  });

  it("computes worst-case ROC-AUC (0.0) and tied ROC-AUC (0.5)", () => {
    expect(rocAuc([1, 1, 0, 0], [-1, 0, 1, 2])).toBe(0);
    expect(rocAuc([1, 1, 0, 0], [5, 5, 5, 5])).toBe(0.5);
  });

  it("returns null when only one class is present", () => {
    expect(rocAuc([1, 1], [1, 2])).toBeNull();
    expect(enrichmentFactor([1, 1], [1, 2], 0.01)).toBeNull();
    expect(bedroc([1, 1], [1, 2], 20)).toBeNull();
  });

  it("computes tie-aware EF@1% and EF@5% invariant to array order", () => {
    const labelsActFirst = [
      ...Array(10).fill(1),
      ...Array(90).fill(0),
    ];
    const labelsDecFirst = [
      ...Array(90).fill(0),
      ...Array(10).fill(1),
    ];
    const constantScores = Array(100).fill(42);

    // Under constant tied scores, expected enrichment must be 1.0 regardless of input order
    expect(enrichmentFactor(labelsActFirst, constantScores, 0.01)).toBeCloseTo(1.0, 6);
    expect(enrichmentFactor(labelsDecFirst, constantScores, 0.01)).toBeCloseTo(1.0, 6);
    expect(enrichmentFactor(labelsActFirst, constantScores, 0.05)).toBeCloseTo(1.0, 6);
    expect(enrichmentFactor(labelsDecFirst, constantScores, 0.05)).toBeCloseTo(1.0, 6);

    // Perfect ranking on 10 actives / 90 decoys -> max EF = 1 / (10/100) = 10.0 at 1% and 5%
    const perfectScores = labelsActFirst.map((y, idx) => (y ? 100 - idx : 50 - idx));
    expect(enrichmentFactor(labelsActFirst, perfectScores, 0.01)).toBeCloseTo(10.0, 6);
    expect(enrichmentFactor(labelsActFirst, perfectScores, 0.05)).toBeCloseTo(10.0, 6);
  });

  it("computes BEDROC(alpha=20) with 1.0 for perfect ranking and 0.0 for inverted ranking", () => {
    const labels = [...Array(5).fill(1), ...Array(95).fill(0)];
    const perfectScores = labels.map((_, i) => 100 - i);
    const worstScores = labels.map((_, i) => i);

    expect(bedroc(labels, perfectScores, 20)).toBeCloseTo(1.0, 8);
    expect(bedroc(labels, worstScores, 20)).toBeCloseTo(0.0, 8);

    // Constant tied scores are order-invariant
    const labelsRev = [...labels].reverse();
    const tiedScores = Array(100).fill(10);
    expect(bedroc(labels, tiedScores, 20)).toBeCloseTo(bedroc(labelsRev, tiedScores, 20), 8);
  });

  it("computes bootstrap CI and full metric bundle deterministically", () => {
    const labels = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
    const scores = [9, 8, 2, 7, 6, 5, 4, 3, 1, 0];
    const bundle = evaluateRankerMetrics(labels, scores, { nBoot: 200, seed: 42, alpha: 20 });
    const ciOnly = bootstrapAucCi(labels, scores, { nBoot: 200, seed: 42 });
    expect(bundle.roc_auc).toBeCloseTo(ciOnly.auc, 8);
    expect(bundle.roc_auc).toBeGreaterThan(0.5);
    expect(bundle.ci_low).toBeLessThanOrEqual(bundle.roc_auc);
    expect(bundle.ci_high).toBeGreaterThanOrEqual(bundle.roc_auc);
    expect(bundle.ef_1pct).toBeGreaterThan(0);
    expect(bundle.ef_5pct).toBeGreaterThan(0);
    expect(bundle.bedroc_20).toBeGreaterThan(0);
    expect(bundle.bedroc_20).toBeLessThanOrEqual(1);
  });

  it("validates committed Task 1 four-ranker baseline results", () => {
    const jsonPath = path.resolve(
      __dirname,
      "../../benchmark/docking/results/task1_four_rankers.json"
    );
    expect(fs.existsSync(jsonPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(report.n_targets_total).toBe(15);
    expect(report.n_targets_passing_sanity).toBe(3);
    expect(report.heuristic_v2_beats_tanimoto_cocrystal).toBe(false);
    expect(report.heuristic_v2_beats_druglikeness_only_without_cocrystal).toBe(false);

    const requiredRankers = [
      "random",
      "druglikeness_only",
      "tanimoto_cocrystal",
      "heuristic_v2",
    ];
    for (const rk of requiredRankers) {
      const m = report.summary_sanity_passing_targets[rk];
      expect(typeof m.roc_auc).toBe("number");
      expect(typeof m.ci_low).toBe("number");
      expect(typeof m.ci_high).toBe("number");
      expect(typeof m.ef_1pct).toBe("number");
      expect(typeof m.ef_5pct).toBe("number");
      expect(typeof m.bedroc_20).toBe("number");
    }
  });
});
