import React, { useCallback, useMemo, useState } from "react";

/**
 * Per-target prior-art checklist.
 *
 * The screen cannot establish that a target is unpursued: Open Targets records
 * approved and clinical-stage drugs, not failed, abandoned or unpublished
 * programmes. These are the checks that can establish it, and they are manual
 * by necessity — nothing here fetches a registry or a patent office. Every
 * entry is an outbound link the reader follows themselves.
 *
 * LINK VERIFICATION, done before shipping (a dead link here is worse than no
 * panel at all):
 *   Google Patents   https://patents.google.com/?q=            200, q honoured
 *   Lens.org         https://www.lens.org/.../list?q=          200, q honoured
 *   ClinicalTrials   https://clinicaltrials.gov/search?intr=   200, documented
 *   WHO ICTRP        https://trialsearch.who.int/?SearchTermStat=
 *                      200, and verified to filter: a real gene returns 65.8KB,
 *                      a nonsense gene 31.5KB, the bare page 36.4KB
 *   PubMed           https://pubmed.ncbi.nlm.nih.gov/?term=    2xx, term honoured
 *   CTRI             NO deep linking. ctri.nic.in/Clinicaltrials/advsearch.php
 *                      returns a byte-identical 11,734-byte form whether or not
 *                      a query parameter is supplied, so the parameter is
 *                      ignored. Linking a query URL would silently show an
 *                      unfiltered form and look like a search that found
 *                      nothing. The search page is linked instead and the query
 *                      is shown to copy.
 *
 * Checklist state is per-browser convenience only. It is written to
 * localStorage inside try/catch, is never sent anywhere, and is never read back
 * as a finding by anything.
 */

const STORAGE_PREFIX = "tf.neglect.checklist.";

/** CTRI has no query deep-link, so its row carries a query to paste instead. */
export function checklistFor(symbol, proteinName) {
  const sym = encodeURIComponent(String(symbol || "").trim());
  const name = String(proteinName || "").trim();
  const nameQ = encodeURIComponent(name);
  const pubmedQuery = `${symbol} AND (inhibitor OR antagonist OR agonist)`;

  const items = [
    {
      id: "patents-symbol",
      label: "Google Patents — gene symbol",
      href: `https://patents.google.com/?q=${sym}`,
    },
    {
      id: "patents-name",
      label: "Google Patents — protein name",
      href: name ? `https://patents.google.com/?q=${nameQ}` : null,
      skipReason: name ? null : "no protein name available for this target",
    },
    {
      id: "lens-symbol",
      label: "Lens.org patents — gene symbol",
      href: `https://www.lens.org/lens/search/patent/list?q=${sym}`,
    },
    {
      id: "lens-name",
      label: "Lens.org patents — protein name",
      href: name ? `https://www.lens.org/lens/search/patent/list?q=${nameQ}` : null,
      skipReason: name ? null : "no protein name available for this target",
    },
    {
      id: "clinicaltrials",
      label: "ClinicalTrials.gov — interventions",
      href: `https://clinicaltrials.gov/search?intr=${sym}`,
    },
    {
      id: "ictrp",
      label: "WHO ICTRP",
      href: `https://trialsearch.who.int/?SearchTermStat=${sym}`,
    },
    {
      id: "ctri",
      label: "CTRI (Clinical Trials Registry India)",
      href: "https://ctri.nic.in/Clinicaltrials/advsearch.php",
      // No deep linking: the parameter is ignored, so the query is shown to
      // paste rather than encoded into a URL that silently does nothing.
      pasteQuery: String(symbol || "").trim(),
      note:
        "CTRI does not support linking a query, so this opens the search page. " +
        "Paste the term into its search field.",
    },
    {
      id: "pubmed",
      label: "PubMed — pharmacology",
      href: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(pubmedQuery)}`,
      queryShown: pubmedQuery,
    },
  ];

  return items;
}

function readChecked(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Private windows, blocked site data, quota — all fine, the panel just
    // starts unchecked.
    return {};
  }
}

function writeChecked(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Losing the ticks is acceptable; failing the render is not.
  }
}

export default function TargetChecklist({ symbol, proteinName, ensemblId }) {
  const storageKey = `${STORAGE_PREFIX}${ensemblId || symbol || "unknown"}`;
  const items = useMemo(() => checklistFor(symbol, proteinName), [symbol, proteinName]);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(() => readChecked(storageKey));

  const toggle = useCallback(
    (id) => {
      setChecked((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        writeChecked(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const doneCount = items.filter((i) => checked[i.id]).length;

  return (
    <div className="nc-wrap">
      <button
        type="button"
        className="nc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide" : "Show"} prior-art checks
        <span className="nc-count">
          {doneCount}/{items.length}
        </span>
      </button>

      {open && (
        <ul className="nc-list">
          {items.map((item) => (
            <li key={item.id} className="nc-item">
              <label className="nc-label">
                <input
                  type="checkbox"
                  checked={Boolean(checked[item.id])}
                  onChange={() => toggle(item.id)}
                />
                <span className="nc-text">{item.label}</span>
              </label>

              {item.href ? (
                <a
                  className="nc-link"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open ↗
                </a>
              ) : (
                <span className="nc-skip">{item.skipReason}</span>
              )}

              {item.pasteQuery ? (
                <div className="nc-paste">
                  <span className="nc-note">{item.note}</span>
                  <code>{item.pasteQuery}</code>
                </div>
              ) : null}

              {item.queryShown ? (
                <div className="nc-paste">
                  <code>{item.queryShown}</code>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
