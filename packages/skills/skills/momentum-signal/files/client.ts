// Shows the rule's verdict on each built-in fixture. `gadget` is the stub the Workshop injects.
import { THEME_CSS } from "./lib/theme.ts";
type FixtureRun = {
  name: string;
  result: { signal: string; spreadBps: number; orderIntent: { side: string; quantity: number } | null };
};

declare const gadget: { runFixtures(): Promise<FixtureRun[]> };

const theme = document.createElement("style");
theme.textContent = THEME_CSS;
document.head.append(theme);
const runs = await gadget.runFixtures();
const table = document.createElement("table");
const header = table.insertRow();
for (const label of ["Fixture", "Signal", "Spread (bps)", "Order intent"]) {
  const cell = document.createElement("th");
  cell.textContent = label;
  header.append(cell);
}
for (const run of runs) {
  const row = table.insertRow();
  const intent = run.result.orderIntent;
  for (const value of [run.name, run.result.signal, String(run.result.spreadBps),
      intent ? `${intent.side} ${intent.quantity}` : "none"]) {
    const cell = row.insertCell();
    cell.textContent = value;
  }
}
document.body.append(table);
