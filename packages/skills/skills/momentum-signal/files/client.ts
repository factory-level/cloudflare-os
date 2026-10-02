// Shows the rule's verdict on each built-in fixture. `gadget` is the stub the Workshop injects.
type FixtureRun = {
  name: string;
  result: { signal: string; spreadBps: number; orderIntent: { side: string; quantity: number } | null };
};

declare const gadget: { runFixtures(): Promise<FixtureRun[]> };

const runs = await gadget.runFixtures();
const table = document.createElement("table");
table.style.cssText = "font: 14px system-ui; border-collapse: collapse; margin: 16px";
const header = table.insertRow();
for (const label of ["Fixture", "Signal", "Spread (bps)", "Order intent"]) {
  const cell = document.createElement("th");
  cell.textContent = label;
  cell.style.cssText = "text-align: left; padding: 4px 12px";
  header.append(cell);
}
for (const run of runs) {
  const row = table.insertRow();
  const intent = run.result.orderIntent;
  for (const value of [run.name, run.result.signal, String(run.result.spreadBps),
      intent ? `${intent.side} ${intent.quantity}` : "none"]) {
    const cell = row.insertCell();
    cell.textContent = value;
    cell.style.padding = "4px 12px";
  }
}
document.body.append(table);
