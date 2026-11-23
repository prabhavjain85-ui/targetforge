/**
 * Build scripts load a few application modules as plain Node ESM. Node does
 * not resolve extensionless relative specifiers the way webpack does, so a
 * module in one of those chains can compile under react-scripts and then fail
 * the deploy at a post-build step.
 *
 * That happened: adding `import { dockingStatusFromFlags } from
 * "./shared/dockingStatus"` to seoConfig.js passed `react-scripts build` and
 * then broke `node scripts/inject-seo-html.mjs` on Vercel with
 * ERR_MODULE_NOT_FOUND. It was missed locally because the build was checked by
 * running react-scripts directly instead of the full `npm run build`, so the
 * post-build step never ran.
 *
 * The chains are discovered from the scripts themselves rather than listed
 * here: a hardcoded list carried two stale paths out of a broken script and
 * reported them as Node-ESM failures, which was the wrong diagnosis.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const repoRoot = path.join(__dirname, "..");
const scriptsDir = path.join(repoRoot, "scripts");

/** Every relative application module a build script imports. */
function discoverEntrypoints() {
  const out = [];
  for (const name of fs.readdirSync(scriptsDir)) {
    if (!name.endsWith(".mjs")) continue;
    const text = fs.readFileSync(path.join(scriptsDir, name), "utf8");
    const re = /from\s+"\.\.\/((?:src|server)\/[^"]+)"/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ module: m[1], loadedBy: `scripts/${name}` });
    }
  }
  return out;
}

const ENTRYPOINTS = discoverEntrypoints();

describe("modules loaded by build scripts resolve under plain Node ESM", () => {
  test("at least one chain is discovered", () => {
    expect(ENTRYPOINTS.length).toBeGreaterThan(0);
  });

  test("every module a build script imports actually exists", () => {
    // precompute-docking-interactions.mjs imported ../src/pdbStructure.js and
    // ../src/dockingInteractions.js, which live in server/. A stale path like
    // that breaks a script silently until someone runs it.
    const missing = [];
    for (const { module: mod, loadedBy } of ENTRYPOINTS) {
      if (!fs.existsSync(path.join(repoRoot, mod))) {
        missing.push(`${loadedBy} imports ${mod}, which does not exist`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("each chain imports cleanly in Node ESM", () => {
    const failures = [];
    for (const { module: mod, loadedBy } of ENTRYPOINTS) {
      if (!fs.existsSync(path.join(repoRoot, mod))) continue;
      const abs = path.join(repoRoot, mod).split(path.sep).join("/");
      const res = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", `await import("file:///${abs}");`],
        { cwd: repoRoot, encoding: "utf8", timeout: 90000 }
      );
      const output = `${res.stdout || ""}${res.stderr || ""}`;
      const broke = /ERR_MODULE_NOT_FOUND|Cannot find module/.test(output);
      if (res.status !== 0 || broke) {
        const firstError =
          output.split("\n").find((l) => /Error|Cannot find/.test(l)) || `exit ${res.status}`;
        failures.push(`${mod} (via ${loadedBy}): ${firstError.trim().slice(0, 140)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("relative imports in those chains carry explicit extensions", () => {
    // Cheaper check that localises the fault to a file and specifier when the
    // import test above fails.
    const seen = new Set();
    const offenders = [];
    const visit = (rel) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) return;
      const text = fs.readFileSync(abs, "utf8");
      const re = /(?:import|export)[^;]*?from\s+"(\.[^"]+)"/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const spec = m[1];
        if (!/\.(js|jsx|json|mjs)$/.test(spec)) {
          offenders.push(`${rel}: ${spec}`);
          continue;
        }
        const dir = path.posix.dirname(rel.split(path.sep).join("/"));
        visit(path.posix.join(dir, spec));
      }
    };
    for (const { module: mod } of ENTRYPOINTS) visit(mod);
    expect(offenders).toEqual([]);
  });
});
