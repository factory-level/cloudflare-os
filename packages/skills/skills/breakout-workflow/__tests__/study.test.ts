import { describe, expect, it } from "vitest";
import { cycleReport } from "../files/lib/study.ts";

const bars = (closes: number[], lastVolume = 100) =>
  closes.map((closeCents, i) => ({ t: 1_000 + i * 86_400, closeCents, volume: i === closes.length - 1 ? lastVolume : 100 }));
const portfolio = (quantity: number) => ({
  currency: "USD", cashCents: 1_000_000, equityCents: 1_000_000,
  positions: quantity ? [{ symbol: "FIXT", quantity }] : [],
});

describe("cycleReport", () => {
  it("turns a breakout into a buy intent and keeps evidence up to the decision", () => {
    const report = cycleReport({ key: "2026-06-26", symbol: "FIXT", bars: bars([100, 101, 100, 102, 101, 120]) }, portfolio(0));
    expect(report).toMatchObject({ cycleKey: "2026-06-26", outcome: "decided", orderIntent: { symbol: "FIXT", side: "buy" } });
    expect(report.evidence.map((e) => e.step)).toEqual([1, 2, 3, 4]);
  });

  it("reports no intent on a quiet bar, and an error on too few bars", () => {
    expect(cycleReport({ key: "k", symbol: "FIXT", bars: bars([100, 101, 100, 102, 101, 101]) }, portfolio(0)).orderIntent)
      .toBeNull();
    expect(cycleReport({ key: "k", symbol: "FIXT", bars: bars([100]) }, portfolio(0)))
      .toMatchObject({ outcome: "error", orderIntent: null });
  });
});
