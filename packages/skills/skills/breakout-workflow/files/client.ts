// Shows each built-in fixture's evidence chain. `gadget` is the stub the Workshop injects.
import { THEME_CSS } from "./lib/theme.ts";
type FixtureRun = {
  name: string;
  result: { event: string; action: string; evidence: Array<{ step: number; kind: string; summary: string }> };
};

type ScheduledRun = { runId: string; scheduledTime: number; runs: FixtureRun[]; review: string | null; reviewError?: string };

declare const gadget: { runFixtures(): Promise<FixtureRun[]>; scheduledRuns(limit?: number): Promise<ScheduledRun[]> };

const theme = document.createElement("style");
theme.textContent = THEME_CSS;
document.head.append(theme);
const runs = await gadget.runFixtures();
const root = document.createElement("div");
for (const run of runs) {
  const heading = document.createElement("h2");
  heading.textContent = `${run.name} -- ${run.result.event} -> ${run.result.action}`;
  const table = document.createElement("table");
  const header = table.insertRow();
  for (const label of ["#", "Step", "Evidence"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    header.append(cell);
  }
  for (const step of run.result.evidence) {
    const row = table.insertRow();
    for (const value of [String(step.step), step.kind, step.summary]) {
      const cell = row.insertCell();
      cell.textContent = value;
    }
  }
  root.append(heading, table);
}

// Scheduled runs arrive while the gadget is open, so the section refreshes itself. A failed refresh
// keeps what was last shown and says so.
const scheduledHeading = document.createElement("h2");
const scheduledStatus = document.createElement("p");
scheduledStatus.className = "muted";
const scheduledList = document.createElement("div");
root.append(scheduledHeading, scheduledStatus, scheduledList);

const REFRESH_MS = 5000;
async function refreshScheduled(): Promise<void> {
  try {
    const scheduled = await gadget.scheduledRuns(5);
    scheduledHeading.textContent = scheduled.length > 0 ? "Scheduled runs" : "No scheduled runs yet";
    scheduledList.replaceChildren(...scheduled.map(run => {
      const item = document.createElement("p");
      const acted = run.runs.filter(r => r.result.action !== "hold").map(r => `${r.name} -> ${r.result.action}`);
      item.textContent = `${new Date(run.scheduledTime).toISOString()}: ${acted.join(", ") || "all held"}. `
        + (run.review ?? (run.reviewError ? `Review failed: ${run.reviewError}` : "No review."));
      return item;
    }));
    scheduledStatus.textContent = `Updated ${new Date().toLocaleTimeString()}; refreshes every ${REFRESH_MS / 1000}s.`;
  } catch (err) {
    scheduledStatus.textContent = `Could not refresh (${err instanceof Error ? err.message : String(err)}); showing the last result.`;
  }
}
await refreshScheduled();
setInterval(() => void refreshScheduled(), REFRESH_MS);
document.body.append(root);
