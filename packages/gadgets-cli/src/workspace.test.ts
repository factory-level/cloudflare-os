import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callGadget, cleanTried, latestTried, readTried, type TriedWorkspace } from "./workspace.ts";

const disposable = <T extends object>(value: T) => Object.assign(value, { [Symbol.dispose]() {} });

function tried(skill: string, target: string, workspaceId: string): TriedWorkspace {
  return { skill, version: 1, contentSha256: "0".repeat(64), target, workspaceId, gadgetId: 1,
    blueprintId: `bp-${workspaceId}`, createdAt: "2026-10-01T00:00:00.000Z" };
}

/** A stand-in for the authenticated API: workspaces by id, each with one callable gadget. */
function fakeUser(workspaces: Record<string, Record<string, (...args: unknown[]) => unknown>>) {
  const deleted: string[] = [];
  const blueprintsDeleted: string[] = [];
  const user = {
    openGadget: (id: string) => disposable({
      getGadget: () => disposable({
        connectToGadget: () => {
          if (!workspaces[id]) throw new Error("Gadget not found");
          return disposable({ ...workspaces[id] });
        },
      }),
      deleteSelf: async () => {
        if (id === "stuck") throw new Error("Workshop unavailable");
        if (!workspaces[id]) throw new Error("Gadget not found");
        deleted.push(id);
      },
    }),
    deleteOrphanedBlueprint: async (id: string) => { blueprintsDeleted.push(id); },
  };
  return { user: user as never, deleted, blueprintsDeleted };
}

beforeEach(() => {
  process.env.GADGETS_CONFIG_DIR = mkdtempSync(join(tmpdir(), "gadgets-workspace-test-"));
});
afterEach(() => {
  delete process.env.GADGETS_CONFIG_DIR;
});

const remember = (entries: TriedWorkspace[]) =>
  writeFileSync(join(process.env.GADGETS_CONFIG_DIR!, "workspaces.json"), JSON.stringify(entries));

describe("tried workspaces", () => {
  it("finds the latest workspace for a skill in one Workshop only", async () => {
    remember([tried("breakout", "A", "w1"), tried("breakout", "B", "w2"), tried("breakout", "A", "w3")]);
    expect((await latestTried("breakout", "A"))?.workspaceId).toBe("w3");
    expect((await latestTried("breakout", "B"))?.workspaceId).toBe("w2");
    expect(await latestTried("other", "A")).toBeUndefined();
  });

  it("calls a method on the gadget and refuses anything that is not a plain method name", async () => {
    const { user } = fakeUser({ w1: { runFixtures: () => ["ok"], add: (a, b) => (a as number) + (b as number) } });
    expect(await callGadget(user, tried("breakout", "A", "w1"), "runFixtures")).toEqual(["ok"]);
    expect(await callGadget(user, tried("breakout", "A", "w1"), "add", [2, 3])).toBe(5);
    for (const method of ["constructor.prototype", "__proto__", "a b", ""]) {
      await expect(callGadget(user, tried("breakout", "A", "w1"), method)).rejects.toThrow("Not a method name");
    }
  });

  it("removes this Workshop's workspaces and their blueprints, and forgets ones already gone", async () => {
    remember([tried("a", "A", "w1"), tried("b", "A", "gone"), tried("c", "A", "stuck"), tried("d", "B", "w9")]);
    const { user, deleted, blueprintsDeleted } = fakeUser({ w1: {}, stuck: {}, w9: {} });

    const { removed, failed } = await cleanTried(user, "A");

    expect(deleted).toEqual(["w1"]);
    expect(blueprintsDeleted).toEqual(["bp-w1"]);
    expect(removed.map(entry => entry.workspaceId)).toEqual(["w1", "gone"]);
    expect(failed).toEqual(["c (stuck): Workshop unavailable"]);
    // What could not be removed, and the other Workshop's workspace, stay remembered.
    expect((await readTried()).map(entry => entry.workspaceId)).toEqual(["stuck", "w9"]);
  });
});
