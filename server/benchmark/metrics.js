/**
 * Enrichment & ranking evaluation metrics for TargetForge benchmarks.
 *
 * Implements:
 *   - rocAuc(labels, scores)               — trapezoidal ROC-AUC (tie-aware)
 *   - bootstrapAucCi(labels, scores, opts) — ROC-AUC with 95% bootstrap CI
 *   - enrichmentFactor(labels, scores, f)  — EF@1% (f=0.01), EF@5% (f=0.05) (tie-aware)
 *   - bedroc(labels, scores, alpha=20)     — Boltzmann-Enhanced Discrimination of ROC
 *                                            (Truchon & Bayly, J. Chem. Inf. Model. 2007, 47, 488-508)
 *   - mulberry32(seed)                     — deterministic PRNG for reproducible bootstrap & random baseline
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Group sorted (label, score) pairs into tie blocks in descending score order.
 * Within each tie block:
 *   - score: shared numeric score
 *   - count: total molecules in tie block
 *   - actives: number of positives (y === 1 or y === true)
 *   - inactives: number of negatives
 */
function buildTieGroups(labels, scores) {
  const n = Math.min(labels.length, scores.length);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const y = labels[i] ? 1 : 0;
    const s = Number.isFinite(Number(scores[i])) ? Number(scores[i]) : -Infinity;
    pairs.push({ y, s });
  }
  pairs.sort((a, b) => b.s - a.s);

  const groups = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (groups.length === 0 || groups[groups.length - 1].score !== p.s) {
      groups.push({
        score: p.s,
        count: 1,
        actives: p.y ? 1 : 0,
        inactives: p.y ? 0 : 1,
      });
    } else {
      const g = groups[groups.length - 1];
      g.count += 1;
      if (p.y) g.actives += 1;
      else g.inactives += 1;
    }
  }
  return { groups, n };
}

/**
 * Trapezoidal ROC-AUC with exact handling of tied scores.
 * Returns null if all labels belong to a single class or input is empty.
 */
export function rocAuc(labels, scores) {
  if (!Array.isArray(labels) || !Array.isArray(scores) || labels.length === 0) {
    return null;
  }
  const { groups, n } = buildTieGroups(labels, scores);
  let nPos = 0;
  for (const g of groups) nPos += g.actives;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return null;

  let tp = 0;
  let fp = 0;
  let auc = 0;
  for (const g of groups) {
    const nextTp = tp + g.actives;
    const nextFp = fp + g.inactives;
    auc += ((tp + nextTp) * (nextFp - fp)) / 2;
    tp = nextTp;
    fp = nextFp;
  }
  return auc / (nPos * nNeg);
}

/**
 * Bootstrap 95% confidence interval for ROC-AUC.
 */
export function bootstrapAucCi(labels, scores, { nBoot = 1000, seed = 42 } = {}) {
  const base = rocAuc(labels, scores);
  if (base === null) {
    return { auc: null, ciLow: null, ciHigh: null };
  }
  const n = Math.min(labels.length, scores.length);
  const rng = mulberry32(seed);
  const samples = [];
  const bootLabels = new Array(n);
  const bootScores = new Array(n);

  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      bootLabels[i] = labels[idx];
      bootScores[i] = scores[idx];
    }
    const a = rocAuc(bootLabels, bootScores);
    if (a !== null) samples.push(a);
  }
  if (samples.length === 0) {
    return { auc: base, ciLow: base, ciHigh: base };
  }
  samples.sort((a, b) => a - b);
  const loIdx = Math.min(samples.length - 1, Math.max(0, Math.floor(0.025 * samples.length)));
  const hiIdx = Math.min(samples.length - 1, Math.max(0, Math.floor(0.975 * samples.length)));
  return {
    auc: base,
    ciLow: samples[loIdx],
    ciHigh: samples[hiIdx],
  };
}

/**
 * Tie-aware Enrichment Factor at fraction (e.g. 0.01 for EF@1%, 0.05 for EF@5%).
 *
 * When a tie group straddles the cutoff k = max(1, round(n * fraction)),
 * computes the exact expected active hits under uniform tie breaking so that
 * array ordering of tied scores never inflates or deflates enrichment.
 */
export function enrichmentFactor(labels, scores, fraction = 0.01) {
  if (!Array.isArray(labels) || !Array.isArray(scores) || labels.length === 0) {
    return null;
  }
  const { groups, n } = buildTieGroups(labels, scores);
  let nAct = 0;
  for (const g of groups) nAct += g.actives;
  if (n === 0 || nAct === 0 || nAct === n) return null;

  const k = Math.max(1, Math.round(n * fraction));
  let seen = 0;
  let expectedHits = 0;

  for (const g of groups) {
    if (seen + g.count <= k) {
      expectedHits += g.actives;
      seen += g.count;
      if (seen === k) break;
    } else {
      const needed = k - seen;
      expectedHits += g.actives * (needed / g.count);
      break;
    }
  }

  const randomRate = nAct / n;
  return expectedHits / k / randomRate;
}

/**
 * Boltzmann-Enhanced Discrimination of ROC (BEDROC) at exponential weight alpha
 * (default alpha = 20.0, focusing ~80% of weight on the top ~8% of the ranked list).
 *
 * Reference:
 *   Truchon & Bayly, "Evaluating Virtual Screening Methods: Good and Bad Metrics
 *   for the 'Early Recognition' Problem", J. Chem. Inf. Model. 2007, 47, 488-508.
 *
 * Tie groups are evaluated analytically via the expected sum of exp(-alpha * r / N)
 * across the 1-based ranks r spanned by the tie group, making the metric strictly
 * invariant to the input ordering of tied scores.
 */
export function bedroc(labels, scores, alpha = 20.0) {
  if (!Array.isArray(labels) || !Array.isArray(scores) || labels.length === 0) {
    return null;
  }
  if (!(alpha > 0)) {
    throw new Error("bedroc alpha must be positive");
  }
  const { groups, n } = buildTieGroups(labels, scores);
  let nAct = 0;
  for (const g of groups) nAct += g.actives;
  if (n === 0 || nAct === 0 || nAct === n) return null;

  // Compute expected sum S = sum_{actives} exp(-alpha * r / n) for 1-based rank r in 1..n
  let rankStart = 1;
  let sumExp = 0;
  for (const g of groups) {
    if (g.actives > 0) {
      let groupExpSum = 0;
      for (let r = rankStart; r < rankStart + g.count; r++) {
        groupExpSum += Math.exp((-alpha * r) / n);
      }
      sumExp += g.actives * (groupExpSum / g.count);
    }
    rankStart += g.count;
  }

  // Exact S_max (actives at ranks 1..nAct) and S_min (actives at ranks n-nAct+1..n)
  let sMax = 0;
  for (let r = 1; r <= nAct; r++) {
    sMax += Math.exp((-alpha * r) / n);
  }
  let sMin = 0;
  for (let r = n - nAct + 1; r <= n; r++) {
    sMin += Math.exp((-alpha * r) / n);
  }

  const denom = sMax - sMin;
  if (Math.abs(denom) < 1e-15) return 0.5;
  const val = (sumExp - sMin) / denom;
  return Math.max(0, Math.min(1, val));
}

/**
 * Tie-aware Precision-Recall AUC (Average Precision) invariant to input ordering of tied scores.
 * Returns null if all labels belong to a single class or input is empty.
 */
export function prAuc(labels, scores) {
  if (!Array.isArray(labels) || !Array.isArray(scores) || labels.length === 0) {
    return null;
  }
  const { groups, n } = buildTieGroups(labels, scores);
  let nPos = 0;
  for (const g of groups) nPos += g.actives;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return null;

  let tp = 0;
  let seen = 0;
  let ap = 0;

  for (const g of groups) {
    if (g.actives > 0) {
      const rate = g.actives / g.count;
      let groupPrecSum = 0;
      for (let j = 1; j <= g.count; j++) {
        groupPrecSum += (tp + j * rate) / (seen + j);
      }
      ap += (g.actives / nPos) * (groupPrecSum / g.count);
    }
    tp += g.actives;
    seen += g.count;
  }

  return Math.max(0, Math.min(1, ap));
}

/**
 * Bootstrap 95% confidence interval for PR-AUC (Average Precision).
 */
export function bootstrapPrAucCi(labels, scores, { nBoot = 1000, seed = 42 } = {}) {
  const base = prAuc(labels, scores);
  if (base === null) {
    return { prAuc: null, ciLow: null, ciHigh: null };
  }
  const n = Math.min(labels.length, scores.length);
  const rng = mulberry32(seed);
  const samples = [];
  const bootLabels = new Array(n);
  const bootScores = new Array(n);

  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      bootLabels[i] = labels[idx];
      bootScores[i] = scores[idx];
    }
    const a = prAuc(bootLabels, bootScores);
    if (a !== null) samples.push(a);
  }
  if (samples.length === 0) {
    return { prAuc: base, ciLow: base, ciHigh: base };
  }
  samples.sort((a, b) => a - b);
  const loIdx = Math.min(samples.length - 1, Math.max(0, Math.floor(0.025 * samples.length)));
  const hiIdx = Math.min(samples.length - 1, Math.max(0, Math.floor(0.975 * samples.length)));
  return {
    prAuc: base,
    ciLow: samples[loIdx],
    ciHigh: samples[hiIdx],
  };
}

/**
 * Compute the complete Task 1/2/3 metric bundle for a single (labels, scores) vector.
 */
export function evaluateRankerMetrics(labels, scores, { nBoot = 1000, seed = 42, alpha = 20.0 } = {}) {
  const { auc, ciLow, ciHigh } = bootstrapAucCi(labels, scores, { nBoot, seed });
  const pr = prAuc(labels, scores);
  const ef1 = enrichmentFactor(labels, scores, 0.01);
  const ef5 = enrichmentFactor(labels, scores, 0.05);
  const bedroc20 = bedroc(labels, scores, alpha);
  return {
    roc_auc: auc,
    ci_low: ciLow,
    ci_high: ciHigh,
    pr_auc: pr,
    ef_1pct: ef1,
    ef_5pct: ef5,
    bedroc_20: bedroc20,
  };
}
