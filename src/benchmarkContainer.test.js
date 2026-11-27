/**
 * Contract tests for the reproducible benchmark container (`benchmark/Dockerfile`)
 * and single entrypoint (`run-benchmarks.sh` / `Makefile`).
 *
 * Ensures every required scientific/runtime tool is pinned to an explicit version
 * matching `benchmark/docking/requirements.txt` and `config.json`, and that every
 * harness in `benchmark/docking/scripts/` is wired into `run-benchmarks.sh` in
 * valid dependency order.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

describe("benchmark/Dockerfile pins every required toolchain version", () => {
  const dockerfile = read("benchmark/Dockerfile");
  const requirements = read("benchmark/docking/requirements.txt");
  const config = JSON.parse(read("benchmark/docking/config.json"));

  test("base images use explicit pinned tags, never :latest", () => {
    const fromLines = dockerfile
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("FROM "));
    expect(fromLines.length).toBeGreaterThanOrEqual(2);
    for (const line of fromLines) {
      expect(line).not.toMatch(/:latest\b/i);
      expect(line).toMatch(/:\S+/);
    }
  });

  test("pins Python, RDKit, AutoDock Vina, Open Babel, NumPy, SciPy, PDB2PQR, PROPKA, and Node", () => {
    const requiredArgs = [
      "PYTHON_VERSION",
      "VINA_VERSION",
      "OPENBABEL_VERSION",
      "RDKIT_VERSION",
      "MEEKO_VERSION",
      "GEMMI_VERSION",
      "SPYRMSD_VERSION",
      "NUMPY_VERSION",
      "SCIPY_VERSION",
      "PDB2PQR_VERSION",
      "PROPKA_VERSION",
      "NODE_VERSION",
      "RDKIT_JS_VERSION",
    ];
    for (const arg of requiredArgs) {
      const m = dockerfile.match(new RegExp(`ARG\\s+${arg}=([0-9]+\\.[0-9]+\\.[0-9]+[^\\s]*)`));
      expect(m).not.toBeNull();
    }
  });

  test("matches every pinned package version in benchmark/docking/requirements.txt", () => {
    const reqPins = requirements
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=="));
    expect(reqPins.length).toBeGreaterThanOrEqual(6);

    for (const [pkg, version] of reqPins) {
      const argName = `${pkg.toUpperCase()}_VERSION`;
      expect(dockerfile).toContain(`ARG ${argName}=${version}`);
    }
  });

  test("matches the AutoDock Vina version in benchmark/docking/config.json", () => {
    const m = String(config.engine).match(/(\d+\.\d+\.\d+)/);
    expect(m).not.toBeNull();
    expect(dockerfile).toContain(`ARG VINA_VERSION=${m[1]}`);
  });
});

describe("run-benchmarks.sh and Makefile cover every harness in benchmark/docking/scripts/", () => {
  const runnerPath = path.join(repoRoot, "run-benchmarks.sh");
  const runner = read("run-benchmarks.sh");
  const makefile = read("Makefile");

  const diskHarnesses = fs
    .readdirSync(path.join(repoRoot, "benchmark/docking/scripts"))
    .filter((f) => f.endsWith(".py") || f.endsWith(".mjs"))
    .sort();

  test("run-benchmarks.sh has valid bash syntax and is executable", () => {
    // The executable bit is read from git's index, not the filesystem.
    //
    // NTFS has no POSIX exec bit, so fs.statSync().mode always reported 0o666
    // on Windows and this test could never pass there. Git's index mode is
    // what actually ships, is the same on every platform, and is what decides
    // whether `./run-benchmarks.sh` works after a clone.
    //
    // It also caught a real one: the file was committed 100644, so the
    // `./run-benchmarks.sh` the README and Makefile tell people to run would
    // have failed with "Permission denied" on a fresh Linux checkout.
    const indexEntry = execFileSync("git", ["ls-files", "-s", "run-benchmarks.sh"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    expect(indexEntry).toMatch(/^100755\s/);
    expect(() => execFileSync("bash", ["-n", runnerPath])).not.toThrow();
  });

  test("Makefile defines the benchmark target invoking ./run-benchmarks.sh", () => {
    expect(makefile).toMatch(/^benchmark:/m);
    expect(makefile).toContain("./run-benchmarks.sh");
  });

  test("every .py and .mjs harness in benchmark/docking/scripts/ is listed by --list", () => {
    const output = execFileSync("bash", [runnerPath, "--list"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const listed = output
      .split("\n")
      .map((l) => l.match(/benchmark\/docking\/scripts\/([^\s]+)/))
      .filter(Boolean)
      .map((m) => m[1]);

    expect([...listed].sort()).toEqual(diskHarnesses);
  });

  test("harnesses execute in valid dependency order", () => {
    const output = execFileSync("bash", [runnerPath, "--list"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const order = output
      .split("\n")
      .map((l) => l.match(/benchmark\/docking\/scripts\/([^\s]+)/))
      .filter(Boolean)
      .map((m) => m[1]);

    const idx = (name) => order.indexOf(name);

    expect(idx("evaluate_rankers.mjs")).toBeLessThan(idx("build_task2_benchmark.mjs"));
    expect(idx("build_task2_benchmark.mjs")).toBeLessThan(idx("run_vina_vs_tanimoto.py"));
    expect(idx("build_target_features.mjs")).toBeLessThan(idx("tractability_models.mjs"));
    expect(idx("build_target_features.mjs")).toBeLessThan(idx("repurposing_validation.mjs"));
    expect(idx("run_25_drug_benchmark.py")).toBeLessThan(idx("validate_25_pairs.py"));
    expect(idx("run_redock_multiseed.py")).toBeLessThan(idx("generate_results_md.py"));
    expect(idx("validate_25_pairs.py")).toBeLessThan(idx("generate_results_md.py"));
    expect(idx("run_enrichment.py")).toBeLessThan(idx("generate_results_md.py"));
  });

  test("run-benchmarks.sh bind-mounts the repo to /workspace so outputs persist on the host", () => {
    expect(runner).toMatch(/-v "\$\{REPO_ROOT\}:\/workspace"/);
    expect(runner).toMatch(/-w \/workspace/);
  });
});
