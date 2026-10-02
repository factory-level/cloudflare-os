// The skill's Durable Object. `runWorkflow` and `runFixtures` are pure functions of their arguments,
// so a pushed copy answers exactly as the local one did. A scheduled run (see `[restore]`) adds the
// one non-deterministic step -- an optional model review of the runs that acted -- and records it.
import { DurableObject, RpcTarget, restore } from "cloudflare:workers";
import {
  DEFAULT_PARAMS, runWorkflow, type Bar, type Policy, type Portfolio, type WorkflowParams, type WorkflowResult,
} from "./lib/workflow.ts";
import { harness, type Outcome, type State } from "./lib/harness.ts";
import { recordOccurrence, RUN_PREFIX, type ScheduledFiring, type ScheduledRunRecord } from "./lib/occurrence.ts";
import type { NamedRun } from "./lib/review.ts";
import { cycleReport, type LabCycle, type LabPortfolio, type RunReport } from "./lib/study.ts";

export type { ScheduledRunRecord };

// Missing from @cloudflare/workers-types: the symbol of the method `ctx.restore()` invokes to rebuild
// a persistent callback.
declare module "cloudflare:workers" {
  export const restore: unique symbol;
}

/** The Workshop's `aiModel` binding. */
interface LanguageModelBinding {
  run(options: { prompt: string; systemPrompt?: string }): Promise<string>;
}

/** The part of the lab connector's `StudyVariant` this gadget uses. */
interface LabVariantBinding {
  nextCycle(): Promise<LabCycle | null>;
  portfolio(): Promise<LabPortfolio>;
  recordRun(report: RunReport): Promise<{ id: string; riskRejection: string | null }>;
}

/** The bindings this Durable Object may be given; there are none it requires. */
interface GadgetEnv {
  REVIEW_MODEL?: LanguageModelBinding;
  LAB_VARIANT?: LabVariantBinding;
}

/** The outcome of one study cycle. */
export type StudyCycleResult =
  | { status: "unbound" | "waiting" }
  | { status: "recorded"; report: RunReport; runId: string; riskRejection: string | null };

/** Takes the variant's waiting cycle, if any, decides it, and records the run with the lab. */
async function runStudyCycle(env: GadgetEnv): Promise<StudyCycleResult> {
  const variant = env.LAB_VARIANT;
  if (!variant) return { status: "unbound" };
  const cycle = await variant.nextCycle();
  if (!cycle) return { status: "waiting" };
  const report = cycleReport(cycle, await variant.portfolio());
  const run = await variant.recordRun(report);
  return { status: "recorded", report, runId: run.id, riskRejection: run.riskRejection };
}

function runFixtures(): NamedRun[] {
  return harness.scenarios.map(scenario => ({ name: scenario.name, result: harness.run(scenario.input).result }));
}

/** The gadget. Props is `unknown` so that `ctx` is the plain `DurableObjectState` the constructor receives. */
export class Gadget extends DurableObject<GadgetEnv, unknown> {
  /** Runs the workflow over `bars` (oldest first), with `params` overriding the defaults. */
  runWorkflow(bars: Bar[], portfolio: Portfolio, policy: Policy, params?: Partial<WorkflowParams>): WorkflowResult {
    return runWorkflow(bars, portfolio, policy, { ...DEFAULT_PARAMS, ...params });
  }

  /** Runs every built-in fixture with the default parameters. */
  runFixtures(): NamedRun[] {
    return runFixtures();
  }

  /** One replay session over `bars`, exactly as `gadgets run --bars` computes it locally. */
  replay(bars: Bar[], state?: State): { outcome: Outcome; state: State } {
    return harness.session(bars, state);
  }

  /** Runs one cycle of the bound study variant: see `runStudyCycle`. */
  async runStudyCycle(): Promise<StudyCycleResult> {
    return runStudyCycle(this.env);
  }

  /** The most recent scheduled runs, newest first. */
  async scheduledRuns(limit = 10): Promise<ScheduledRunRecord[]> {
    const entries = await this.ctx.storage.list<ScheduledRunRecord>({ prefix: RUN_PREFIX, reverse: true, limit });
    return [...entries.values()];
  }

  /** Rebuilds a persistent callback: `{ type: "scheduledRun" }` is the Scheduled Tasks hook. */
  async [restore](params: { type?: unknown }): Promise<ScheduledRun> {
    if (params.type === "scheduledRun") return new ScheduledRun(this.ctx.storage, this.env);
    throw new TypeError(`Unknown restore type: ${String(params.type)}`);
  }
}

/** The Scheduled Tasks callback: runs the fixtures, reviews what acted, and records the result once per `runId`. */
class ScheduledRun extends RpcTarget {
  #storage: DurableObjectStorage;
  #env: GadgetEnv;

  constructor(storage: DurableObjectStorage, env: GadgetEnv) {
    super();
    this.#storage = storage;
    this.#env = env;
  }

  async onSchedule(firing: ScheduledFiring): Promise<void> {
    const model = this.#env.REVIEW_MODEL;
    await recordOccurrence(this.#storage, firing, runFixtures(), model && (prompt => model.run(prompt)));
    // A bound study variant takes its cycle on the same schedule; the lab keeps one run per cycle.
    if (this.#env.LAB_VARIANT) await runStudyCycle(this.#env);
  }
}
