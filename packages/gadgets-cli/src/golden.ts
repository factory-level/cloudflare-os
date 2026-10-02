// A skill's golden file: the expected full result of each built-in scenario, committed beside its
// tests. Checking is automatic; updating is a deliberate act with the accepted changes printed.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { outcomeOf, replaySkill, stable } from "./replay.ts";

/** How a skill's current behaviour differs from its golden file. */
export type GoldenDiff = {
  /** Scenarios whose result differs from the golden one. */
  changed: string[];
  /** Scenarios with no golden entry yet. */
  added: string[];
  /** Golden entries with no scenario any more. */
  removed: string[];
  matches: boolean;
};

const goldenPath = (directory: string) => join(directory, "__tests__", "golden.json");

/** Replays `directory`'s scenarios and compares them with its golden file. */
export async function checkGolden(directory: string): Promise<GoldenDiff> {
  return diff(await current(directory), await read(directory));
}

/** Rewrites `directory`'s golden file from its current behaviour. Returns what that accepted. */
export async function updateGolden(directory: string): Promise<GoldenDiff> {
  const now = await current(directory);
  const accepted = diff(now, await read(directory));
  if (!accepted.matches) await writeFile(goldenPath(directory), `${JSON.stringify(now, null, 2)}\n`);
  return accepted;
}

async function current(directory: string): Promise<Record<string, unknown>> {
  const entries = await replaySkill(directory);
  const failed = entries.find(entry => "error" in entry);
  if (failed && "error" in failed) throw new Error(`Scenario ${failed.name} failed: ${failed.error}`);
  return Object.fromEntries(entries.map(entry => [entry.name, outcomeOf(entry)]));
}

async function read(directory: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(goldenPath(directory), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function diff(now: Record<string, unknown>, golden: Record<string, unknown>): GoldenDiff {
  const changed = Object.keys(now).filter(name => name in golden && stable(now[name]) !== stable(golden[name]));
  const added = Object.keys(now).filter(name => !(name in golden));
  const removed = Object.keys(golden).filter(name => !(name in now));
  return { changed, added, removed, matches: changed.length + added.length + removed.length === 0 };
}
