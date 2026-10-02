import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, evaluate } from "../files/lib/signal.ts";
import { FIXTURES } from "../files/lib/fixtures.ts";

const golden: Record<string, unknown> =
    JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

describe("momentum signal", () => {
  it.each(FIXTURES)("matches the golden result for $name", ({ name, closesCents }) => {
    expect(evaluate(closesCents, DEFAULT_PARAMS)).toEqual(golden[name]);
  });

  it("covers every fixture in the golden file", () => {
    expect(Object.keys(golden).toSorted()).toEqual(FIXTURES.map(f => f.name).toSorted());
  });

  it("is a pure function of its input", () => {
    const [fixture] = FIXTURES;
    expect(evaluate(fixture!.closesCents, DEFAULT_PARAMS))
        .toEqual(evaluate([...fixture!.closesCents], { ...DEFAULT_PARAMS }));
  });

  it("rejects too-short and fractional series", () => {
    expect(() => evaluate([100, 200], DEFAULT_PARAMS)).toThrow(/at least 8/);
    expect(() => evaluate(Array(8).fill(100.5), DEFAULT_PARAMS)).toThrow(/integer cents/);
  });
});
