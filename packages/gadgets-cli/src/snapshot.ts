// An immutable copy of a skill directory. Testing, packing and qualifying all read the copy, so an
// editor or harness saving a file part-way through cannot make the tests pass on one set of bytes
// while another set is published.

import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { type PackedSkill, packSkill } from "./pack.ts";
import { runVitest, SKILLS_PACKAGE_DIR, type TestRun } from "./skills.ts";

// The copy's own vitest config: only this skill's tests exist under the root, so a sibling whose
// name shares a prefix can never be selected, and an empty selection fails the run.
const SNAPSHOT_VITEST_CONFIG = `export default {
  test: { include: ["*/__tests__/**/*.test.ts"], environment: "node", passWithNoTests: false },
};
`;

/**
 * Copies `directory` to a private temporary location, calls `use` with the copy's path, and removes
 * the copy afterwards. The copy keeps the directory's name, which packing embeds.
 */
export async function withSnapshot<T>(directory: string, use: (snapshot: string) => Promise<T>)
    : Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "gadgets-snapshot-"));
  try {
    const snapshot = join(root, basename(resolve(directory)));
    await cp(directory, snapshot, {
      recursive: true,
      filter: source => basename(source) !== "node_modules",
    });
    await writeFile(join(root, "vitest.config.mjs"), SNAPSHOT_VITEST_CONFIG);
    // Tests import `vitest`; resolve it the way the skills package does.
    await symlink(join(SKILLS_PACKAGE_DIR, "node_modules"), join(root, "node_modules"), "dir");
    return await use(snapshot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Runs the tests of a snapshot made by `withSnapshot`. A skill with no tests of its own fails. */
export async function testSnapshot(snapshot: string): Promise<TestRun> {
  return await runVitest(resolve(snapshot, ".."));
}

/** Tests `directory` and packs it, both from one snapshot, so the archive is what was tested. */
export async function testAndPack(directory: string): Promise<{ tests: TestRun; packed: PackedSkill }> {
  return await withSnapshot(directory, async snapshot =>
      ({ tests: await testSnapshot(snapshot), packed: await packSkill(snapshot) }));
}
