import { describe, expect, it } from "vitest";
import { FIXTURES } from "../files/lib/fixtures.ts";
import { recordOccurrence, REVIEW_INTERRUPTED, type OccurrenceStorage, type ScheduledRunRecord } from "../files/lib/occurrence.ts";
import { actionableRuns, type NamedRun } from "../files/lib/review.ts";
import { DEFAULT_PARAMS, runWorkflow } from "../files/lib/workflow.ts";

const runs: NamedRun[] = FIXTURES.map(f => ({ name: f.name, result: runWorkflow(f.bars, f.portfolio, f.policy, DEFAULT_PARAMS) }));
const held: NamedRun[] = runs.filter(run => run.result.action === "hold");
const firing = { scheduleId: "s1", runId: "r1", scheduledTime: 1_700_000_000_000, actualTime: 1_700_000_000_500, timeZone: "UTC" };

/** In-memory storage whose `put` can be made to fail on its nth call. */
function storage(failOnPut?: number) {
  const data = new Map<string, unknown>();
  let puts = 0;
  const api: OccurrenceStorage = {
    get: async key => data.get(key),
    put: async entries => {
      puts++;
      if (puts === failOnPut) throw new Error("storage unavailable");
      for (const [key, value] of Object.entries(entries)) data.set(key, value);
    },
  };
  const records = () => [...data.entries()].filter(([key]) => key.startsWith("run:")).map(([, value]) => value as ScheduledRunRecord);
  return { api, records };
}

describe("recordOccurrence", () => {
  it("has runs that act, so the review path is exercised", () => {
    expect(actionableRuns(runs).length).toBeGreaterThan(0);
    expect(held.length).toBeGreaterThan(0);
  });

  it("records the runs and the review once", async () => {
    const store = storage();
    let calls = 0;
    await recordOccurrence(store.api, firing, runs, async () => { calls++; return "Looks right."; });
    await recordOccurrence(store.api, firing, runs, async () => { calls++; return "Again."; });
    expect(calls).toBe(1);
    expect(store.records()).toEqual([expect.objectContaining({ runId: "r1", review: "Looks right." })]);
    expect(store.records()[0]).not.toHaveProperty("reviewError");
  });

  it("does not call the model again when the write after the review failed", async () => {
    const store = storage(2);
    let calls = 0;
    const review = async () => { calls++; return "Looks right."; };
    await expect(recordOccurrence(store.api, firing, runs, review)).rejects.toThrow("storage unavailable");
    await recordOccurrence(store.api, firing, runs, review);
    expect(calls).toBe(1);
    expect(store.records()).toEqual([expect.objectContaining({ review: null, reviewError: REVIEW_INTERRUPTED })]);
  });

  it("calls no model before the occurrence is claimed", async () => {
    const store = storage(1);
    let calls = 0;
    await expect(recordOccurrence(store.api, firing, runs, async () => { calls++; return ""; }))
        .rejects.toThrow("storage unavailable");
    expect(calls).toBe(0);
    expect(store.records()).toEqual([]);
  });

  it("keeps the deterministic runs when the review fails", async () => {
    const store = storage();
    await recordOccurrence(store.api, firing, runs, async () => { throw new Error("model down"); });
    expect(store.records()).toEqual([expect.objectContaining({ runs, review: null, reviewError: "model down" })]);
  });

  it("skips the model when nothing acted or none is bound", async () => {
    const store = storage();
    let calls = 0;
    await recordOccurrence(store.api, firing, held, async () => { calls++; return ""; });
    await recordOccurrence(store.api, { ...firing, runId: "r2" }, runs, undefined);
    expect(calls).toBe(0);
    for (const record of store.records()) {
      expect(record.review).toBeNull();
      expect(record).not.toHaveProperty("reviewError");
    }
  });
});
