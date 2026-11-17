/**
 * The validation page used to carry a hand-typed commit ("9406739", the commit
 * that committed the outputs) while the weights asset named a different
 * producing commit (7883506) and a run timestamp earlier than both. A reader
 * had no way to tell which run the figures came from.
 *
 * src/shared/validationProvenance.js is now generated from the weights asset.
 * This test re-runs that derivation and fails if the committed file has drifted
 * from it, so the two cannot disagree again.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  VALIDATION_COMMIT_SHORT,
  VALIDATION_GENERATED_AT,
  VALIDATION_GENERATOR,
  VALIDATION_PRODUCED_BY_COMMIT,
  VALIDATION_RUN_LINE,
} from "./shared/validationProvenance";

const repoRoot = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");
const weights = JSON.parse(read("server/data/novelty/fitted-simplex-weights.json"));

describe("validation provenance is derived, not typed", () => {
  test("every exported value matches the weights asset", () => {
    expect(VALIDATION_GENERATOR).toBe(weights.provenance.generator);
    expect(VALIDATION_GENERATED_AT).toBe(weights.provenance.generatedAt);
    expect(VALIDATION_PRODUCED_BY_COMMIT).toBe(weights.provenance.producedByCommit);
    expect(VALIDATION_COMMIT_SHORT).toBe(weights.provenance.producedByCommit.slice(0, 7));
  });

  test("the committed generated file is current", () => {
    // Regenerating must be a no-op. If this fails, run
    // `npm run build:validation-provenance` and commit the result.
    // Runs the real generator in --check mode, so this asserts the shipped
    // script rather than a reimplementation of its logic.
    const res = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "build-validation-provenance.mjs"), "--check"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect(`${res.stderr || ""}${res.stdout || ""}`).not.toMatch(/STALE/);
    expect(res.status).toBe(0);
  });

  test("the generator named is the script that writes the benchmark artifacts", () => {
    expect(VALIDATION_GENERATOR).toBe(
      "benchmark/docking/scripts/validate_novelty_retrospective.mjs"
    );
    expect(fs.existsSync(path.join(repoRoot, VALIDATION_GENERATOR))).toBe(true);
  });

  test("the run line names the generator, the timestamp and the commit", () => {
    expect(VALIDATION_RUN_LINE).toContain(VALIDATION_GENERATOR);
    expect(VALIDATION_RUN_LINE).toContain(VALIDATION_GENERATED_AT);
    expect(VALIDATION_RUN_LINE).toContain(VALIDATION_COMMIT_SHORT);
  });

  test("no hand-typed commit constant survives in the copy module", () => {
    const copy = read("src/shared/validationCopy.js");
    expect(copy).not.toMatch(/VALIDATION_COMMIT\s*=\s*"/);
    expect(copy).not.toContain("9406739");
  });
});
