// Fixed scenarios that exercise each branch of the workflow. The gadget shows them, and the tests
// pin each one's evidence chain.
import type { Bar, Policy, Portfolio } from "./workflow.ts";

/** A named workflow input. */
export type Fixture = { name: string; bars: Bar[]; portfolio: Portfolio; policy: Policy };

// Daily bars from 2026-09-01T00:00:00Z.
function series(closesCents: number[], volumes: number[]): Bar[] {
  return closesCents.map((closeCents, i) => ({ t: 1_788_220_800 + i * 86_400, closeCents, volume: volumes[i]! }));
}

const POLICY: Policy = { maxPositionQty: 100, maxOrderCents: 500_000 };
const BREAKOUT_BARS = series([10000, 10020, 9990, 10010, 10030, 10150], [1000, 1000, 1000, 1000, 1000, 1200]);

/** The scenarios the gadget and its tests run. */
export const FIXTURES: Fixture[] = [
  {
    name: "breakout-buy",
    bars: BREAKOUT_BARS,
    portfolio: { cashCents: 1_000_000, positionQty: 0 },
    policy: POLICY,
  },
  {
    name: "breakdown-sell",
    bars: series([10000, 9980, 10010, 9990, 9970, 9800], [1000, 1000, 1000, 1000, 1000, 1500]),
    portfolio: { cashCents: 500_000, positionQty: 40 },
    policy: POLICY,
  },
  {
    name: "volume-anomaly-hold",
    bars: series([10000, 10020, 9990, 10010, 10030, 10005], [1000, 1100, 900, 1000, 1000, 3500]),
    portfolio: { cashCents: 1_000_000, positionQty: 10 },
    policy: POLICY,
  },
  {
    name: "breakout-blocked-at-position-limit",
    bars: BREAKOUT_BARS,
    portfolio: { cashCents: 1_000_000, positionQty: 100 },
    policy: POLICY,
  },
  {
    name: "quiet-none",
    bars: series([10000, 10020, 9990, 10010, 10030, 10005], [1000, 1000, 1000, 1000, 1000, 1100]),
    portfolio: { cashCents: 1_000_000, positionQty: 0 },
    policy: POLICY,
  },
];
