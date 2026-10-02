// Pure presentation logic for the study console, kept apart from the gadget so it can be tested.

export type Revision = { kind: string; name: string; number: number; contentHash: string };
export type Study = {
  id: string;
  name: string;
  number: number;
  status: string;
  startingCapital: { currency: string; amountCents: number };
  executionModel: string;
  variants: { label: string; revision: Revision }[];
};
export type Portfolio = {
  currency: string;
  cashCents: number;
  positions: { symbol: string; quantity: number }[];
  equityCents: number;
};
export type Run = {
  id: string;
  variant: string;
  cycleKey: string;
  agent: string;
  outcome: string;
  decision: string;
  orderIntent: { symbol: string; side: string; quantity: number } | null;
  riskRejection: string | null;
  fill: { side: string; quantity: number; priceCents: number; feeCents: number } | null;
};

/** Cents as `1,234.56 USD`, exactly, without floating point. */
export function money(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${whole}.${String(abs % 100).padStart(2, "0")} ${currency}`;
}

/** The change in equity since the start, in cents, and as basis points of the start. */
export function change(start: number, now: number): { cents: number; bps: number } {
  return { cents: now - start, bps: start === 0 ? 0 : Math.trunc(((now - start) * 10000) / start) };
}

/** One line for what happened to a run's order. */
export function orderOutcome(run: Run): string {
  if (!run.orderIntent) return "no order";
  const intent = `${run.orderIntent.side} ${run.orderIntent.quantity} ${run.orderIntent.symbol}`;
  if (run.riskRejection) return `${intent}: refused (${run.riskRejection})`;
  if (!run.fill) return `${intent}: waiting for the next open`;
  return `${intent}: filled ${run.fill.quantity} at ${money(run.fill.priceCents, "")} + fee ${money(run.fill.feeCents, "")}`
    .replace(/ +$/g, "").replace(/  /g, " ");
}

/** Per variant: how many runs, orders, refusals and fills. */
export function tally(runs: Run[]): Record<string, { runs: number; orders: number; refused: number; filled: number }> {
  const out: Record<string, { runs: number; orders: number; refused: number; filled: number }> = {};
  for (const run of runs) {
    const t = (out[run.variant] ??= { runs: 0, orders: 0, refused: 0, filled: 0 });
    t.runs++;
    if (run.orderIntent) t.orders++;
    if (run.riskRejection) t.refused++;
    if (run.fill) t.filled++;
  }
  return out;
}
