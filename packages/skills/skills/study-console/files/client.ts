// The console page. `gadget` is the stub the Workshop injects for this iframe.
import {
  change, type Comparison, comparisonSummary, money, orderOutcome, type Portfolio, type Run, type Study, tally,
} from "./lib/console.ts";
import { THEME_CSS } from "./lib/theme.ts";

declare const gadget: {
  overview(): Promise<
    | { bound: false }
    | {
        bound: true;
        study: Study;
        portfolios: { label: string; portfolio: Portfolio }[];
        runs: Run[];
        comparison: Comparison | null;
      }
  >;
};

const theme = document.createElement("style");
theme.textContent = THEME_CSS;
document.head.append(theme);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function table(headers: string[], rows: string[][]): HTMLTableElement {
  const t = el("table");
  const head = t.insertRow();
  for (const label of headers) head.append(el("th", label));
  for (const row of rows) {
    const tr = t.insertRow();
    for (const value of row) tr.insertCell().append(value);
  }
  return t;
}

try {
  const view = await gadget.overview();
  if (!view.bound) {
    document.body.replaceChildren(el("h1", "Study Console"),
      el("p", "Bind LAB_STUDY to a trading lab study to see its variants and runs."));
  } else {
    const { study, portfolios, runs } = view;
    const start = study.startingCapital.amountCents;
    const counts = tally(runs);
    document.body.replaceChildren(
      el("h1", `${study.name} #${study.number} (${study.status})`),
      el("p", `Virtual results under ${study.executionModel}, from ${money(start, study.startingCapital.currency)} per variant. ` +
        "Not live performance; variants are not ranked.", "muted"),
      el("h2", "Variants"),
      table(["Variant", "Revision", "Cash", "Positions", "Equity", "Change", "Runs", "Orders", "Refused", "Filled"],
        study.variants.map((v) => {
          const p = portfolios.find((x) => x.label === v.label)?.portfolio;
          const c = p ? change(start, p.equityCents) : null;
          const n = counts[v.label] ?? { runs: 0, orders: 0, refused: 0, filled: 0 };
          return [v.label, `${v.revision.kind}/${v.revision.name}@${v.revision.number}`,
            p ? money(p.cashCents, p.currency) : "-",
            p ? p.positions.map((x) => `${x.quantity} ${x.symbol}`).join(", ") || "none" : "-",
            p ? money(p.equityCents, p.currency) : "-",
            c ? `${money(c.cents, "").trim()} (${(c.bps / 100).toFixed(2)}%)` : "-",
            String(n.runs), String(n.orders), String(n.refused), String(n.filled)];
        })),
      ...(view.comparison
        ? [el("h2", "Comparison"),
          el("p", comparisonSummary(view.comparison, study.startingCapital.currency))]
        : []),
      el("h2", "Runs, newest first"),
      table(["Cycle", "Variant", "Agent", "Outcome", "Decision", "Order"],
        runs.map((r) => [r.cycleKey, r.variant, r.agent, r.outcome, r.decision, orderOutcome(r)])),
    );
  }
} catch (error) {
  document.body.replaceChildren(el("h1", "Study Console"),
    el("p", error instanceof Error ? error.message : String(error), "error"));
}
