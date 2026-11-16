"""ROC-AUC, Enrichment Factor (EF@1%, EF@5%), and BEDROC(alpha=20) metrics."""
from __future__ import annotations

import math
import random


def _build_tie_groups(labels: list[bool], scores: list[float]) -> tuple[list[dict], int]:
    pairs = [(1 if y else 0, float(s)) for y, s in zip(labels, scores)]
    pairs.sort(key=lambda p: p[1], reverse=True)
    groups: list[dict] = []
    for y, s in pairs:
        if not groups or groups[-1]["score"] != s:
            groups.append({
                "score": s,
                "count": 1,
                "actives": 1 if y else 0,
                "inactives": 0 if y else 1,
            })
        else:
            g = groups[-1]
            g["count"] += 1
            if y:
                g["actives"] += 1
            else:
                g["inactives"] += 1
    return groups, len(pairs)


def roc_auc(labels: list[bool], scores: list[float]) -> float | None:
    if not labels or not scores:
        return None
    groups, n = _build_tie_groups(labels, scores)
    n_pos = sum(g["actives"] for g in groups)
    n_neg = n - n_pos
    if not n_pos or not n_neg:
        return None
    tp = fp = 0
    auc = 0.0
    for g in groups:
        next_tp = tp + g["actives"]
        next_fp = fp + g["inactives"]
        auc += (tp + next_tp) * (next_fp - fp) / 2.0
        tp, fp = next_tp, next_fp
    return auc / (n_pos * n_neg)


def bootstrap_auc_ci(
    labels: list[bool], scores: list[float], n_boot: int = 800, seed: int = 42
) -> dict:
    base = roc_auc(labels, scores)
    if base is None:
        return {"auc": None, "ci_low": None, "ci_high": None}
    rng = random.Random(seed)
    n = len(labels)
    samples = []
    for _ in range(n_boot):
        idx = [rng.randrange(n) for _ in range(n)]
        labs = [labels[i] for i in idx]
        scs = [scores[i] for i in idx]
        a = roc_auc(labs, scs)
        if a is not None:
            samples.append(a)
    if not samples:
        return {"auc": base, "ci_low": base, "ci_high": base}
    samples.sort()
    lo = samples[int(0.025 * len(samples))]
    hi = samples[int(0.975 * len(samples))]
    return {"auc": base, "ci_low": lo, "ci_high": hi}


def enrichment_factor(labels: list[bool], scores: list[float], fraction: float = 0.01) -> float | None:
    if not labels or not scores:
        return None
    groups, n = _build_tie_groups(labels, scores)
    n_act = sum(g["actives"] for g in groups)
    if not n or not n_act or n_act == n:
        return None
    k = max(1, int(round(n * fraction)))
    seen = 0
    expected_hits = 0.0
    for g in groups:
        if seen + g["count"] <= k:
            expected_hits += g["actives"]
            seen += g["count"]
            if seen == k:
                break
        else:
            needed = k - seen
            expected_hits += g["actives"] * (needed / g["count"])
            break
    random_rate = n_act / n
    return (expected_hits / k) / random_rate if random_rate > 0 else None


def bedroc(labels: list[bool], scores: list[float], alpha: float = 20.0) -> float | None:
    """Boltzmann-Enhanced Discrimination of ROC (Truchon & Bayly, JCIM 2007)."""
    if not labels or not scores:
        return None
    groups, n = _build_tie_groups(labels, scores)
    n_act = sum(g["actives"] for g in groups)
    if not n or not n_act or n_act == n:
        return None
    rank_start = 1
    sum_exp = 0.0
    for g in groups:
        if g["actives"] > 0:
            group_exp = sum(math.exp(-alpha * r / n) for r in range(rank_start, rank_start + g["count"]))
            sum_exp += g["actives"] * (group_exp / g["count"])
        rank_start += g["count"]
    s_max = sum(math.exp(-alpha * r / n) for r in range(1, n_act + 1))
    s_min = sum(math.exp(-alpha * r / n) for r in range(n - n_act + 1, n + 1))
    denom = s_max - s_min
    if abs(denom) < 1e-15:
        return 0.5
    return max(0.0, min(1.0, (sum_exp - s_min) / denom))
