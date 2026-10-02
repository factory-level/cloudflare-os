import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness } from "../files/lib/harness.ts";

const golden: Record<string, unknown> =
    JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

describe("replay harness", () => {
  it.each(harness.scenarios)("pins $name to the golden result", ({ name, input }) => {
    expect(harness.run(input).result).toEqual(golden[name]);
  });

  it("replays bars through the same rule", () => {
    const { input } = harness.scenarios.find(s => s.name === "uptrend")!;
    const session = harness.session(input.closesCents.map(closeCents => ({ closeCents })));
    expect(session.outcome).toEqual(harness.run(input));
    expect(session.outcome.decision).toBe("buy");
  });
});
