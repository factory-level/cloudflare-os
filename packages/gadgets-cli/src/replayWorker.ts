// Run as a child process by `replay.ts`: imports one skill's replay harness fresh, runs what stdin
// asks for, and prints the outcome as JSON. A new process per replay means an edited `lib/` module
// is always re-read, and a harness that throws or loops cannot take the CLI down with it.

import { join } from "node:path";
import { pathToFileURL } from "node:url";

type Outcome = { decision: string; summary: string; evidence: unknown[]; result: unknown };
type Harness = {
  scenarios: Array<{ name: string; input: unknown }>;
  run(input: unknown): Outcome;
  session(bars: unknown[], state?: unknown): { outcome: Outcome; state: unknown };
};
type Request = {
  scenario?: string;
  inputs?: Array<{ name: string; input: unknown }>;
  bars?: Array<{ t: number }>;
  walk?: boolean;
};

const directory = process.argv[2]!;
const request = JSON.parse(await new Response(process.stdin as unknown as ReadableStream).text() || "{}") as Request;

const module = await import(pathToFileURL(join(directory, "files", "lib", "harness.ts")).href) as { harness?: Harness };
const harness = module.harness;
if (!harness || !Array.isArray(harness.scenarios) || typeof harness.run !== "function"
    || typeof harness.session !== "function") {
  throw new Error("files/lib/harness.ts must export `harness` with `scenarios`, `run` and `session`");
}

const entries: unknown[] = [];
const attempt = (name: string, input: unknown, produce: () => Outcome) => {
  try {
    entries.push({ name, input, ...produce() });
  } catch (err) {
    entries.push({ name, input, error: err instanceof Error ? err.message : String(err) });
  }
};

if (request.bars && request.walk) {
  // Time acceleration: one session per bar, each seeing only the bars up to it, carrying state.
  let state: unknown;
  request.bars.forEach((bar, index) => {
    const seen = request.bars!.slice(0, index + 1);
    attempt(`session ${index + 1} (t=${bar.t})`, undefined, () => {
      const next = harness.session(seen, state);
      state = next.state;
      return next.outcome;
    });
  });
} else if (request.bars) {
  attempt("bars", undefined, () => harness.session(request.bars!).outcome);
} else {
  const scenarios = (request.inputs ?? harness.scenarios)
      .filter(scenario => !request.scenario || scenario.name === request.scenario);
  if (scenarios.length === 0) throw new Error(`No scenario named ${request.scenario}`);
  for (const scenario of scenarios) attempt(scenario.name, scenario.input, () => harness.run(scenario.input));
}

process.stdout.write(JSON.stringify({ entries }));
