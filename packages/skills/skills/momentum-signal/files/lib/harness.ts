// The replay contract: the one pure entry the `gadgets` tools (`run`, `dev`, `compare`, `golden`),
// the tests and the gadget itself all call, so what is prototyped is what is tested is what ships.
import { FIXTURES } from "./fixtures.ts";
import { DEFAULT_PARAMS, evaluate, type SignalResult } from "./signal.ts";

/** One rule input: closes in integer cents, oldest first. */
export type Input = { closesCents: number[] };

/** What one replay produced, in the shape every skill's harness returns. */
export type Outcome = {
  /** The decision in one word: `buy`, `sell` or `hold`. */
  decision: string;
  summary: string;
  evidence: Array<{ step: number; kind: string; summary: string }>;
  /** The full result, which the golden file pins. */
  result: SignalResult;
};

/** A signal keeps nothing between sessions. */
export type State = null;

function run(input: Input): Outcome {
  const result = evaluate(input.closesCents, DEFAULT_PARAMS);
  const intent = result.orderIntent
    ? `${result.orderIntent.side} ${result.orderIntent.quantity} at ${result.orderIntent.limitCents} cents`
    : "no order intent";
  return {
    decision: result.signal,
    summary: `Fast over slow by ${result.spreadBps} bps; ${intent}.`,
    evidence: [
      { step: 1, kind: "averages", summary: `fast ${result.fastAvgCents}, slow ${result.slowAvgCents} cents` },
      { step: 2, kind: "signal", summary: `${result.signal} at ${result.spreadBps} bps` },
      { step: 3, kind: "intent", summary: intent },
    ],
    result,
  };
}

export const harness = {
  /** The built-in scenarios, one per fixture. */
  scenarios: FIXTURES.map(({ name, closesCents }) => ({ name, input: { closesCents } })),
  run,
  /** One session over `bars` (oldest first). */
  session(bars: Array<{ closeCents: number }>, _state: State = null): { outcome: Outcome; state: State } {
    return { outcome: run({ closesCents: bars.map(bar => bar.closeCents) }), state: null };
  },
};
