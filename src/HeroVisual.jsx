import React from "react";

/**
 * The homepage hero visual: a ligand seated in a binding pocket, drawn as
 * inline SVG.
 *
 * Inline rather than a rendered image so it stays sharp at any size, themes
 * from CSS custom properties, weighs nothing, and needs no asset pipeline.
 *
 * It is decorative and says so (aria-hidden): every fact it gestures at is
 * stated in text beside it. It depicts a generic pocket and a generic
 * ligand — it is NOT a real pose, a real structure, or output from any
 * engine, and nothing about it should be read as a result. The site does not
 * display docking poses.
 *
 * All motion is wrapped by a prefers-reduced-motion guard in the stylesheet,
 * which stops every animation rather than slowing it.
 */
export default function HeroVisual() {
  // Twelve pocket residues around the cavity mouth, placed on an ellipse.
  const residues = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return {
      i,
      x: 160 + Math.cos(a) * 104,
      y: 150 + Math.sin(a) * 74,
      delay: `${(i * 0.18).toFixed(2)}s`,
    };
  });

  return (
    <div className="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 320 300" role="presentation" focusable="false">
        <defs>
          <radialGradient id="tf-core" cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="var(--hero-core-hi)" />
            <stop offset="62%" stopColor="var(--hero-core-mid)" />
            <stop offset="100%" stopColor="var(--hero-core-lo)" />
          </radialGradient>
          <linearGradient id="tf-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--hero-accent)" stopOpacity="0.95" />
            <stop offset="50%" stopColor="var(--hero-accent-soft)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--hero-accent)" stopOpacity="0.8" />
          </linearGradient>
          <filter id="tf-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stacked plates: the pocket read as a shallow basin, seen at an angle. */}
        <g className="hv-plates">
          <ellipse cx="160" cy="214" rx="140" ry="40" className="hv-plate hv-plate-3" />
          <ellipse cx="160" cy="202" rx="118" ry="33" className="hv-plate hv-plate-2" />
          <ellipse cx="160" cy="192" rx="96" ry="27" className="hv-plate hv-plate-1" />
        </g>

        {/* Orbital rings. */}
        <g className="hv-rings">
          <ellipse
            cx="160"
            cy="150"
            rx="126"
            ry="90"
            className="hv-ring hv-ring-outer"
            stroke="url(#tf-ring)"
          />
          <ellipse cx="160" cy="150" rx="104" ry="74" className="hv-ring hv-ring-mid" />
        </g>

        {/* Pocket residues. */}
        <g className="hv-residues">
          {residues.map((r) => (
            <circle
              key={r.i}
              cx={r.x}
              cy={r.y}
              r="3.1"
              className="hv-residue"
              style={{ animationDelay: r.delay }}
            />
          ))}
        </g>

        {/* The cavity. */}
        <circle cx="160" cy="146" r="62" fill="url(#tf-core)" className="hv-core" />
        <circle cx="160" cy="146" r="62" className="hv-core-edge" />

        {/* The ligand: a fused bicyclic sketch with substituents. */}
        <g className="hv-ligand" filter="url(#tf-glow)">
          <path
            d="M146 124 L163 116 L178 126 L177 145 L160 154 L145 143 Z"
            className="hv-bond hv-ring-a"
          />
          <path d="M177 145 L194 152 L196 170 L180 179 L164 171 L160 154" className="hv-bond hv-ring-b" />
          <path d="M163 116 L162 101" className="hv-bond" />
          <path d="M194 152 L210 146" className="hv-bond" />
          <path d="M145 143 L130 150" className="hv-bond" />
          {[
            [146, 124],
            [163, 116],
            [178, 126],
            [177, 145],
            [160, 154],
            [145, 143],
            [194, 152],
            [196, 170],
            [180, 179],
            [164, 171],
          ].map(([x, y], i) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" className="hv-atom" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
          {/* Heteroatoms, marked only to break the monotony of the ring. */}
          <circle cx="162" cy="101" r="4.2" className="hv-atom hv-atom-het" />
          <circle cx="210" cy="146" r="4.2" className="hv-atom hv-atom-het" />
          <circle cx="130" cy="150" r="4.2" className="hv-atom hv-atom-het" />
        </g>

        {/* Contact dashes between ligand and pocket wall. */}
        <g className="hv-contacts">
          <line x1="162" y1="101" x2="160" y2="76" className="hv-contact" />
          <line x1="210" y1="146" x2="243" y2="150" className="hv-contact" style={{ animationDelay: "0.6s" }} />
          <line x1="130" y1="150" x2="98" y2="157" className="hv-contact" style={{ animationDelay: "1.2s" }} />
        </g>

        {/* Drifting motes, for depth. */}
        <g className="hv-motes">
          {[
            [72, 96],
            [252, 112],
            [96, 206],
            [238, 196],
            [160, 58],
          ].map(([x, y], i) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" className="hv-mote" style={{ animationDelay: `${i * 0.9}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}
