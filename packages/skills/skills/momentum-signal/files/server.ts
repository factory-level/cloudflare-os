// The skill's Durable Object. It holds no state: every method is a pure function of its arguments,
// so a pushed copy answers exactly as the local one did.
import { DurableObject } from "cloudflare:workers";
import { DEFAULT_PARAMS, evaluate, type SignalParams, type SignalResult } from "./lib/signal.ts";
import { harness, type Outcome } from "./lib/harness.ts";

export class Gadget extends DurableObject {
  /** Evaluates the momentum rule over `closesCents`, with `params` overriding the defaults. */
  evaluate(closesCents: number[], params?: Partial<SignalParams>): SignalResult {
    return evaluate(closesCents, { ...DEFAULT_PARAMS, ...params });
  }

  /** Evaluates every built-in fixture with the default parameters. */
  runFixtures(): Array<{ name: string; result: SignalResult }> {
    return harness.scenarios.map(scenario => ({ name: scenario.name, result: harness.run(scenario.input).result }));
  }

  /** One replay session over `bars`, exactly as `gadgets run --bars` computes it locally. */
  replay(bars: Array<{ closeCents: number }>): { outcome: Outcome; state: null } {
    return harness.session(bars);
  }
}
