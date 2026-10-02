import { describe, expect, it } from "vitest";
import { change, money, orderOutcome, type Run, tally } from "../files/lib/console.ts";

const run = (over: Partial<Run>): Run => ({
  id: "run_1", variant: "a", cycleKey: "2026-06-26", agent: "x", outcome: "decided", decision: "hold",
  orderIntent: null, riskRejection: null, fill: null, ...over,
});

describe("console helpers", () => {
  it("formats money exactly", () => {
    expect(money(10_076_291, "USD")).toBe("100,762.91 USD");
    expect(money(-5, "USD")).toBe("-0.05 USD");
  });

  it("measures change from the start", () => {
    expect(change(10_000_000, 10_076_291)).toEqual({ cents: 76_291, bps: 76 });
    expect(change(0, 5)).toEqual({ cents: 5, bps: 0 });
  });

  it("says what happened to each order", () => {
    const order = { symbol: "FIXT", side: "buy", quantity: 10 };
    expect(orderOutcome(run({}))).toBe("no order");
    expect(orderOutcome(run({ orderIntent: order, riskRejection: "insufficient_cash" })))
      .toBe("buy 10 FIXT: refused (insufficient_cash)");
    expect(orderOutcome(run({ orderIntent: order }))).toBe("buy 10 FIXT: waiting for the next open");
    expect(orderOutcome(run({ orderIntent: order, fill: { side: "buy", quantity: 10, priceCents: 5003, feeCents: 100 } })))
      .toBe("buy 10 FIXT: filled 10 at 50.03 + fee 1.00");
  });

  it("tallies runs per variant", () => {
    const order = { symbol: "FIXT", side: "sell", quantity: 1 };
    expect(tally([run({}), run({ variant: "b", orderIntent: order, riskRejection: "no_position_to_sell" })])).toEqual({
      a: { runs: 1, orders: 0, refused: 0, filled: 0 },
      b: { runs: 1, orders: 1, refused: 1, filled: 0 },
    });
  });
});
