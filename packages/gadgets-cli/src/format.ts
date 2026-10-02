// Plain-text rendering of replays for a terminal. Marks say what changed; nothing here ranks or
// names a winner.

import { type Comparison, describe, outcomeOf, type ReplayEntry, stable } from "./replay.ts";

/** Earlier replays to mark changes against. */
export type Baselines = { previous?: ReplayEntry[]; start?: ReplayEntry[] };

/**
 * One line per entry: `~` when its result differs from the previous replay, `*` when it differs
 * from the replay at the start of the session, then the name, the decision and the summary.
 */
export function renderReplay(entries: ReplayEntry[], baselines: Baselines = {}): string {
  const width = Math.max(8, ...entries.map(entry => entry.name.length));
  const decisions = Math.max(8, ...entries.map(entry => describe(entry).length));
  return entries.map(entry => {
    const marks = (differs(entry, baselines.previous) ? "~" : " ") + (differs(entry, baselines.start) ? "*" : " ");
    const summary = "error" in entry ? "" : entry.summary;
    return `${marks} ${entry.name.padEnd(width)}  ${describe(entry).padEnd(decisions)}  ${summary}`.trimEnd();
  }).join("\n");
}

/** The names of entries whose result differs from the entry of the same name in `earlier`. */
export function changedNames(entries: ReplayEntry[], earlier: ReplayEntry[] | undefined): string[] {
  return entries.filter(entry => differs(entry, earlier)).map(entry => entry.name);
}

/** Each entry with its evidence chain, step by step. */
export function renderExplain(entries: ReplayEntry[]): string {
  return entries.map(entry => {
    const steps = "error" in entry ? [`  error: ${entry.error}`]
        : entry.evidence.map(step => `  ${step.step}. ${step.kind}: ${step.summary}`);
    return [`${entry.name}: ${describe(entry)}`, ...steps].join("\n");
  }).join("\n\n");
}

/** One line per scenario: `=` when both skills produced the same result, `!` when they differ. */
export function renderComparison(rows: Comparison[], a: string, b: string): string {
  const width = Math.max(8, ...rows.map(row => row.name.length));
  const left = Math.max(a.length, ...rows.map(row => row.a.length));
  const header = `  ${"scenario".padEnd(width)}  ${a.padEnd(left)}  ${b}`;
  const right = Math.max(b.length, ...rows.map(row => row.b.length));
  const lines = rows.map(row => `${row.same ? "=" : "!"} ${row.name.padEnd(width)}  ${row.a.padEnd(left)}  `
      + `${row.b.padEnd(right)}  ${row.difference ?? ""}`.trimEnd());
  const differing = rows.filter(row => !row.same).length;
  return [header, ...lines, `${differing} of ${rows.length} differ. Descriptive only; this is not a ranking.`].join("\n");
}

function differs(entry: ReplayEntry, earlier: ReplayEntry[] | undefined): boolean {
  if (!earlier) return false;
  const before = earlier.find(candidate => candidate.name === entry.name);
  return !before || stable(outcomeOf(before)) !== stable(outcomeOf(entry));
}
