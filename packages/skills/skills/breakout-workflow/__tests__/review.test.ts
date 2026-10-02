import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, runWorkflow } from "../files/lib/workflow.ts";
import { FIXTURES } from "../files/lib/fixtures.ts";
import { actionableRuns, reviewPrompt } from "../files/lib/review.ts";

const runs = FIXTURES.map(fixture => ({
  name: fixture.name,
  result: runWorkflow(fixture.bars, fixture.portfolio, fixture.policy, DEFAULT_PARAMS),
}));

describe("scheduled-run review", () => {
  it("only reviews runs that bought, sold or were blocked", () => {
    expect(actionableRuns(runs).map(run => run.name).toSorted())
        .toEqual(["breakdown-sell", "breakout-blocked-at-position-limit", "breakout-buy"]);
  });

  it("skips the model entirely when no run acted", () => {
    expect(reviewPrompt(runs.filter(run => run.result.action === "hold"))).toBeNull();
    expect(reviewPrompt([])).toBeNull();
  });

  it("builds the same prompt from the same runs", () => {
    const prompt = reviewPrompt(runs)!;
    expect(reviewPrompt(runs)).toEqual(prompt);
    expect(prompt.prompt).toContain("## breakout-buy: price.breakout -> buy");
    expect(prompt.prompt).not.toContain("quiet-none");
  });
});
