// The replay contract: the one pure entry the `gadgets` tools (`run`, `dev`, `compare`, `golden`),
// the tests and the gadget itself all call, so what is prototyped is what is tested is what ships.
import { FIXTURES } from "./fixtures.ts";
import { DEFAULT_PARAMS, EXECUTION_MODEL_V1, runWorkflow, type Bar, type Policy, type Portfolio, type WorkflowResult } from "./workflow.ts";

/** One workflow input. */
export type Input = { bars: Bar[]; portfolio: Portfolio; policy: Policy };

/** What one replay produced, in the shape every skill's harness returns. */
export type Outcome = {
  /** The decision in one phrase, e.g. `price.breakout -> buy`. */
  decision: string;
  /** Why, and what it did to the portfolio. */
  summary: string;
  evidence: Array<{ step: number; kind: string; summary: string }>;
  /** The full result, which the golden file pins. */
  result: WorkflowResult;
};

/** The state a multi-session replay carries forward: the virtual portfolio. */
export type State = Portfolio;

const SESSION_POLICY: Policy = { maxPositionQty: 100, maxOrderCents: 500_000 };
const SESSION_START: Portfolio = { cashCents: 1_000_000, positionQty: 0 };

function run(input: Input): Outcome {
  const result = runWorkflow(input.bars, input.portfolio, input.policy, DEFAULT_PARAMS);
  const decision = result.evidence.find(step => step.kind === "decision");
  return {
    decision: `${result.event} -> ${result.action}`,
    summary: `${decision?.summary ?? ""} Portfolio: ${result.portfolio.positionQty} sh, `
      + `${result.portfolio.cashCents} cents (${EXECUTION_MODEL_V1.id}).`,
    evidence: result.evidence.map(({ step, kind, summary }) => ({ step, kind, summary })),
    result,
  };
}

export const harness = {
  /** The built-in scenarios, one per fixture. */
  scenarios: FIXTURES.map(({ name, bars, portfolio, policy }) => ({ name, input: { bars, portfolio, policy } })),
  run,
  /** One session over `bars` (oldest first), trading the portfolio carried in `state`. */
  session(bars: Bar[], state: State = SESSION_START): { outcome: Outcome; state: State } {
    const outcome = run({ bars, portfolio: state, policy: SESSION_POLICY });
    return { outcome, state: outcome.result.portfolio };
  },
};
