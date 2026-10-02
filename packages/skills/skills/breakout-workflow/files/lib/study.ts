// Running the workflow as one variant of a lab study. The lab supplies the cycle's bars and the
// variant's portfolio, and books any fill itself: the workflow only reports what it decided, with
// the evidence that led there. Its own virtual fill (steps 5 to 7) is not sent.

import { type Bar, type Decision, DEFAULT_PARAMS, type Policy, runWorkflow } from "./workflow.ts";

export type LabCycle = { key: string; symbol: string; bars: Bar[] };
export type LabPortfolio = {
  currency: string;
  cashCents: number;
  positions: { symbol: string; quantity: number }[];
  equityCents: number;
};
export type RunReport = {
  cycleKey: string;
  agent: string;
  outcome: "decided" | "error";
  decision: string;
  orderIntent: { symbol: string; side: "buy" | "sell"; quantity: number } | null;
  evidence: { step: number; kind: string; summary: string }[];
};

/** The workflow's own pre-trade limits. The lab's risk gate decides independently. */
export const STUDY_POLICY: Policy = { maxPositionQty: 100, maxOrderCents: 500_000 };
export const AGENT = "breakout-workflow";

/** What the workflow decides for `cycle` given `portfolio`, as a run report for the lab. */
export function cycleReport(cycle: LabCycle, portfolio: LabPortfolio): RunReport {
  const held = portfolio.positions.find((p) => p.symbol === cycle.symbol)?.quantity ?? 0;
  try {
    const result = runWorkflow(cycle.bars, { cashCents: portfolio.cashCents, positionQty: held }, STUDY_POLICY,
      DEFAULT_PARAMS);
    const decision = result.evidence.find((step) => step.step === 4)?.data as Decision | undefined;
    const trade = result.action === "buy" || result.action === "sell";
    return {
      cycleKey: cycle.key,
      agent: AGENT,
      outcome: "decided",
      decision: `${result.event} -> ${result.action}`,
      orderIntent: trade && decision
        ? { symbol: cycle.symbol, side: result.action as "buy" | "sell", quantity: decision.quantity }
        : null,
      evidence: result.evidence
        .filter((step) => step.step <= 4)
        .map(({ step, kind, summary }) => ({ step, kind, summary })),
    };
  } catch (error) {
    return {
      cycleKey: cycle.key,
      agent: AGENT,
      outcome: "error",
      decision: error instanceof Error ? error.message : String(error),
      orderIntent: null,
      evidence: [],
    };
  }
}
