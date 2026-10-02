// Finding and testing the skills a developer authors under `packages/skills/skills/<name>/`.

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The `@gadgets/skills` package: its `skills/` holds one directory per skill. */
export const SKILLS_PACKAGE_DIR: string =
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");

/** Where skills are looked up: `$GADGETS_SKILLS_DIR`, else `@gadgets/skills`'s `skills/`. */
export function skillsDir(): string {
  return process.env.GADGETS_SKILLS_DIR ?? join(SKILLS_PACKAGE_DIR, "skills");
}

/** One skill as its manifest presents it. */
export type SkillSummary = { name: string; blueprintId: string; title: string; version: number };

/** Lists the skills under `skillsDir()`. */
export async function listSkills(): Promise<SkillSummary[]> {
  const summaries: SkillSummary[] = [];
  for (const entry of await readdir(skillsDir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const manifest = JSON.parse(
        await readFile(join(skillsDir(), entry.name, "blueprint.json"), "utf8")) as
        { blueprintId: string; title: string; version: number };
    summaries.push({ name: entry.name, blueprintId: manifest.blueprintId,
      title: manifest.title, version: manifest.version });
  }
  return summaries.toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolves a skill given by name or by path to its directory. Names may not contain path
 * separators, so a harness asking for a skill by name cannot reach outside `skillsDir()`.
 */
export async function resolveSkillDir(nameOrPath: string): Promise<string> {
  const looksLikePath = nameOrPath.includes("/") || nameOrPath.includes("\\");
  if (!looksLikePath && !/^[a-zA-Z0-9._-]+$/.test(nameOrPath)) {
    throw new Error(`Not a skill name: ${nameOrPath}`);
  }
  const directory = looksLikePath ? resolve(nameOrPath) : join(skillsDir(), nameOrPath);
  try {
    if ((await stat(join(directory, "blueprint.json"))).isFile()) return directory;
  } catch {
    // Reported below.
  }
  throw new Error(`No skill at ${directory} (expected a blueprint.json there).`);
}

/** The outcome of a skill's tests. */
export type TestRun = { passed: boolean; output: string };

/**
 * Runs `directory`'s own tests, from a snapshot of it (see `withSnapshot`). Fails when the skill has
 * no tests: a skill is never vouched for by another skill's suite.
 */
export async function testSkill(directory: string): Promise<TestRun> {
  const { withSnapshot, testSnapshot } = await import("./snapshot.ts");
  return await withSnapshot(directory, testSnapshot);
}

/** Runs vitest with `root` as its root, using the config file there and the skills package's vitest. */
export async function runVitest(root: string): Promise<TestRun> {
  const vitestEntry = join(dirname(
      createRequire(join(SKILLS_PACKAGE_DIR, "package.json")).resolve("vitest/package.json")),
      "vitest.mjs");
  return await new Promise(done => {
    execFile(process.execPath, [vitestEntry, "run", "--reporter=verbose", "--root", root],
        { cwd: root, env: { ...process.env, FORCE_COLOR: "0" } },
        (err, stdout, stderr) => done({ passed: !err, output: `${stdout}${stderr}`.trim() }));
  });
}
