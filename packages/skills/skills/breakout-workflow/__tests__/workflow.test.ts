import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, runWorkflow } from "../files/lib/workflow.ts";
import { FIXTURES } from "../files/lib/fixtures.ts";

const golden: Record<string, unknown> =
    JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

const fixture = (name: string) => FIXTURES.find(f => f.name === name)!;
const run = (name: string) => {
  const { bars, portfolio, policy } = fixture(name);
  return runWorkflow(bars, portfolio, policy, DEFAULT_PARAMS);
};

describe("breakout workflow", () => {
  it.each(FIXTURES)("matches the golden evidence chain for $name", ({ name }) => {
    expect(run(name)).toEqual(golden[name]);
  });

  it("covers every fixture in the golden file", () => {
    expect(Object.keys(golden).toSorted()).toEqual(FIXTURES.map(f => f.name).toSorted());
  });

  it("classifies and acts on each scenario", () => {
    expect([run("breakout-buy").event, run("breakout-buy").action]).toEqual(["price.breakout", "buy"]);
    expect([run("breakdown-sell").event, run("breakdown-sell").action]).toEqual(["price.breakdown", "sell"]);
    expect([run("volume-anomaly-hold").event, run("volume-anomaly-hold").action]).toEqual(["volume.anomaly", "hold"]);
    expect([run("quiet-none").event, run("quiet-none").action]).toEqual(["none", "hold"]);
  });

  it("blocks a breakout when an assertion fails and leaves the portfolio unchanged", () => {
    const result = run("breakout-blocked-at-position-limit");
    expect(result.action).toBe("blocked");
    expect(result.fill).toBeNull();
    expect(result.portfolio).toEqual(fixture("breakout-blocked-at-position-limit").portfolio);
    const assertions = result.evidence.find(step => step.kind === "assertions")!.data as Array<{ id: string; pass: boolean }>;
    expect(assertions.filter(a => !a.pass).map(a => a.id)).toEqual(["buy.capacity"]);
  });

  it("returns the evidence chain in workflow order", () => {
    for (const { name } of FIXTURES) {
      expect(run(name).evidence.map(step => step.kind)).toEqual(
        ["observation", "classification", "assertions", "decision", "order", "fill", "portfolio"]);
    }
  });

  it("is a pure function of its input", () => {
    const { bars, portfolio, policy } = fixture("breakout-buy");
    expect(runWorkflow(bars, portfolio, policy)).toEqual(
      runWorkflow(structuredClone(bars), { ...portfolio }, { ...policy }, { ...DEFAULT_PARAMS }));
  });

  it("rejects too-short, fractional and unordered series", () => {
    const { bars, portfolio, policy } = fixture("breakout-buy");
    expect(() => runWorkflow(bars.slice(0, 3), portfolio, policy)).toThrow(/at least 6/);
    expect(() => runWorkflow(bars.map(b => ({ ...b, closeCents: b.closeCents + 0.5 })), portfolio, policy))
        .toThrow(/integer cents/);
    expect(() => runWorkflow(bars.toReversed(), portfolio, policy)).toThrow(/strictly increasing/);
  });
});
