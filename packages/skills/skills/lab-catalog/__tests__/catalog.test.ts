import { describe, expect, it } from "vitest";
import { type CatalogEntry, formatTime, groupByKind, shortHash } from "../files/lib/catalog.ts";

const entry = (kind: CatalogEntry["kind"], name: string): CatalogEntry => ({
  kind, name, revisions: 1,
  latest: { number: 1, contentHash: `sha256:${"ab".repeat(32)}`, publishedBy: "a@example.com",
    publishedAt: "2026-10-02T09:30:00.000Z" },
});

describe("groupByKind", () => {
  it("puts workflows first, sorts names, and drops empty kinds", () => {
    const groups = groupByKind([entry("skill", "b"), entry("workflow", "z"), entry("workflow", "a-b"), entry("skill", "a")]);
    expect(groups.map((g) => [g.title, g.entries.map((e) => e.name)])).toEqual([
      ["Workflows", ["a-b", "z"]],
      ["Skills", ["a", "b"]],
    ]);
    expect(groupByKind([])).toEqual([]);
  });
});

describe("display helpers", () => {
  it("shorten hashes and format times", () => {
    expect(shortHash(`sha256:${"ab".repeat(32)}`)).toBe("abababababab");
    expect(formatTime("2026-10-02T09:30:00.000Z")).toBe("2026-10-02 09:30 UTC");
    expect(formatTime("not a date")).toBe("not a date");
  });
});
