import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packSkill } from "./pack.ts";
import { qualifySkill } from "./qualify.ts";
import { skillsDir } from "./skills.ts";

const passingTests = async () => ({ passed: true, output: "" });
const source = join(skillsDir(), "momentum-signal");

let skills: string;
let previousSkillsDir: string | undefined;

function copySkill(name: string, manifest: unknown): string {
  const directory = join(skills, name);
  cpSync(source, directory, { recursive: true });
  // The copy is always version 1, whatever version the source skill has reached.
  const blueprint = JSON.parse(readFileSync(join(directory, "blueprint.json"), "utf8"));
  writeFileSync(join(directory, "blueprint.json"), JSON.stringify({ ...blueprint, version: 1 }));
  writeFileSync(join(directory, "files", "revision.json"), JSON.stringify(manifest));
  return directory;
}

async function failures(directory: string): Promise<Record<string, string | undefined>> {
  const { record } = await qualifySkill(directory, { runTests: passingTests });
  return Object.fromEntries(record.checks.filter(c => !c.passed).map(c => [c.name, c.detail]));
}

beforeEach(() => {
  skills = mkdtempSync(join(tmpdir(), "gadgets-qualify-test-"));
  previousSkillsDir = process.env.GADGETS_SKILLS_DIR;
  process.env.GADGETS_SKILLS_DIR = skills;
});

afterEach(() => {
  if (previousSkillsDir === undefined) delete process.env.GADGETS_SKILLS_DIR;
  else process.env.GADGETS_SKILLS_DIR = previousSkillsDir;
});

describe("qualifySkill", () => {
  it("binds a passing record to the packed content hash", async () => {
    const directory = copySkill("signal", { kind: "skill" });
    const { record, packed } = await qualifySkill(directory, { runTests: passingTests });
    expect(record).toMatchObject({ kind: "skill", name: "signal", number: 1, passed: true, pins: [] });
    expect(record.contentHash).toBe(`sha256:${packed.contentSha256}`);
    expect(record.checks.map(c => c.name)).toEqual(
        ["manifest", "deterministic-pack", "pins", "secrets", "tests"]);
  });

  it("fails when the skill's tests fail, and still reports the other checks", async () => {
    const directory = copySkill("signal", { kind: "skill" });
    const { record } = await qualifySkill(directory,
        { runTests: async () => ({ passed: false, output: "1 failed" }) });
    expect(record.passed).toBe(false);
    expect(record.checks.filter(c => !c.passed).map(c => c.name)).toEqual(["tests"]);
  });

  it("requires a revision manifest with a known kind and no extra fields", async () => {
    const missing = join(skills, "bare");
    cpSync(source, missing, { recursive: true });
    rmSync(join(missing, "files", "revision.json"), { force: true });
    expect(await failures(missing)).toHaveProperty("manifest");
    expect(await failures(copySkill("odd", { kind: "plugin" }))).toHaveProperty("manifest");
    expect(await failures(copySkill("extra", { kind: "skill", authority: "live" })))
        .toHaveProperty("manifest");
  });

  it("accepts a pin only when it names the local revision exactly", async () => {
    const dependency = copySkill("signal", { kind: "skill" });
    const { contentSha256 } = await packSkill(dependency);
    const pin = { kind: "skill", name: "signal", number: 1, sha256: contentSha256 };

    expect(await failures(copySkill("ok", { kind: "workflow", pins: [pin] }))).toEqual({});
    expect(await failures(copySkill("stale-hash", { kind: "workflow", pins: [{ ...pin, sha256: "0".repeat(64) }] })))
        .toEqual({ pins: "Pin skill/signal@1 has a different content hash" });
    expect(await failures(copySkill("wrong-number", { kind: "workflow", pins: [{ ...pin, number: 2 }] })))
        .toEqual({ pins: "Pin skill/signal@2 is not the local version (1)" });
    expect(await failures(copySkill("wrong-kind", { kind: "workflow", pins: [{ ...pin, kind: "agent" }] })))
        .toEqual({ pins: "Pin agent/signal@1 names a skill" });
    expect(await failures(copySkill("absent", { kind: "workflow", pins: [{ ...pin, name: "nowhere" }] })))
        .toEqual({ pins: "Pin skill/nowhere@1 does not resolve to a local skill" });
  });

  it("refuses inexact pins", async () => {
    for (const number of ["latest", "^1", 1.5, 0]) {
      const directory = copySkill(`inexact-${String(number).replace(/\W/g, "x")}`, {
        kind: "workflow",
        pins: [{ kind: "skill", name: "signal", number, sha256: "0".repeat(64) }],
      });
      expect((await failures(directory)).manifest).toMatch(/exact positive integer/);
    }
  });

  it("changes the content hash when a pin changes", async () => {
    const a = copySkill("workflow-a", { kind: "workflow", pins: [] });
    const before = (await packSkill(a)).contentSha256;
    writeFileSync(join(a, "files", "revision.json"), JSON.stringify({
      kind: "workflow", pins: [{ kind: "skill", name: "signal", number: 1, sha256: "0".repeat(64) }],
    }));
    expect((await packSkill(a)).contentSha256).not.toBe(before);
  });

  it("finds credentials in shipped files without echoing them", async () => {
    const directory = copySkill("leaky", { kind: "skill" });
    const secret = "postgres://trader:hunter2hunter2@db.internal/prod";
    writeFileSync(join(directory, "files", "README.md"), `# Signal\n\nConnect to ${secret}.\n`);
    const found = await failures(directory);
    expect(found.secrets).toBe("URL with embedded credentials in README.md");
    expect(JSON.stringify(found)).not.toContain("hunter2");
  });

  it("qualifies every skill in this repository apart from running its tests", async () => {
    process.env.GADGETS_SKILLS_DIR = previousSkillsDir;
    if (previousSkillsDir === undefined) delete process.env.GADGETS_SKILLS_DIR;
    for (const name of ["momentum-signal", "breakout-workflow"]) {
      const manifest = JSON.parse(readFileSync(join(skillsDir(), name, "files", "revision.json"), "utf8"));
      expect(manifest.kind).toBe(name === "momentum-signal" ? "skill" : "workflow");
      expect(await failures(join(skillsDir(), name))).toEqual({});
    }
  });
});
