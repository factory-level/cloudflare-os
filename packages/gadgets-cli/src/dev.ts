// `gadgets dev`: the inner loop. Every save replays the skill's scenarios in-process, shows what
// changed, then runs the skill's tests. No Workshop, no lab, no model.

import { watch } from "node:fs";
import { basename, resolve } from "node:path";
import { changedNames, renderReplay } from "./format.ts";
import { checkGolden } from "./golden.ts";
import { type ReplayEntry, replaySkill } from "./replay.ts";
import { testSkill, type TestRun } from "./skills.ts";

/** What one pass over a skill found. */
export type DevCycle = {
  entries: ReplayEntry[];
  /** Scenarios whose result changed since the previous pass. */
  changed: string[];
  /** Scenarios whose result no longer matches the golden file. */
  offGolden: string[];
  /** Why the replay could not run at all (a syntax error, a missing harness). */
  replayError?: string;
  tests?: TestRun;
  report: string;
};

/** Replays `directory` and compares with the previous pass, the first pass and the golden file. */
export async function devCycle(directory: string, previous?: ReplayEntry[], start?: ReplayEntry[],
    runTests: ((directory: string) => Promise<TestRun>) | null = testSkill): Promise<DevCycle> {
  let entries: ReplayEntry[];
  try {
    entries = await replaySkill(directory);
  } catch (err) {
    const replayError = err instanceof Error ? err.message : String(err);
    return { entries: previous ?? [], changed: [], offGolden: [], replayError, report: `Replay failed: ${replayError}` };
  }
  const changed = changedNames(entries, previous);
  const golden = await checkGolden(directory).catch(() => null);
  const offGolden = golden ? [...golden.changed, ...golden.added] : [];
  const tests = runTests ? await runTests(directory) : undefined;

  const lines = [renderReplay(entries, { previous, start })];
  if (previous) lines.push(changed.length ? `Changed since last save: ${changed.join(", ")}` : "No decision changed.");
  if (offGolden.length) lines.push(`Differs from golden: ${offGolden.join(", ")} (accept with: gadgets golden ${basename(resolve(directory))} --update)`);
  if (tests) lines.push(tests.passed ? "Tests passed." : failedTests(tests.output, basename(resolve(directory))));
  return { entries, changed, offGolden, tests, report: lines.join("\n") };
}

/** The failing tests by name: enough to see what broke without a screen of diff on every save. */
function failedTests(output: string, name: string): string {
  const failed = output.split("\n").filter(line => /^\s*[×✗]/.test(line)).map(line => line.trim().replace(/\s+\d+ms$/, ""));
  const shown = failed.slice(0, 8);
  if (failed.length > shown.length) shown.push(`... and ${failed.length - shown.length} more`);
  return [`Tests FAILED (${failed.length || "see output"}). Full output: gadgets skill test ${name}`,
    ...(failed.length ? shown.map(line => `  ${line}`) : [output])].join("\n");
}

/**
 * Runs `devCycle` now and after every change under `directory`, until `signal` aborts. Changes that
 * arrive during a pass trigger one more pass rather than overlapping it.
 */
export async function devLoop(directory: string, print: (text: string) => void, signal: AbortSignal): Promise<void> {
  let previous: ReplayEntry[] | undefined;
  let start: ReplayEntry[] | undefined;
  let running = false;
  let pending = false;
  let timer: NodeJS.Timeout | undefined;

  const pass = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    do {
      pending = false;
      const began = Date.now();
      const cycle = await devCycle(directory, previous, start);
      if (!cycle.replayError) {
        previous = cycle.entries;
        start ??= cycle.entries;
      }
      print(`\n[${new Date().toLocaleTimeString()}] ${basename(resolve(directory))} (${Date.now() - began} ms)\n${cycle.report}`);
    } while (pending && !signal.aborted);
    running = false;
  };

  await pass();
  print("\nWatching for changes. ~ changed since last save, * changed since this session started. Ctrl-C to stop.");
  const watcher = watch(directory, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void pass(), 150);
  });
  await new Promise<void>(done => signal.addEventListener("abort", () => done(), { once: true }));
  clearTimeout(timer);
  watcher.close();
}
