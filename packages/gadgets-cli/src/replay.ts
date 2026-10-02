// Replaying a skill's decision logic on this machine, with no Workshop: the inner development loop.
// Every replay goes through the skill's own `files/lib/harness.ts`, the same entry its tests and its
// gadget call.

import { execFile } from "node:child_process";
import { join } from "node:path";
import type { Bar } from "./bars.ts";

/** One step of an evidence chain. */
export type ReplayStep = { step: number; kind: string; summary: string };

/** What one scenario or session produced: an outcome, or the error the harness threw. */
export type ReplayEntry = {
  name: string;
  /** The input the harness was given; absent for sessions built from bars. */
  input?: unknown;
} & ({ decision: string; summary: string; evidence: ReplayStep[]; result: unknown } | { error: string });

/** What to replay. With neither `bars` nor `inputs`, the skill's built-in scenarios. */
export type ReplayRequest = {
  /** Only the built-in scenario with this name. */
  scenario?: string;
  /** Run these inputs instead of the built-in scenarios (used to feed two skills the same inputs). */
  inputs?: Array<{ name: string; input: unknown }>;
  /** One session over these bars. */
  bars?: Bar[];
  /** With `bars`: one session per bar, each seeing the bars so far and carrying state forward. */
  walk?: boolean;
};

const WORKER = join(import.meta.dirname, "replayWorker.ts");
const TIMEOUT_MS = 30_000;

/** Replays `directory`'s harness in a fresh process. Rejects when the harness is missing or invalid. */
export async function replaySkill(directory: string, request: ReplayRequest = {}): Promise<ReplayEntry[]> {
  const stdout = await new Promise<string>((done, fail) => {
    const child = execFile(process.execPath, [WORKER, directory],
        { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: "1" } },
        (err, out, stderr) => {
          if (!err) return done(out);
          fail(new Error(err.killed ? `Replay timed out after ${TIMEOUT_MS / 1000}s` : lastLine(stderr) || err.message));
        });
    child.stdin!.end(JSON.stringify(request));
  });
  return (JSON.parse(stdout) as { entries: ReplayEntry[] }).entries;
}

/** One scenario as two skills decided it. */
export type Comparison = {
  name: string;
  a: string;
  b: string;
  /** Whether both produced the same full result, not merely the same decision phrase. */
  same: boolean;
  /** The first place the two results differ, e.g. `fill.quantity: 49 vs 10`. */
  difference?: string;
};

/**
 * Feeds two skills identical inputs: `request.bars` when given, otherwise `a`'s built-in scenarios.
 * Descriptive only: it says where they differ, never which is better.
 */
export async function compareSkills(a: string, b: string, request: Pick<ReplayRequest, "bars" | "walk"> = {})
    : Promise<Comparison[]> {
  const left = await replaySkill(a, request);
  const right = await replaySkill(b, request.bars ? request
      : { inputs: left.map(entry => ({ name: entry.name, input: entry.input })) });
  return left.map((entry, index) => {
    const other = right[index];
    const difference = other ? firstDifference(outcomeOf(entry), outcomeOf(other)) : "missing";
    return {
      name: entry.name,
      a: describe(entry),
      b: other ? describe(other) : "(missing)",
      same: difference === undefined,
      ...(difference === undefined ? {} : { difference }),
    };
  });
}

/** An entry's decision, or its error. */
export function describe(entry: ReplayEntry): string {
  return "error" in entry ? `error: ${entry.error}` : entry.decision;
}

/** What identifies an entry's outcome for equality: its full result, or its error. */
export function outcomeOf(entry: ReplayEntry): unknown {
  return "error" in entry ? { error: entry.error } : entry.result;
}

/** JSON with object keys sorted, so equal values compare equal whatever order they were built in. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
        .toSorted(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The path and values of the first leaf at which `a` and `b` differ, or `undefined` when equal. */
export function firstDifference(a: unknown, b: unknown, path = ""): string | undefined {
  if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDifference(a[key], b[key], path ? `${path}.${key}` : key);
      if (found) return found;
    }
    return undefined;
  }
  return stable(a) === stable(b) ? undefined : `${path || "result"}: ${stable(a)} vs ${stable(b)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function lastLine(text: string): string {
  const lines = text.trim().split("\n").filter(line => /Error/.test(line));
  return (lines.at(-1) ?? text.trim().split("\n").at(-1) ?? "").replace(/^.*?Error: /, "");
}
