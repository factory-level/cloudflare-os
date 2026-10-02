import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseBarsCsv } from "./bars.ts";
import { devCycle } from "./dev.ts";
import { renderComparison, renderExplain, renderReplay } from "./format.ts";
import { checkGolden, updateGolden } from "./golden.ts";
import { compareSkills, replaySkill, stable } from "./replay.ts";
import { newSkill } from "./scaffold.ts";
import { skillsDir } from "./skills.ts";

const real = skillsDir();
const breakout = join(real, "breakout-workflow");
let skills: string;

beforeEach(() => {
  skills = mkdtempSync(join(tmpdir(), "gadgets-replay-test-"));
  cpSync(breakout, join(skills, "breakout-workflow"), { recursive: true });
  process.env.GADGETS_SKILLS_DIR = skills;
});
afterEach(() => {
  delete process.env.GADGETS_SKILLS_DIR;
});

/** Rewrites one expression in the copied workflow's decision logic. */
function edit(directory: string, from: string, to: string): void {
  const path = join(directory, "files", "lib", "workflow.ts");
  const source = readFileSync(path, "utf8");
  expect(source).toContain(from);
  writeFileSync(path, source.replace(from, to));
}

const CSV = ["date,close,volume", "2026-09-01,100.00,1000", "2026-09-02,100.20,1000", "2026-09-03,99.90,1000",
  "2026-09-04,100.10,1000", "2026-09-05,100.30,1000", "2026-09-06,101.50,1200", "2026-09-07,98.00,1500"].join("\n");

describe("replaySkill", () => {
  it("runs the built-in scenarios with their evidence chains", async () => {
    const entries = await replaySkill(breakout);
    expect(entries.map(entry => entry.name)).toEqual(
        ["breakout-buy", "breakdown-sell", "volume-anomaly-hold", "breakout-blocked-at-position-limit", "quiet-none"]);
    expect(entries[0]).toMatchObject({ decision: "price.breakout -> buy" });
    expect(renderExplain(entries.slice(0, 1))).toContain("3. assertions:");
    expect((await replaySkill(breakout, { scenario: "quiet-none" })).map(e => e.name)).toEqual(["quiet-none"]);
    await expect(replaySkill(breakout, { scenario: "nope" })).rejects.toThrow("No scenario named nope");
  });

  it("replays supplied bars, and walks them one session at a time carrying the portfolio", async () => {
    const bars = parseBarsCsv(CSV);
    expect(await replaySkill(breakout, { bars: bars.slice(0, 6) })).toEqual(
        [expect.objectContaining({ name: "bars", decision: "price.breakout -> buy" })]);

    const walk = await replaySkill(breakout, { bars, walk: true });
    expect(walk).toHaveLength(7);
    // Too few bars for the lookback is reported per session, not thrown.
    expect(walk[0]).toHaveProperty("error");
    expect(walk[5]).toMatchObject({ decision: "price.breakout -> buy" });
    // The seventh session sells the position the sixth bought: state was carried.
    expect(walk[6]).toMatchObject({ decision: "price.breakdown -> sell" });
  });

  it("reports a skill without a harness", async () => {
    const bare = join(skills, "bare");
    cpSync(breakout, bare, { recursive: true });
    writeFileSync(join(bare, "files", "lib", "harness.ts"), "export const nothing = 1;\n");
    await expect(replaySkill(bare)).rejects.toThrow("must export `harness`");
  });
});

describe("parseBarsCsv", () => {
  it("converts prices to cents exactly and dates to UTC seconds", () => {
    expect(parseBarsCsv("date,close,volume\n2026-09-01,100.07,10\n2026-09-02,0.1,20")).toEqual([
      { t: 1788220800, closeCents: 10007, volume: 10 },
      { t: 1788307200, closeCents: 10, volume: 20 },
    ]);
    expect(parseBarsCsv("t,closeCents,volume\n5,10150,7")).toEqual([{ t: 5, closeCents: 10150, volume: 7 }]);
  });

  it("refuses what it cannot read exactly", () => {
    expect(() => parseBarsCsv("date,close\n2026-09-01,1")).toThrow("needs a header");
    expect(() => parseBarsCsv("date,close,volume\n2026-09-01,1.005,1")).toThrow("at most two decimals");
    expect(() => parseBarsCsv("date,close,volume\n2026-09-01 09:30,1,1")).toThrow("with a zone");
    expect(() => parseBarsCsv("t,close,volume\n2,1,1\n1,1,1")).toThrow("not after the row before");
    expect(() => parseBarsCsv("t,close,volume\n")).toThrow("no rows");
  });
});

describe("compareSkills", () => {
  it("feeds both skills the same inputs and marks where their results differ", async () => {
    const variant = await newSkill("breakout-strict", "breakout-workflow");
    expect((await compareSkills(breakout, variant)).every(row => row.same)).toBe(true);

    edit(variant, "policy.maxPositionQty - portfolio.positionQty", "Math.min(10, policy.maxPositionQty - portfolio.positionQty)");
    const rows = await compareSkills(join(skills, "breakout-workflow"), variant);
    const buy = rows.find(row => row.name === "breakout-buy")!;
    expect(buy).toMatchObject({ a: "price.breakout -> buy", b: "price.breakout -> buy", same: false,
      difference: "fill.quantity: 49 vs 10" });
    expect(rows.find(row => row.name === "quiet-none")!.same).toBe(true);
    const text = renderComparison(rows, "breakout-workflow", "breakout-strict");
    expect(text).toContain("! breakout-buy");
    expect(text).toContain("this is not a ranking");
  });
});

describe("golden", () => {
  it("matches an unchanged skill and leaves its file byte-identical on update", async () => {
    const directory = join(skills, "breakout-workflow");
    const before = readFileSync(join(directory, "__tests__", "golden.json"));
    expect(await checkGolden(directory)).toEqual({ changed: [], added: [], removed: [], matches: true });
    await updateGolden(directory);
    expect(Buffer.compare(readFileSync(join(directory, "__tests__", "golden.json")), before)).toBe(0);
  });

  it("names the scenarios a change affects, and accepts them only on update", async () => {
    const directory = join(skills, "breakout-workflow");
    edit(directory, "policy.maxPositionQty - portfolio.positionQty", "Math.min(10, policy.maxPositionQty - portfolio.positionQty)");
    const diff = await checkGolden(directory);
    expect(diff.matches).toBe(false);
    expect(diff.changed).toContain("breakout-buy");
    expect(diff.changed).not.toContain("quiet-none");
    expect(await updateGolden(directory)).toEqual(diff);
    expect((await checkGolden(directory)).matches).toBe(true);
  });
});

describe("devCycle", () => {
  it("reports which decisions a save changed, and that they left the golden file", async () => {
    const directory = join(skills, "breakout-workflow");
    const first = await devCycle(directory, undefined, undefined, null);
    expect(first).toMatchObject({ changed: [], offGolden: [] });

    edit(directory, "policy.maxPositionQty - portfolio.positionQty", "Math.min(10, policy.maxPositionQty - portfolio.positionQty)");
    const second = await devCycle(directory, first.entries, first.entries, null);
    expect(second.changed).toContain("breakout-buy");
    expect(second.offGolden).toContain("breakout-buy");
    expect(second.report).toMatch(/~\* breakout-buy/);
    expect(second.report).toContain("gadgets golden breakout-workflow --update");

    const third = await devCycle(directory, second.entries, first.entries, null);
    expect(third.changed).toEqual([]);
    expect(third.report).toMatch(/ \* breakout-buy/);
  });

  it("names failing tests instead of dumping their output", async () => {
    const directory = join(skills, "breakout-workflow");
    const output = [" ✓ a/__tests__/x.test.ts > ok 1ms", " × a/__tests__/x.test.ts > pins 'breakout-buy' 13ms",
      "   → expected {} to deeply equal {}", "- Expected", "+ Received"].join("\n");
    const cycle = await devCycle(directory, undefined, undefined, async () => ({ passed: false, output }));
    expect(cycle.report).toContain("Tests FAILED (1). Full output: gadgets skill test breakout-workflow");
    expect(cycle.report).toContain("  × a/__tests__/x.test.ts > pins 'breakout-buy'");
    expect(cycle.report).not.toContain("- Expected");
  });

  it("survives a save that does not parse, keeping the last good replay", async () => {
    const directory = join(skills, "breakout-workflow");
    const first = await devCycle(directory, undefined, undefined, null);
    writeFileSync(join(directory, "files", "lib", "workflow.ts"), "export const broken = ;\n");
    const broken = await devCycle(directory, first.entries, first.entries, null);
    expect(broken.replayError).toBeTruthy();
    expect(broken.entries).toBe(first.entries);
  });
});

describe("newSkill", () => {
  it("copies a working skill under a new name at version 1, and refuses to overwrite", async () => {
    const directory = await newSkill("gap-fade", "breakout-workflow", new Date("2026-10-01T15:00:00Z"));
    const manifest = JSON.parse(readFileSync(join(directory, "blueprint.json"), "utf8"));
    expect(manifest).toMatchObject({ blueprintId: "skill.gap-fade", title: "Gap Fade", version: 1,
      created: "2026-10-01T00:00:00.000Z" });
    expect(renderReplay(await replaySkill(directory))).toContain("breakout-buy");
    await expect(newSkill("gap-fade", "breakout-workflow")).rejects.toThrow("already exists");
    await expect(newSkill("Gap Fade", "breakout-workflow")).rejects.toThrow("Not a skill name");
  });
});

it("stable JSON ignores key order", () => {
  expect(stable({ b: [1, { d: 1, c: 2 }], a: "x" })).toBe(stable({ a: "x", b: [1, { c: 2, d: 1 }] }));
});
