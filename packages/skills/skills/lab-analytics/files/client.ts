// The analytics page. `gadget` is the stub the Workshop injects for this iframe. Two linked views,
// Experiments and Agents, each a list that opens into one study or one agent.
import {
  actionColor, type AgentSummary, type Chart, changeChart, counts, decisionChart, type EquitySeries, equityChart, microUsd,
  money, revisionName, seriesColor, signedChange, type StudyOverview, studiesRunning,
} from "./lib/analytics.ts";
import { THEME_CSS } from "./lib/theme.ts";

declare const gadget: {
  bound(): Promise<boolean>;
  studies(): Promise<StudyOverview[]>;
  equity(studyId: string): Promise<EquitySeries[]>;
  agents(): Promise<{ agent: string; runs: number }[]>;
  agent(agent: string, options?: { from?: string; to?: string }): Promise<AgentSummary[]>;
};

type Route =
  | { view: "studies" }
  | { view: "study"; studyId: string }
  | { view: "agents" }
  | { view: "agent"; agent: string; from?: string; to?: string };

const theme = document.createElement("style");
theme.textContent = THEME_CSS;
document.head.append(theme);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(text: string, to: Route): HTMLAnchorElement {
  const a = el("a", text);
  a.href = "#";
  a.addEventListener("click", (event) => {
    event.preventDefault();
    void show(to);
  });
  return a;
}

/** A signed amount, coloured as a gain or a loss. */
function changed(text: string, cents: number): HTMLSpanElement {
  return el("span", text, cents > 0 ? "gain" : cents < 0 ? "loss" : undefined);
}

function back(text: string, to: Route): HTMLParagraphElement {
  const p = el("p");
  p.append(link(text, to));
  return p;
}

function table(headers: string[], rows: (string | Node)[][]): HTMLTableElement {
  const t = el("table");
  const head = t.insertRow();
  for (const label of headers) head.append(el("th", label));
  for (const row of rows) {
    const tr = t.insertRow();
    for (const value of row) {
      tr.insertCell().append(value);
    }
  }
  return t;
}

const SVG = "http://www.w3.org/2000/svg";
function svg(chart: Chart): SVGSVGElement {
  const root = document.createElementNS(SVG, "svg");
  root.setAttribute("viewBox", `0 0 ${chart.width} ${chart.height}`);
  root.setAttribute("width", "100%");
  root.style.maxWidth = `${chart.width}px`;
  for (const node of chart.nodes) {
    const child = document.createElementNS(SVG, node.tag);
    for (const [key, value] of Object.entries(node.attrs)) child.setAttribute(key, String(value));
    if (node.text !== undefined) child.textContent = node.text;
    root.append(child);
  }
  return root;
}

function legend(items: { label: string; color: string }[]): HTMLElement {
  const p = el("p", undefined, "muted");
  for (const item of items) {
    // The swatch takes its series' colour, which is data, so it is the one inline style here.
    const swatch = el("span", "■ ");
    swatch.style.color = item.color;
    p.append(swatch, el("span", `${item.label}\u2003`));
  }
  return p;
}

const VIRTUAL = "Virtual results: not live performance, and nothing is ranked.";

function nav(active: "studies" | "agents"): HTMLElement {
  const bar = el("nav");
  const tab = (label: string, to: Route, on: boolean) => (on ? el("strong", label) : link(label, to));
  bar.append(tab("Experiments", { view: "studies" }, active === "studies"), tab("Agents", { view: "agents" }, active === "agents"));
  return bar;
}

let studiesCache: StudyOverview[] | null = null;
async function allStudies(): Promise<StudyOverview[]> {
  studiesCache ??= await gadget.studies();
  return studiesCache;
}

async function studiesView(): Promise<Node[]> {
  studiesCache = null;
  const studies = await allStudies();
  return [
    nav("studies"),
    el("h1", "Experiments"),
    el("p", VIRTUAL, "muted"),
    studies.length
      ? table(["Study", "Status", "Alerts", "Variants: equity and change", "Runs", "Created"], studies.map((o) => {
          const start = o.study.startingCapital.amountCents;
          const variants = el("span");
          for (const v of o.variants) {
            const line = el("div", `${v.label} ${revisionName(v.revision)}: ${money(v.equityCents, o.study.startingCapital.currency)} `);
            line.append(changed(signedChange(v.changeCents, start), v.changeCents));
            variants.append(line);
          }
          return [link(`${o.study.name} #${o.study.number}`, { view: "study", studyId: o.study.id }), o.study.status,
            o.alerts.length ? el("span", `${o.alerts.length} open`, "error") : "none", variants,
            String(o.variants.reduce((n, v) => n + v.runs, 0)), o.createdAt.slice(0, 10)];
        }))
      : el("p", "No study exists yet."),
  ];
}

async function studyView(studyId: string): Promise<Node[]> {
  const [studies, series] = await Promise.all([allStudies(), gadget.equity(studyId)]);
  const o = studies.find((s) => s.study.id === studyId);
  if (!o) return [nav("studies"), el("p", `Study ${studyId} was not found.`)];
  const { currency, amountCents: start } = o.study.startingCapital;
  return [
    nav("studies"),
    back("← All experiments", { view: "studies" }),
    el("h1", `${o.study.name} #${o.study.number} (${o.study.status})`),
    el("p", `${VIRTUAL} ${o.study.executionModel}, ${money(start, currency)} per variant.`, "muted"),
    el("h2", "Equity at each cycle's close"),
    svg(equityChart(series, start)),
    legend([...series.map((s, i) => ({ label: s.label, color: seriesColor(i) })), { label: "starting capital (dashed)", color: "currentColor" }]),
    el("h2", "Variants"),
    table(["Variant", "Revision", "Equity", "Change", "Runs", "Status", "Last cycle", "Behind", "Working orders"],
      o.variants.map((v) => {
        const h = o.health.find((x) => x.label === v.label);
        return [v.label, revisionName(v.revision), money(v.equityCents, currency), changed(signedChange(v.changeCents, start), v.changeCents),
          String(v.runs), h?.status ?? "-", h?.lastCycle ?? "none", String(h?.cyclesBehind ?? "-"), String(h?.workingOrders ?? "-")];
      })),
    el("h2", "Alerts"),
    o.alerts.length
      ? table(["Severity", "Variant", "Kind", "Detail"], o.alerts.map((a) => [a.severity, a.variant, a.kind, a.detail]))
      : el("p", "No open alerts."),
  ];
}

async function agentsView(): Promise<Node[]> {
  const agents = await gadget.agents();
  return [
    nav("agents"),
    el("h1", "Agents"),
    el("p", VIRTUAL, "muted"),
    agents.length
      ? table(["Agent", "Runs"], agents.map((a) => [link(a.agent, { view: "agent", agent: a.agent }), String(a.runs)]))
      : el("p", "No agent has recorded a run yet."),
  ];
}

async function agentView(route: Extract<Route, { view: "agent" }>): Promise<Node[]> {
  const range = { ...(route.from ? { from: route.from } : {}), ...(route.to ? { to: route.to } : {}) };
  const [rows, studies] = await Promise.all([gadget.agent(route.agent, range), allStudies()]);
  const [total, ...revisions] = rows;
  const form = el("form", undefined, "margin: 8px 0 16px");
  const from = Object.assign(el("input"), { type: "date", value: route.from?.slice(0, 10) ?? "" });
  const to = Object.assign(el("input"), { type: "date", value: route.to?.slice(0, 10) ?? "" });
  form.append("From ", from, " to ", to, " ", Object.assign(el("button", "Apply"), { type: "submit" }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void show({ view: "agent", agent: route.agent,
      ...(from.value ? { from: `${from.value}T00:00:00.000Z` } : {}),
      ...(to.value ? { to: `${to.value}T23:59:59.999Z` } : {}) });
  });
  const currency = studies[0]?.study.startingCapital.currency ?? "USD";
  const row = (r: AgentSummary) => {
    const ran = r.revision ? studiesRunning(studies, r.revision) : [];
    const where = el("span");
    ran.forEach(({ study, label }, i) => {
      if (i) where.append(", ");
      where.append(link(`${study.name} #${study.number} (${label})`, { view: "study", studyId: study.id }));
    });
    return [r.revision ? revisionName(r.revision) : el("strong", "All revisions"), String(r.cycles), counts(r.outcomes),
      counts(r.decisions), String(r.orders), String(r.riskRejections), String(r.fills), money(r.feesCents, currency),
      changed(`${r.equityChangeCents > 0 ? "+" : ""}${money(r.equityChangeCents, currency)}`, r.equityChangeCents), microUsd(r.reportedCostMicroUsd),
      r.revision ? (ran.length ? where : "none now") : ""];
  };
  const actions = [...new Set(revisions.flatMap((r) => Object.keys(r.decisions)))].toSorted();
  const chart = decisionChart(revisions);
  return [
    nav("agents"),
    back("← All agents", { view: "agents" }),
    el("h1", `Agent ${route.agent}`),
    el("p", `${VIRTUAL} Cost is what the agent reported for its own runs, not a metered amount.` +
      (total?.asOf ? ` Latest run ${total.asOf.slice(0, 19).replace("T", " ")} UTC.` : ""), "muted"),
    form,
    table(["Revision", "Cycles", "Outcomes", "Decisions", "Orders", "Refused by risk", "Fills", "Fees", "Equity change",
      "Reported cost", "Studies"], rows.map(row)),
    el("h2", "Decisions per revision"),
    revisions.length ? svg(chart) : el("p", "No runs in this range."),
    legend(actions.map((a, i) => ({ label: a, color: actionColor(a, i) }))),
    el("h2", "Virtual equity change per revision"),
    revisions.length ? svg(changeChart(revisions)) : el("p", "No runs in this range."),
  ];
}

let showing = 0;
async function show(route: Route): Promise<void> {
  const ticket = ++showing;
  document.body.replaceChildren(el("p", "Loading…", "muted"));
  try {
    if (!(await gadget.bound())) {
      document.body.replaceChildren(el("h1", "Lab Analytics"),
        el("p", "Bind LAB_ANALYTICS to the trading lab to see its studies and agents."));
      return;
    }
    const nodes = route.view === "studies" ? await studiesView()
      : route.view === "study" ? await studyView(route.studyId)
      : route.view === "agents" ? await agentsView()
      : await agentView(route);
    if (ticket === showing) document.body.replaceChildren(...nodes);
  } catch (error) {
    if (ticket === showing) {
      document.body.replaceChildren(el("h1", "Lab Analytics"),
        el("p", error instanceof Error ? error.message : String(error), "error"));
    }
  }
}

await show({ view: "studies" });
