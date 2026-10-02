import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness } from "../files/lib/harness.ts";

const golden: Record<string, unknown> =
    JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

describe("replay harness", () => {
  it.each(harness.scenarios)("pins $name to the golden result", ({ name, input }) => {
    expect(harness.run(input).result).toEqual(golden[name]);
  });

  it("summarises each outcome with its decision and evidence chain", () => {
    const outcome = harness.run(harness.scenarios.find(s => s.name === "breakout-buy")!.input);
    expect(outcome.decision).toBe("price.breakout -> buy");
    expect(outcome.evidence.map(step => step.kind)).toEqual(
        ["observation", "classification", "assertions", "decision", "order", "fill", "portfolio"]);
  });

  it("carries the portfolio from one session into the next", () => {
    const bars = harness.scenarios.find(s => s.name === "breakout-buy")!.input.bars;
    const first = harness.session(bars);
    expect(first.outcome.decision).toBe("price.breakout -> buy");
    expect(first.state.positionQty).toBeGreaterThan(0);
    const second = harness.session(bars, first.state);
    expect(second.outcome.result.portfolio.positionQty).toBeGreaterThanOrEqual(first.state.positionQty);
    expect(second.state).toEqual(second.outcome.result.portfolio);
  });
});
