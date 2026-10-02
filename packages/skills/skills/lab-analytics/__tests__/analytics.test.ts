import { describe, expect, it } from "vitest";
import {
  type AgentSummary, actionColor, changeChart, counts, decisionChart, equityChart, microUsd, money, revisionName,
  signedChange, type StudyOverview, studiesRunning,
} from "../files/lib/analytics.ts";

const rev = (number: number) => ({ kind: "workflow", name: "breakout", number, contentHash: `sha256:${number}` });
const summary = (over: Partial<AgentSummary>): AgentSummary => ({
  agent: "momentum", revision: null, cycles: 0, outcomes: {}, decisions: {}, orders: 0, riskRejections: 0, fills: 0,
  feesCents: 0, equityChangeCents: 0, reportedCostMicroUsd: 0, asOf: null, recordClass: "virtual", ...over,
});
const overview = (id: string, variants: { label: string; number: number }[]): StudyOverview => ({
  study: { id, name: "ab", number: 1, status: "active", startingCapital: { currency: "USD", amountCents: 10_000_000 },
    executionModel: "virtual-execution-v1", variants: variants.map((v) => ({ label: v.label, revision: rev(v.number) })) },
  createdAt: "2026-10-02T00:00:00.000Z", health: [], alerts: [],
  variants: variants.map((v) => ({ label: v.label, revision: rev(v.number), equityCents: 10_000_000, changeCents: 0, runs: 0 })),
});

describe("formatting", () => {
  it("writes money, change and reported cost exactly", () => {
    expect(money(10_076_291, "USD")).toBe("100,762.91 USD");
    expect(money(-5, "")).toBe("-0.05");
    expect(signedChange(76_291, 10_000_000)).toBe("+762.91 (+0.76%)");
    expect(signedChange(-150_000, 10_000_000)).toBe("-1,500.00 (-1.50%)");
    expect(microUsd(500)).toBe("0.0005 USD");
    expect(microUsd(2_500_000)).toBe("2.50 USD");
    expect(microUsd(0)).toBe("0.00 USD");
  });

  it("names revisions and counts, most frequent first", () => {
    expect(revisionName(rev(2))).toBe("workflow/breakout@2");
    expect(revisionName(null)).toBe("all revisions");
    expect(counts({ hold: 40, buy: 3, sell: 3 })).toBe("hold 40, buy 3, sell 3");
    expect(counts({})).toBe("none");
  });

  it("finds the studies running a revision", () => {
    const studies = [overview("stu_1", [{ label: "a", number: 1 }, { label: "b", number: 2 }]), overview("stu_2", [{ label: "a", number: 2 }])];
    expect(studiesRunning(studies, rev(2)).map((s) => `${s.study.id}/${s.label}`)).toEqual(["stu_1/b", "stu_2/a"]);
    expect(studiesRunning(studies, rev(3))).toEqual([]);
  });
});

describe("charts", () => {
  it("draws one line per variant between the lowest and highest equity", () => {
    const chart = equityChart([
      { label: "a", points: [{ session: "d1", equityCents: 100 }, { session: "d2", equityCents: 300 }] },
      { label: "b", points: [{ session: "d1", equityCents: 200 }] },
    ], 200, 200, 100);
    const lines = chart.nodes.filter((n) => n.tag === "polyline");
    expect(lines).toHaveLength(2);
    // Plot spans x 90..184 and y 12..72: a starts bottom-left (lowest) and ends top-right (highest).
    expect(lines[0]?.attrs.points).toBe("90,72 184,12");
    expect(lines[1]?.attrs.points).toBe("90,42");
    expect(chart.nodes.filter((n) => n.tag === "text").map((n) => n.text)).toEqual(["3.00", "1.00", "d1", "d2"]);
  });

  it("draws a flat chart when nothing has moved", () => {
    const chart = equityChart([{ label: "a", points: [{ session: "d1", equityCents: 500 }] }], 500);
    expect(chart.nodes.find((n) => n.tag === "polyline")?.attrs.points).toBe("357,102");
    expect(equityChart([], 500).nodes.some((n) => n.tag === "polyline")).toBe(false);
  });

  it("splits each revision's bar by its decisions, one colour per action", () => {
    const chart = decisionChart([
      summary({ revision: rev(1), decisions: { buy: 1, hold: 3 } }),
      summary({ revision: rev(2), decisions: { hold: 2 } }),
    ], 314);
    const rects = chart.nodes.filter((n) => n.tag === "rect");
    expect(rects.map((r) => [r.attrs.width, r.attrs.fill])).toEqual([
      [37, actionColor("buy", 0)], [111, actionColor("hold", 1)], [148, actionColor("hold", 1)],
    ]);
    expect(chart.height).toBe(56);
  });

  it("draws gains right of zero and losses left, scaled to the largest", () => {
    const chart = changeChart([
      summary({ revision: rev(1), equityChangeCents: 1000 }),
      summary({ revision: rev(2), equityChangeCents: -500 }),
    ], 476);
    const [gain, loss] = chart.nodes.filter((n) => n.tag === "rect");
    expect([gain?.attrs.x, gain?.attrs.width]).toEqual([250, 100]);
    expect([loss?.attrs.x, loss?.attrs.width]).toEqual([200, 50]);
    expect(chart.nodes.filter((n) => n.tag === "text").map((n) => n.text)).toContain("-5.00");
  });
});
