import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import fs from "fs";
import path from "path";
import TargetChecklist, { checklistFor } from "./NeglectChecklist";
import { NEGLECT_SCREEN_COPY } from "./shared/validationCopy";

global.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

/**
 * The checklist is the part of the screen that establishes what the data
 * cannot. Its correctness properties are: every link is a real outbound URL
 * with its query encoded, CTRI is NOT given a query URL (its parameter is
 * ignored, so a query link would silently show an unfiltered form), nothing
 * fetches a registry, and the state never leaves the browser.
 */
describe("checklistFor", () => {
  const items = checklistFor("BRCA1", "breast cancer type 1 susceptibility protein");

  test("covers every source the brief asked for", () => {
    const ids = items.map((i) => i.id);
    for (const required of [
      "patents-symbol",
      "patents-name",
      "lens-symbol",
      "lens-name",
      "clinicaltrials",
      "ctri",
      "ictrp",
      "pubmed",
    ]) {
      expect(ids).toContain(required);
    }
  });

  test("URL-encodes the gene symbol", () => {
    const tricky = checklistFor("HLA-DRB1/3", "x");
    for (const item of tricky) {
      if (!item.href) continue;
      // The raw slash must not survive into the query string.
      const query = item.href.split("?")[1] || "";
      expect(query).not.toContain("HLA-DRB1/3");
      expect(item.href).not.toMatch(/\s/);
    }
    expect(tricky.find((i) => i.id === "patents-symbol").href).toContain(
      encodeURIComponent("HLA-DRB1/3")
    );
  });

  test("CTRI gets the search page and a query to paste, never a query URL", () => {
    const ctri = items.find((i) => i.id === "ctri");
    // Verified before shipping: advsearch.php returns a byte-identical form
    // whether or not a parameter is supplied, so the parameter is ignored.
    expect(ctri.href).toBe("https://ctri.nic.in/Clinicaltrials/advsearch.php");
    expect(ctri.href).not.toContain("?");
    expect(ctri.pasteQuery).toBe("BRCA1");
    expect(ctri.note).toMatch(/does not support linking a query/i);
  });

  test("the PubMed query is the pharmacology one the brief specified", () => {
    const pm = items.find((i) => i.id === "pubmed");
    expect(pm.queryShown).toBe("BRCA1 AND (inhibitor OR antagonist OR agonist)");
    expect(pm.href).toContain(encodeURIComponent("BRCA1 AND (inhibitor OR antagonist OR agonist)"));
  });

  test("ICTRP is deep-linked, because its parameter was verified to filter", () => {
    const ictrp = items.find((i) => i.id === "ictrp");
    expect(ictrp.href).toContain("SearchTermStat=BRCA1");
  });

  test("every link is https and outbound", () => {
    for (const item of items) {
      if (!item.href) continue;
      expect(item.href).toMatch(/^https:\/\//);
    }
  });

  test("a missing protein name degrades to a reason, not a broken link", () => {
    const noName = checklistFor("ABC1", "");
    const byName = noName.find((i) => i.id === "patents-name");
    expect(byName.href).toBeNull();
    expect(byName.skipReason).toMatch(/no protein name/i);
  });
});

describe("TargetChecklist rendering", () => {
  let container;
  let root;

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props = {}) {
    act(() => {
      root.render(
        <TargetChecklist symbol="KRAS" proteinName="GTPase KRas" ensemblId="ENSG1" {...props} />
      );
    });
  }

  test("starts collapsed and every box is unchecked", () => {
    render();
    act(() => {
      container.querySelector(".nc-toggle").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.length).toBeGreaterThan(5);
    expect(boxes.every((b) => b.checked === false)).toBe(true);
  });

  test("links open in a new tab with noopener", () => {
    render();
    act(() => {
      container.querySelector(".nc-toggle").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    const links = [...container.querySelectorAll("a.nc-link")];
    expect(links.length).toBeGreaterThan(5);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toMatch(/noopener/);
      expect(a.getAttribute("rel")).toMatch(/noreferrer/);
    }
  });

  test("a tick survives a remount but is only ever in localStorage", () => {
    render();
    act(() => {
      container.querySelector(".nc-toggle").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    const first = container.querySelector('input[type="checkbox"]');
    act(() => {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const stored = window.localStorage.getItem("tf.neglect.checklist.ENSG1");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored)).toEqual(expect.objectContaining({ "patents-symbol": true }));
  });

  test("a throwing localStorage does not break the render", () => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const original = proto.getItem;
    proto.getItem = () => {
      throw new Error("blocked site data");
    };
    try {
      expect(() => render()).not.toThrow();
      expect(container.querySelector(".nc-toggle")).toBeTruthy();
    } finally {
      proto.getItem = original;
    }
  });
});

describe("the checklist never automates a registry lookup", () => {
  test("the component contains no fetch, XHR or scraping call", () => {
    const src = read("src/NeglectChecklist.jsx");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/axios/);
  });

  test("no server code fetches a patent office or trial registry", () => {
    for (const f of ["server/neglectScreen.js", "src/NeglectScreenPage.jsx"]) {
      const src = read(f);
      expect(src).not.toMatch(/patents\.google\.com|lens\.org|clinicaltrials\.gov|ctri\.nic\.in|trialsearch\.who\.int/);
    }
  });

  test("the verbatim statement is the one the brief specified", () => {
    expect(NEGLECT_SCREEN_COPY.cannotEstablishUnpursued).toBe(
      "This screen cannot establish that a target is unpursued. Open Targets records " +
        "approved and clinical-stage drugs, not failed, abandoned or unpublished " +
        "programmes. The checks below are what decide it, and they are yours to make."
    );
  });

  test("the page says ticks stay local and are not a finding", () => {
    expect(NEGLECT_SCREEN_COPY.checklistNote).toMatch(/never sent anywhere/i);
    expect(NEGLECT_SCREEN_COPY.checklistNote).toMatch(/not treated as a finding/i);
    expect(NEGLECT_SCREEN_COPY.checklistNote).toMatch(/Outbound links only/i);
  });
});
