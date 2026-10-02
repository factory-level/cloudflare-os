// Qualification: the deterministic checks that freeze a skill directory into a publishable
// revision. Every check runs even after one fails, so the record says everything that is wrong, and
// the record is bound to the content hash it was computed for.

import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { type PackedSkill, packSkill } from "./pack.ts";
import { type Pin, readRevisionManifest, type RevisionKind, type RevisionManifest } from "./revision.ts";
import { skillsDir } from "./skills.ts";
import { testSnapshot, withSnapshot } from "./snapshot.ts";

/** One check's outcome. `detail` explains a failure; it never contains the matched secret. */
export type QualificationCheck = { name: string; passed: boolean; detail?: string };

/** What qualification found for one skill directory at one content hash. */
export type QualificationRecord = {
  kind: RevisionKind | undefined;
  name: string;
  number: number;
  /** `sha256:<hex>` of the packed content, the revision's identity. */
  contentHash: string;
  pins: Pin[];
  passed: boolean;
  checks: QualificationCheck[];
};

/** A skill that passed qualification, with the bytes that were qualified. */
export type QualifiedSkill = { record: QualificationRecord; packed: PackedSkill };

// Shapes that should never be in shipped content. Deliberately narrow: a false positive blocks a
// publish, and the patterns name credentials, not arbitrary long strings.
const SECRET_PATTERNS: [string, RegExp][] = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["URL with embedded credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"'`]+:[^\s/@"'`]+@/i],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

type QualifyOptions = {
  /** The test runner, given the snapshot. Replaceable so qualification can be tested without vitest. */
  runTests?: (snapshot: string) => Promise<{ passed: boolean; output: string }>;
};

/**
 * Qualifies `directory` from a snapshot of it: every check, and the bytes returned for publishing,
 * come from the same frozen copy, whatever happens to `directory` meanwhile.
 */
export async function qualifySkill(directory: string, options: QualifyOptions = {})
    : Promise<QualifiedSkill> {
  return await withSnapshot(directory, snapshot => qualifySnapshot(snapshot, options));
}

async function qualifySnapshot(directory: string, options: QualifyOptions): Promise<QualifiedSkill> {
  const checks: QualificationCheck[] = [];
  const check = async (name: string, run: () => Promise<string | undefined>) => {
    try {
      const detail = await run();
      checks.push(detail === undefined ? { name, passed: true } : { name, passed: false, detail });
    } catch (err) {
      checks.push({ name, passed: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const packed = await packSkill(directory);
  let manifest: RevisionManifest | undefined;
  await check("manifest", async () => {
    manifest = await readRevisionManifest(directory);
    return undefined;
  });
  await check("deterministic-pack", async () => {
    const again = await packSkill(directory);
    return Buffer.compare(again.archive, packed.archive) === 0
      ? undefined : "Packing the same source twice gave different bytes";
  });
  await check("pins", async () => {
    for (const pin of manifest?.pins ?? []) {
      const problem = await pinProblem(pin);
      if (problem) return problem;
    }
    return undefined;
  });
  await check("secrets", async () => {
    const found = await scanForSecrets(join(directory, "files"));
    return found.length ? found.join("; ") : undefined;
  });
  await check("tests", async () => {
    const run = await (options.runTests ?? testSnapshot)(directory);
    return run.passed ? undefined : "Tests failed";
  });

  return {
    packed,
    record: {
      kind: manifest?.kind,
      name: basename(resolve(directory)),
      number: packed.version,
      contentHash: `sha256:${packed.contentSha256}`,
      pins: manifest?.pins ?? [],
      passed: checks.every(entry => entry.passed),
      checks,
    },
  };
}

/** Why `pin` does not resolve to exactly that revision among the local skills, if it does not. */
async function pinProblem(pin: Pin): Promise<string | undefined> {
  const label = `${pin.kind}/${pin.name}@${pin.number}`;
  let pinned: PackedSkill;
  let kind: RevisionKind;
  try {
    const directory = join(skillsDir(), pin.name);
    pinned = await packSkill(directory);
    kind = (await readRevisionManifest(directory)).kind;
  } catch {
    return `Pin ${label} does not resolve to a local skill`;
  }
  if (kind !== pin.kind) return `Pin ${label} names a ${kind}`;
  if (pinned.version !== pin.number) return `Pin ${label} is not the local version (${pinned.version})`;
  if (pinned.contentSha256 !== pin.sha256) return `Pin ${label} has a different content hash`;
  return undefined;
}

async function scanForSecrets(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const text = await readFile(path, "utf8");
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) found.push(`${label} in ${relative(root, path)}`);
    }
  }
  return found.toSorted();
}
