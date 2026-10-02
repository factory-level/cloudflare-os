// The skill's whole workflow, kept pure so the same input always yields the same output: no clock,
// no randomness, no I/O. Money is integer cents and every comparison is exact integer arithmetic.

/** One price bar. `t` is epoch seconds; bars are passed oldest first. */
export type Bar = { t: number; closeCents: number; volume: number };

/** The virtual account the workflow trades. */
export type Portfolio = { cashCents: number; positionQty: number };

/** Risk limits every order must respect. */
export type Policy = { maxPositionQty: number; maxOrderCents: number };

/** Tunable parameters of the classifier. */
export type WorkflowParams = {
  /** Bars in the prior window the latest bar is compared against. */
  lookback: number;
  /** Latest volume must be at least this multiple of the window's average to be an anomaly. */
  volumeMultiple: number;
};

/** The defaults the gadget and the fixtures use. */
export const DEFAULT_PARAMS: WorkflowParams = { lookback: 5, volumeMultiple: 3 };

/** Execution model v1: fixed slippage against the trader, plus a per-share fee. */
export const EXECUTION_MODEL_V1 = { id: "execution-model-v1", slippageBps: 5, feeCentsPerShare: 1 } as const;

/** The event the latest bar represents. */
export type EventType = "price.breakout" | "price.breakdown" | "volume.anomaly" | "none";

/** Step 1: what was looked at. */
export type Observation = {
  barCount: number;
  lookback: number;
  latest: Bar;
  window: { fromT: number; toT: number; maxCloseCents: number; minCloseCents: number; volumeSum: number };
};

/** Step 2: the latest bar's event, and the comparison that produced it. */
export type Classification = { event: EventType; reason: string };

/** Step 3: one deterministic risk check. */
export type Assertion = { id: string; pass: boolean; reason: string };

/** Step 4: what the workflow chose to do. `blocked` means it wanted to trade but a check failed. */
export type Decision = {
  intended: "buy" | "sell" | "hold";
  action: "buy" | "sell" | "hold" | "blocked";
  quantity: number;
  reason: string;
};

/** Step 5: the order sent to the virtual venue. */
export type Order = { side: "buy" | "sell"; quantity: number; referenceCents: number };

/** Step 6: the virtual fill under execution model v1. */
export type Fill = {
  model: typeof EXECUTION_MODEL_V1.id;
  side: "buy" | "sell";
  quantity: number;
  priceCents: number;
  slippageCentsPerShare: number;
  notionalCents: number;
  feeCents: number;
  cashDeltaCents: number;
};

/** One link of the evidence chain, in the order the workflow produced it. */
export type EvidenceStep =
  | { step: 1; kind: "observation"; summary: string; data: Observation }
  | { step: 2; kind: "classification"; summary: string; data: Classification }
  | { step: 3; kind: "assertions"; summary: string; data: Assertion[] }
  | { step: 4; kind: "decision"; summary: string; data: Decision }
  | { step: 5; kind: "order"; summary: string; data: Order | null }
  | { step: 6; kind: "fill"; summary: string; data: Fill | null }
  | { step: 7; kind: "portfolio"; summary: string; data: Portfolio };

/** The workflow's outcome and the evidence that justifies it. */
export type WorkflowResult = {
  event: EventType;
  action: Decision["action"];
  fill: Fill | null;
  portfolio: Portfolio;
  evidence: EvidenceStep[];
};

/** Step 1: validates the inputs and summarises the latest bar against the prior window. */
export function observe(bars: readonly Bar[], params: WorkflowParams): Observation {
  if (!isPositiveInt(params.lookback)) throw new Error("lookback must be a positive integer");
  if (!isPositiveInt(params.volumeMultiple)) throw new Error("volumeMultiple must be a positive integer");
  if (bars.length < params.lookback + 1) {
    throw new Error(`need at least ${params.lookback + 1} bars, got ${bars.length}`);
  }
  bars.forEach((bar, i) => {
    if (!Number.isInteger(bar.t)) throw new Error("bar t must be integer epoch seconds");
    if (!isPositiveInt(bar.closeCents)) throw new Error("closes must be positive integer cents");
    if (!Number.isInteger(bar.volume) || bar.volume < 0) throw new Error("volume must be a non-negative integer");
    if (i > 0 && bar.t <= bars[i - 1]!.t) throw new Error("bars must be strictly increasing in t");
  });

  const latest = bars[bars.length - 1]!;
  const window = bars.slice(-params.lookback - 1, -1);
  const closes = window.map(bar => bar.closeCents);
  return {
    barCount: bars.length,
    lookback: params.lookback,
    latest: { ...latest },
    window: {
      fromT: window[0]!.t,
      toT: window[window.length - 1]!.t,
      maxCloseCents: Math.max(...closes),
      minCloseCents: Math.min(...closes),
      volumeSum: window.reduce((sum, bar) => sum + bar.volume, 0),
    },
  };
}

/** Step 2: classifies the latest bar. A price event takes precedence over a volume anomaly. */
export function classify(observation: Observation, params: WorkflowParams): Classification {
  const { latest, window, lookback } = observation;
  if (latest.closeCents > window.maxCloseCents) {
    return { event: "price.breakout", reason: `close ${latest.closeCents} > window max ${window.maxCloseCents}` };
  }
  if (latest.closeCents < window.minCloseCents) {
    return { event: "price.breakdown", reason: `close ${latest.closeCents} < window min ${window.minCloseCents}` };
  }
  // volume >= multiple * (sum / lookback), cross-multiplied so no average is ever rounded.
  if (latest.volume * lookback >= params.volumeMultiple * window.volumeSum) {
    return {
      event: "volume.anomaly",
      reason: `volume ${latest.volume} >= ${params.volumeMultiple}x window average ${window.volumeSum}/${lookback}`,
    };
  }
  return {
    event: "none",
    reason: `close within [${window.minCloseCents}, ${window.maxCloseCents}] and volume below ${params.volumeMultiple}x average`,
  };
}

/** Step 3: the risk checks for this event. Every check is recorded, passing or not. */
export function assertRisk(
  classification: Classification, latest: Bar, portfolio: Portfolio, policy: Policy,
): Assertion[] {
  const assertions: Assertion[] = [
    check("portfolio.valid",
      Number.isInteger(portfolio.cashCents) && portfolio.cashCents >= 0
        && Number.isInteger(portfolio.positionQty) && portfolio.positionQty >= 0,
      `cash ${portfolio.cashCents} and position ${portfolio.positionQty} are non-negative integers`),
    check("policy.valid",
      isPositiveInt(policy.maxPositionQty) && isPositiveInt(policy.maxOrderCents),
      `maxPositionQty ${policy.maxPositionQty} and maxOrderCents ${policy.maxOrderCents} are positive integers`),
    check("position.within-limit",
      portfolio.positionQty <= policy.maxPositionQty,
      `position ${portfolio.positionQty} <= max ${policy.maxPositionQty}`),
  ];

  if (classification.event === "price.breakout") {
    const perShare = fillPriceCents("buy", latest.closeCents) + EXECUTION_MODEL_V1.feeCentsPerShare;
    assertions.push(
      check("buy.capacity", portfolio.positionQty < policy.maxPositionQty,
        `room for at least 1 share: position ${portfolio.positionQty} < max ${policy.maxPositionQty}`),
      check("buy.cash", portfolio.cashCents >= perShare,
        `cash ${portfolio.cashCents} covers 1 share at ${perShare} all-in`),
      check("buy.order-limit", policy.maxOrderCents >= perShare,
        `max order ${policy.maxOrderCents} covers 1 share at ${perShare} all-in`),
    );
  } else if (classification.event === "price.breakdown") {
    const perShare = fillPriceCents("sell", latest.closeCents);
    assertions.push(
      check("sell.has-position", portfolio.positionQty > 0, `position ${portfolio.positionQty} > 0`),
      check("sell.order-limit", policy.maxOrderCents >= perShare,
        `max order ${policy.maxOrderCents} covers 1 share at ${perShare}`),
    );
  }
  return assertions;
}

/** Step 4: breakout buys, breakdown sells the existing position, anything else holds. */
export function decide(
  classification: Classification, assertions: readonly Assertion[],
  latest: Bar, portfolio: Portfolio, policy: Policy,
): Decision {
  const intended = classification.event === "price.breakout" ? "buy"
    : classification.event === "price.breakdown" ? "sell" : "hold";
  const failed = assertions.filter(a => !a.pass).map(a => a.id);

  if (failed.length > 0) {
    return { intended, action: "blocked", quantity: 0, reason: `failed assertions: ${failed.join(", ")}` };
  }
  if (intended === "buy") {
    const perShare = fillPriceCents("buy", latest.closeCents) + EXECUTION_MODEL_V1.feeCentsPerShare;
    const byCapacity = policy.maxPositionQty - portfolio.positionQty;
    const byOrderLimit = Math.floor(policy.maxOrderCents / perShare);
    const byCash = Math.floor(portfolio.cashCents / perShare);
    const quantity = Math.min(byCapacity, byOrderLimit, byCash);
    return {
      intended, action: "buy", quantity,
      reason: `min(capacity ${byCapacity}, order limit ${byOrderLimit}, cash ${byCash}) at ${perShare} all-in`,
    };
  }
  if (intended === "sell") {
    const byOrderLimit = Math.floor(policy.maxOrderCents / fillPriceCents("sell", latest.closeCents));
    const quantity = Math.min(portfolio.positionQty, byOrderLimit);
    return {
      intended, action: "sell", quantity,
      reason: `min(position ${portfolio.positionQty}, order limit ${byOrderLimit})`,
    };
  }
  return { intended, action: "hold", quantity: 0, reason: `no trade on ${classification.event}` };
}

/** Step 5-6: fills `order` virtually under execution model v1 and returns the resulting portfolio. */
export function executeVirtually(order: Order, portfolio: Portfolio): { fill: Fill; portfolio: Portfolio } {
  const priceCents = fillPriceCents(order.side, order.referenceCents);
  const notionalCents = priceCents * order.quantity;
  const feeCents = EXECUTION_MODEL_V1.feeCentsPerShare * order.quantity;
  const cashDeltaCents = order.side === "buy" ? -(notionalCents + feeCents) : notionalCents - feeCents;
  return {
    fill: {
      model: EXECUTION_MODEL_V1.id,
      side: order.side,
      quantity: order.quantity,
      priceCents,
      slippageCentsPerShare: slippageCents(order.referenceCents),
      notionalCents,
      feeCents,
      cashDeltaCents,
    },
    portfolio: {
      cashCents: portfolio.cashCents + cashDeltaCents,
      positionQty: portfolio.positionQty + (order.side === "buy" ? order.quantity : -order.quantity),
    },
  };
}

/** Runs the whole workflow over `bars` and returns the outcome with its evidence chain. */
export function runWorkflow(
  bars: readonly Bar[], portfolio: Portfolio, policy: Policy, params: WorkflowParams = DEFAULT_PARAMS,
): WorkflowResult {
  const observation = observe(bars, params);
  const classification = classify(observation, params);
  const assertions = assertRisk(classification, observation.latest, portfolio, policy);
  const decision = decide(classification, assertions, observation.latest, portfolio, policy);

  const order: Order | null = (decision.action === "buy" || decision.action === "sell") && decision.quantity > 0
    ? { side: decision.action, quantity: decision.quantity, referenceCents: observation.latest.closeCents }
    : null;
  const executed = order ? executeVirtually(order, portfolio) : null;
  const finalPortfolio = executed ? executed.portfolio : { ...portfolio };
  const failedCount = assertions.filter(a => !a.pass).length;

  const evidence: EvidenceStep[] = [
    { step: 1, kind: "observation", data: observation,
      summary: `${observation.barCount} bars; latest t=${observation.latest.t} close ${observation.latest.closeCents} `
        + `vol ${observation.latest.volume}; prior ${observation.lookback}-bar window `
        + `[${observation.window.minCloseCents}, ${observation.window.maxCloseCents}]` },
    { step: 2, kind: "classification", data: classification,
      summary: `${classification.event}: ${classification.reason}` },
    { step: 3, kind: "assertions", data: assertions,
      summary: `${assertions.length - failedCount}/${assertions.length} passed`
        + (failedCount > 0 ? `; failed: ${assertions.filter(a => !a.pass).map(a => a.id).join(", ")}` : "") },
    { step: 4, kind: "decision", data: decision,
      summary: `${decision.action}${decision.quantity > 0 ? ` ${decision.quantity}` : ""}: ${decision.reason}` },
    { step: 5, kind: "order", data: order,
      summary: order ? `${order.side} ${order.quantity} @ ref ${order.referenceCents}` : "no order" },
    { step: 6, kind: "fill", data: executed?.fill ?? null,
      summary: executed
        ? `${executed.fill.side} ${executed.fill.quantity} @ ${executed.fill.priceCents} `
          + `(slippage ${executed.fill.slippageCentsPerShare}/sh, fee ${executed.fill.feeCents}), `
          + `cash ${executed.fill.cashDeltaCents >= 0 ? "+" : ""}${executed.fill.cashDeltaCents}`
        : "no fill" },
    { step: 7, kind: "portfolio", data: finalPortfolio,
      summary: `cash ${finalPortfolio.cashCents}, position ${finalPortfolio.positionQty}` },
  ];

  return {
    event: classification.event,
    action: decision.action,
    fill: executed?.fill ?? null,
    portfolio: finalPortfolio,
    evidence,
  };
}

// Slippage of `slippageBps` on `referenceCents`, rounded up to whole cents so it never favours the trader.
function slippageCents(referenceCents: number): number {
  return Math.floor((referenceCents * EXECUTION_MODEL_V1.slippageBps + 9_999) / 10_000);
}

function fillPriceCents(side: "buy" | "sell", referenceCents: number): number {
  const slip = slippageCents(referenceCents);
  return side === "buy" ? referenceCents + slip : referenceCents - slip;
}

function check(id: string, pass: boolean, reason: string): Assertion {
  return { id, pass, reason };
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
