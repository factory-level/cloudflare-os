// Pure presentation logic for the analytics view, kept apart from the gadget so it can be tested.
// Charts are returned as SVG element descriptions; the page turns them into nodes. Axes and labels
// use `currentColor`, so they follow the page theme in light and dark mode.

import { SERIES, SIGNAL } from "./theme.ts";

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
export type VariantHealth = {
  label: string;
  status: string;
  lastCycle: string | null;
  latestSession: string | null;
  cyclesBehind: number;
  workingOrders: number;
};
export type StudyAlert = { severity: string; kind: string; variant: string; detail: string };
export type StudyOverview = {
  study: Study;
  createdAt: string;
  health: VariantHealth[];
  alerts: StudyAlert[];
  variants: { label: string; revision: Revision; equityCents: number; changeCents: number; runs: number }[];
};
export type EquitySeries = { label: string; points: { session: string; equityCents: number }[] };
export type AgentSummary = {
  agent: string;
  revision: Revision | null;
  cycles: number;
  outcomes: Record<string, number>;
  decisions: Record<string, number>;
  orders: number;
  riskRejections: number;
  fills: number;
  feesCents: number;
  equityChangeCents: number;
  reportedCostMicroUsd: number;
  asOf: string | null;
  recordClass: string;
};

/** One SVG element: its tag, attributes, and text for `<text>`. */
export type SvgNode = { tag: "line" | "polyline" | "rect" | "text"; attrs: Record<string, string | number>; text?: string };
export type Chart = { width: number; height: number; nodes: SvgNode[] };

/** Cents as `1,234.56 USD`, exactly, without floating point. */
export function money(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${whole}.${String(abs % 100).padStart(2, "0")}${currency ? ` ${currency}` : ""}`;
}

/** Cents as a signed amount with its share of `start`, e.g. `+762.91 (0.76%)`. */
export function signedChange(cents: number, start: number): string {
  const sign = cents > 0 ? "+" : "";
  const bps = start === 0 ? 0 : Math.trunc((cents * 10000) / start);
  return `${sign}${money(cents, "")} (${sign}${(bps / 100).toFixed(2)}%)`;
}

/** Micro-dollars as dollars, e.g. `0.0025 USD`. */
export function microUsd(micro: number): string {
  const whole = Math.floor(micro / 1_000_000);
  const fraction = String(micro % 1_000_000).padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction} USD`;
}

export function revisionName(r: Revision | null): string {
  return r ? `${r.kind}/${r.name}@${r.number}` : "all revisions";
}

/** `{ buy: 3, hold: 40 }` as `buy 3, hold 40`, most frequent first. */
export function counts(record: Record<string, number>): string {
  return Object.entries(record).toSorted((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k, n]) => `${k} ${n}`).join(", ") || "none";
}

/** The studies with a variant running exactly this revision, and that variant's label. */
export function studiesRunning(overviews: StudyOverview[], r: Revision): { study: Study; label: string }[] {
  return overviews.flatMap((o) => o.variants
    .filter((v) => v.revision.kind === r.kind && v.revision.name === r.name && v.revision.number === r.number)
    .map((v) => ({ study: o.study, label: v.label })));
}

const PALETTE = SERIES;
const ACTION_COLORS: Record<string, string> = {
  buy: SIGNAL.gain, sell: SIGNAL.loss, hold: SIGNAL.neutral, blocked: SIGNAL.warning,
};

/** The colour of a series by position, and of a decision by its action. */
export function seriesColor(index: number): string {
  return PALETTE[index % PALETTE.length] as string;
}
export function actionColor(action: string, index: number): string {
  return ACTION_COLORS[action] ?? seriesColor(index);
}

/** Rounds a coordinate to one decimal place. */
const r = (n: number) => Math.round(n * 10) / 10;

const PAD = { left: 90, right: 16, top: 12, bottom: 28 };

/**
 * Each variant's equity as a line over the sessions, with a dashed line at the starting capital and
 * the lowest and highest equity labelled on the axis.
 */
export function equityChart(series: EquitySeries[], startCents: number, width = 640, height = 220): Chart {
  const sessions = [...new Set(series.flatMap((s) => s.points.map((p) => p.session)))].toSorted();
  const values = [startCents, ...series.flatMap((s) => s.points.map((p) => p.equityCents))];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 100; hi += 100; }
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (session: string) =>
    PAD.left + (sessions.length < 2 ? plotW / 2 : (sessions.indexOf(session) * plotW) / (sessions.length - 1));
  const y = (cents: number) => PAD.top + ((hi - cents) * plotH) / (hi - lo);
  const nodes: SvgNode[] = [
    { tag: "line", attrs: { x1: PAD.left, y1: PAD.top, x2: PAD.left, y2: PAD.top + plotH, stroke: "currentColor", "stroke-opacity": 0.35 } },
    { tag: "line", attrs: { x1: PAD.left, y1: PAD.top + plotH, x2: PAD.left + plotW, y2: PAD.top + plotH, stroke: "currentColor", "stroke-opacity": 0.35 } },
    { tag: "line", attrs: { x1: PAD.left, y1: r(y(startCents)), x2: PAD.left + plotW, y2: r(y(startCents)),
      stroke: "currentColor", "stroke-dasharray": "4 4" } },
    { tag: "text", attrs: { x: PAD.left - 6, y: PAD.top + 4, "text-anchor": "end", "font-size": 11, fill: "currentColor" }, text: money(hi, "") },
    { tag: "text", attrs: { x: PAD.left - 6, y: PAD.top + plotH, "text-anchor": "end", "font-size": 11, fill: "currentColor" }, text: money(lo, "") },
  ];
  if (sessions.length) {
    nodes.push(
      { tag: "text", attrs: { x: PAD.left, y: height - 8, "font-size": 11, fill: "currentColor" }, text: sessions[0] as string },
      { tag: "text", attrs: { x: PAD.left + plotW, y: height - 8, "text-anchor": "end", "font-size": 11, fill: "currentColor" },
        text: sessions.at(-1) as string },
    );
  }
  series.forEach((s, i) => {
    if (!s.points.length) return;
    nodes.push({ tag: "polyline", attrs: {
      points: s.points.map((p) => `${r(x(p.session))},${r(y(p.equityCents))}`).join(" "),
      fill: "none", stroke: seriesColor(i), "stroke-width": 2,
    } });
  });
  return { width, height, nodes };
}

/**
 * One stacked bar per row: the share of its decided cycles that went to each action, with the
 * counts written on the left. Every action keeps one colour across rows.
 */
export function decisionChart(rows: AgentSummary[], width = 640): Chart {
  const actions = [...new Set(rows.flatMap((r) => Object.keys(r.decisions)))].toSorted();
  const barH = 18;
  const gap = 10;
  const left = 150;
  const plotW = width - left - PAD.right;
  const nodes: SvgNode[] = [];
  rows.forEach((row, i) => {
    const top = i * (barH + gap);
    const total = Object.values(row.decisions).reduce((s, n) => s + n, 0);
    nodes.push({ tag: "text", attrs: { x: 0, y: top + 13, "font-size": 12, fill: "currentColor" }, text: revisionName(row.revision) });
    let at = left;
    for (const [index, action] of actions.entries()) {
      const n = row.decisions[action] ?? 0;
      if (!n || !total) continue;
      const w = Math.round(((n * plotW) / total) * 10) / 10;
      nodes.push({ tag: "rect", attrs: { x: at, y: top, width: w, height: barH, fill: actionColor(action, index) } });
      if (w > 40) {
        nodes.push({ tag: "text", attrs: { x: at + 4, y: top + 13, "font-size": 11, fill: "#fff" }, text: `${action} ${n}` });
      }
      at += w;
    }
  });
  return { width, height: Math.max(1, rows.length * (barH + gap)), nodes };
}

/** One horizontal bar per row for its virtual equity change, left of the zero line when negative. */
export function changeChart(rows: AgentSummary[], width = 640): Chart {
  const barH = 18;
  const gap = 10;
  const left = 150;
  const plotW = width - left - PAD.right - 110;
  const most = Math.max(1, ...rows.map((r) => Math.abs(r.equityChangeCents)));
  const zero = left + plotW / 2;
  const nodes: SvgNode[] = [
    { tag: "line", attrs: { x1: zero, y1: 0, x2: zero, y2: rows.length * (barH + gap), stroke: "currentColor" } },
  ];
  rows.forEach((row, i) => {
    const top = i * (barH + gap);
    const w = Math.round(((Math.abs(row.equityChangeCents) * plotW) / 2 / most) * 10) / 10;
    const negative = row.equityChangeCents < 0;
    nodes.push(
      { tag: "text", attrs: { x: 0, y: top + 13, "font-size": 12, fill: "currentColor" }, text: revisionName(row.revision) },
      { tag: "rect", attrs: { x: negative ? zero - w : zero, y: top, width: w, height: barH,
        fill: negative ? SIGNAL.loss : SIGNAL.gain } },
      { tag: "text", attrs: { x: left + plotW + 8, y: top + 13, "font-size": 11, fill: "currentColor" },
        text: `${row.equityChangeCents > 0 ? "+" : ""}${money(row.equityChangeCents, "")}` },
    );
  });
  return { width, height: Math.max(1, rows.length * (barH + gap)), nodes };
}
