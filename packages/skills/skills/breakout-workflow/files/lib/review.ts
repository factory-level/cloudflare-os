// The one judgment step of a scheduled run: a short reviewer note on the runs that acted. Building
// the prompt is pure and deterministic; only the model call itself (in server.ts) is not, and it is
// skipped entirely when there is nothing to judge.
import type { WorkflowResult } from "./workflow.ts";

export type NamedRun = { name: string; result: WorkflowResult };

export type ReviewPrompt = { systemPrompt: string; prompt: string };

const SYSTEM_PROMPT = "You review a deterministic virtual-trading workflow for a human. You are given "
  + "the evidence chain of each run that bought, sold or was blocked. In at most five sentences, say "
  + "what happened and anything a reviewer should double-check. Do not recommend trades; the "
  + "decisions are already made by code.";

/** The runs a reviewer should look at: every run whose decision was not a plain hold. */
export function actionableRuns(runs: readonly NamedRun[]): NamedRun[] {
  return runs.filter(run => run.result.action !== "hold");
}

/** The model prompt for `runs`, or `null` when no run acted, so the model is not called at all. */
export function reviewPrompt(runs: readonly NamedRun[]): ReviewPrompt | null {
  const actionable = actionableRuns(runs);
  if (actionable.length === 0) return null;
  const sections = actionable.map(({ name, result }) => [
    `## ${name}: ${result.event} -> ${result.action}`,
    ...result.evidence.map(step => `${step.step}. ${step.kind}: ${step.summary}`),
  ].join("\n"));
  return { systemPrompt: SYSTEM_PROMPT, prompt: sections.join("\n\n") };
}
