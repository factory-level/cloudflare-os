// `gadgets new`: start a skill by copying one that already works, so the first thing a developer
// has is a passing, replayable skill to change rather than an empty directory.

import { cp, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveSkillDir, skillsDir } from "./skills.ts";

/** The skill each kind starts from when `--from` is not given. */
export const DEFAULT_SOURCES = { workflow: "breakout-workflow", skill: "momentum-signal" } as const;

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Creates `skillsDir()/<name>` as a copy of `from`, renamed and reset to version 1. Refuses to
 * overwrite an existing skill. Returns the new directory.
 */
export async function newSkill(name: string, from: string, today: Date = new Date()): Promise<string> {
  if (!NAME.test(name)) throw new Error(`Not a skill name (lowercase letters, digits, hyphens): ${name}`);
  const target = join(skillsDir(), name);
  if (await stat(target).then(() => true, () => false)) throw new Error(`A skill named ${name} already exists`);
  const source = await resolveSkillDir(from);

  await cp(source, target, { recursive: true, filter: path => basename(path) !== "node_modules" });
  const manifestPath = join(target, "blueprint.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  const day = `${today.toISOString().slice(0, 10)}T00:00:00.000Z`;
  await writeFile(manifestPath, `${JSON.stringify({
    ...manifest,
    blueprintId: `skill.${name}`,
    title: name.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
    revision: 1,
    version: 1,
    created: day,
    lastUpdated: day,
  }, null, 2)}\n`);
  return target;
}
