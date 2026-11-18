import React, { useMemo, useState } from "react";

/**
 * Effort against evidence, for the neglect screen.
 *
 * Inline SVG, following src/BoiledEggPlot.jsx: the repo has no charting
 * dependency and this view does not justify adding one.
 *
 * DELIBERATELY NOT STYLED AS DESIRABLE. The low-effort end of the x axis is
 * where this screen's rows live, and Task 8 measured low prior effort as
 * predicting AGAINST clinical progression — existing compound count was the
 * single strongest positive predictor in the study. So there is no green, no
 * highlight, no quadrant shading and no "opportunity" region. Points are drawn
 * in the same neutral ink as the rest of the page, and the left edge carries a
 * printed caveat saying it is the least likely region rather than the most.
 * A reader who comes away feeling they have found a prize list has been
 * misinformed by the chart.
 *
 * The table below carries everything this plot shows; the plot is never the
 * only route to the data.
 */

const WIDTH = 760;
const HEIGHT = 330;
const MARGIN = { top: 18, right: 18, bottom: 64, left: 56 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

/** Distinguishable at small sizes, and carrying no good/bad ordering. */
const DISEASE_INK = ["#4a6fa5", "#8a5a83", "#6b6b4f", "#3f7d78", "#8a6a3f", "#5f5f8a"];

/** Compound counts are heavily skewed, so x is log1p. */
const xScale = (compounds) => {
  const v = Math.log1p(Math.max(0, Number(compounds) || 0));
  // log1p(0)=0 at the left edge; log1p(20) covers the "minimal" tier with room.
  const max = Math.log1p(24);
  return MARGIN.left + Math.min(1, v / max) * INNER_W;
};

const yScale = (score) => {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return MARGIN.top + (1 - v / 100) * INNER_H;
};

/** Burden drives area, not radius, so the comparison is not exaggerated. */
function radiusFor(dalyThousands, maxDaly) {
  const MIN_R = 4;
  const MAX_R = 11;
  if (!Number.isFinite(dalyThousands) || !Number.isFinite(maxDaly) || maxDaly <= 0) {
    return 6; // equal size when burden is unavailable
  }
  const frac = Math.max(0, dalyThousands) / maxDaly;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(frac);
}

export default function NeglectScatter({ diseases = [], onPointClick }) {
  const [hover, setHover] = useState(null);

  const { points, anyBurdenUnavailable, maxDaly, legend } = useMemo(() => {
    const pts = [];
    let unavailable = false;
    let max = 0;
    const leg = [];

    diseases.forEach((d, di) => {
      if (!d || d.error || !Array.isArray(d.rows) || d.rows.length === 0) return;
      const ink = DISEASE_INK[di % DISEASE_INK.length];
      leg.push({
        name: d.disease?.name || d.query,
        ink,
        burdenAvailable: Boolean(d.burden?.available),
      });
      const daly = d.burden?.available ? Number(d.burden.dalyThousands) : null;
      if (daly === null) unavailable = true;
      if (Number.isFinite(daly)) max = Math.max(max, daly);

      for (const r of d.rows) {
        // Unknown-effort targets are excluded upstream by the screen; this is a
        // second guard so an unknown count can never be plotted as zero effort.
        if (r.hqCompounds2021 === null || r.hqCompounds2021 === undefined) continue;
        pts.push({
          key: `${d.query}:${r.ensemblId || r.symbol}`,
          symbol: r.symbol,
          compounds: r.hqCompounds2021,
          evidence: r.evidenceScore,
          effortTier: r.effortTier,
          ink,
          diseaseName: d.disease?.name || d.query,
          daly,
          ensemblId: r.ensemblId,
        });
      }
    });

    return { points: pts, anyBurdenUnavailable: unavailable, maxDaly: max, legend: leg };
  }, [diseases]);

  if (points.length === 0) return null;

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = [0, 1, 3, 10, 24];

  return (
    <figure className="ns-figure">
      <figcaption className="ns-figcaption">
        Prior chemistry against evidence. Each point is one target;{" "}
        {anyBurdenUnavailable
          ? "point size is India's DALY burden for the disease, drawn equal where that burden is unavailable"
          : "point size is India's DALY burden for the disease"}
        . The table below carries the same figures.
      </figcaption>

      <svg
        className="ns-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Scatter of ${points.length} targets: prior compound count on the horizontal axis, evidence score on the vertical axis. The same values are in the table below.`}
      >
        {/* axes */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + INNER_H}
          x2={MARGIN.left + INNER_W}
          y2={MARGIN.top + INNER_H}
          className="ns-axis"
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={MARGIN.top + INNER_H}
          className="ns-axis"
        />

        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={MARGIN.left}
              y1={yScale(t)}
              x2={MARGIN.left + INNER_W}
              y2={yScale(t)}
              className="ns-grid"
            />
            <text x={MARGIN.left - 8} y={yScale(t) + 4} className="ns-tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={xScale(t)}
            y={MARGIN.top + INNER_H + 16}
            className="ns-tick"
            textAnchor="middle"
          >
            {t}
          </text>
        ))}

        <text
          x={MARGIN.left + INNER_W / 2}
          y={HEIGHT - 30}
          className="ns-axis-label"
          textAnchor="middle"
        >
          High-quality compounds known in 2021 (log scale)
        </text>
        <text
          x={14}
          y={MARGIN.top + INNER_H / 2}
          className="ns-axis-label"
          textAnchor="middle"
          transform={`rotate(-90 14 ${MARGIN.top + INNER_H / 2})`}
        >
          Evidence score
        </text>

        {/* Direction only. The base-rate caveat itself is rendered as HTML
            beneath the plot: text inside this 760-wide viewBox scales with the
            SVG and would be about 4px tall at a 360px viewport, which is no
            way to carry the one sentence that stops the left edge reading as a
            prize. As HTML it stays legible, selectable and findable. */}
        <text x={MARGIN.left} y={HEIGHT - 12} className="ns-caveat" textAnchor="start">
          ← fewer compounds
        </text>

        {points.map((p) => (
          <circle
            key={p.key}
            cx={xScale(p.compounds)}
            cy={yScale(p.evidence)}
            r={radiusFor(p.daly, maxDaly)}
            className={"ns-point" + (hover === p.key ? " hovered" : "")}
            style={{ stroke: p.ink }}
            tabIndex={0}
            role="button"
            aria-label={`${p.symbol}, evidence score ${p.evidence}, ${p.compounds} compounds, ${p.diseaseName}`}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(p.key)}
            onBlur={() => setHover(null)}
            onClick={() => onPointClick && onPointClick(p)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && onPointClick) {
                e.preventDefault();
                onPointClick(p);
              }
            }}
          />
        ))}

        {hover
          ? (() => {
              const p = points.find((x) => x.key === hover);
              if (!p) return null;
              const px = xScale(p.compounds);
              const py = yScale(p.evidence);
              const right = px > MARGIN.left + INNER_W * 0.62;
              return (
                <g className="ns-tip" transform={`translate(${right ? px - 196 : px + 12}, ${Math.max(MARGIN.top, py - 46)})`}>
                  <rect width="188" height="58" rx="5" className="ns-tip-bg" />
                  <text x="9" y="17" className="ns-tip-strong">
                    {p.symbol}
                  </text>
                  <text x="9" y="32" className="ns-tip-text">
                    evidence {p.evidence} · {p.compounds} compound
                    {p.compounds === 1 ? "" : "s"}
                  </text>
                  <text x="9" y="47" className="ns-tip-text">
                    {p.daly === null
                      ? "burden unavailable"
                      : `${Math.round(p.daly).toLocaleString("en-IN")}k DALYs`}
                  </text>
                </g>
              );
            })()
          : null}
      </svg>

      {/* The base-rate caveat. Plain text immediately under the x axis, not a
          tooltip and not inside the SVG, so it survives a 360px viewport. */}
      <p className="ns-baserate">
        The left edge of this plot is the <strong>least</strong> likely region, not the most. Task 8
        measured prior compound count as the strongest single predictor of a target reaching the
        clinic, so targets with no recorded chemistry progressed <em>less</em> often than those with
        some. Position here is not a ranking of prospects.
      </p>

      {legend.length > 1 ? (
        <ul className="ns-legend">
          {legend.map((l) => (
            <li key={l.name}>
              <span className="ns-swatch" style={{ borderColor: l.ink }} />
              {l.name}
              {l.burdenAvailable ? null : <span className="ns-legend-note"> (burden unavailable)</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
