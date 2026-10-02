// The skill's whole decision rule, kept pure so the same input always yields the same output: no
// clock, no randomness, no I/O. Prices are integer cents, so averages compare exactly.

/** Tunable parameters of the rule. */
export type SignalParams = {
  /** Bars in the fast moving average. */
  fast: number;
  /** Bars in the slow moving average; must exceed `fast`. */
  slow: number;
  /** Minimum fast-over-slow spread, in basis points, before acting. */
  thresholdBps: number;
  /** Cash the intent may commit, in cents. */
  budgetCents: number;
};

/** What to do, and why. */
export type SignalResult = {
  signal: "buy" | "sell" | "hold";
  /** Fast-over-slow spread in basis points, rounded toward zero. */
  spreadBps: number;
  fastAvgCents: number;
  slowAvgCents: number;
  orderIntent: { side: "buy" | "sell"; quantity: number; limitCents: number } | null;
};

/** The defaults the gadget and the fixtures use. */
export const DEFAULT_PARAMS: SignalParams = {
  fast: 3,
  slow: 8,
  thresholdBps: 50,
  budgetCents: 1_000_000,
};

/** Evaluates the rule over `closesCents` (oldest first). */
export function evaluate(closesCents: readonly number[], params: SignalParams): SignalResult {
  if (!Number.isInteger(params.fast) || !Number.isInteger(params.slow)
      || params.fast < 1 || params.slow <= params.fast) {
    throw new Error("fast and slow must be integers with 1 <= fast < slow");
  }
  if (closesCents.length < params.slow) {
    throw new Error(`need at least ${params.slow} closes, got ${closesCents.length}`);
  }
  for (const close of closesCents) {
    if (!Number.isInteger(close) || close <= 0) throw new Error("closes must be positive integer cents");
  }

  const fastAvgCents = averageCents(closesCents.slice(-params.fast));
  const slowAvgCents = averageCents(closesCents.slice(-params.slow));
  const spreadBps = Math.trunc(((fastAvgCents - slowAvgCents) * 10_000) / slowAvgCents);
  const last = closesCents[closesCents.length - 1]!;

  if (spreadBps >= params.thresholdBps) {
    const quantity = Math.floor(params.budgetCents / last);
    return {
      signal: "buy", spreadBps, fastAvgCents, slowAvgCents,
      orderIntent: quantity > 0 ? { side: "buy", quantity, limitCents: last } : null,
    };
  }
  if (spreadBps <= -params.thresholdBps) {
    return {
      signal: "sell", spreadBps, fastAvgCents, slowAvgCents,
      orderIntent: { side: "sell", quantity: Math.floor(params.budgetCents / last), limitCents: last },
    };
  }
  return { signal: "hold", spreadBps, fastAvgCents, slowAvgCents, orderIntent: null };
}

// Rounded half-up to whole cents so every average is an integer.
function averageCents(values: readonly number[]): number {
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.floor((sum * 2 + values.length) / (values.length * 2));
}
