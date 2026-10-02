// Every read a session returns is recorded on the approval queue first, and an account that has
// been disconnected can read nothing: the lab is told to revoke and this side forgets the
// connection. Deleting either `authorizeObservation` await or the revoke call must fail this file.

import { env, runInDurableObject } from "cloudflare:test";
import { RpcStub, RpcTarget } from "cloudflare:workers";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabApi } from "../../src/lab-api";
import {
  NOT_AVAILABLE, type PendingRun, RevisionCatalogSession, RevisionLineageSession, StudyReaderSession,
  StudyVariantSession,
} from "../../src/lab-session";

type Observation = { title: string; description: string };

class TestApprovalQueue extends RpcTarget {
  readonly observations: Observation[] = [];

  readonly actions: { id: number; description: { title: string; autoApprovable?: boolean; actionKind?: { tag: string } } }[] = [];

  async authorizeObservation(entry: Observation): Promise<void> {
    this.observations.push(entry);
  }

  async submitAction(id: number, description: { title: string; autoApprovable?: boolean; actionKind?: { tag: string } })
      : Promise<void> {
    this.actions.push({ id, description });
  }

}

afterEach(() => vi.unstubAllGlobals());

const acting = { connectionId: "con_0001", onBehalfOf: "alice@example.com" };
const config = { url: "https://lab.test", assertion: "a" };

const revision = {
  kind: "workflow", name: "breakout", number: 1, content_hash: `sha256:${"a".repeat(64)}`,
  pins: [], published_by: "alice@example.com", created_at: "2026-10-02T00:00:00.000Z",
};

function stubLab() {
  const spy = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/revisions") {
      return Response.json({ artifacts: [{ kind: "workflow", name: "breakout", revisions: 1, latest: revision }] });
    }
    if (path === "/revisions/workflow/breakout") {
      return Response.json({ revisions: [{ ...revision, studies: [] }] });
    }
    if (path === "/revisions/workflow/breakout/1") return Response.json({ revision, studies: [] });
    if (path === "/revisions/workflow/breakout/1/files") {
      return Response.json({ files: [{ path: "server.js", text: "export class Gadget {}" }] });
    }
    if (path === "/studies/stu_0001") {
      return Response.json({
        study: {
          id: "stu_0001", name: "ab", number: 1,
          spec: {
            variants: [{ label: "a", revision: { kind: "workflow", name: "breakout", number: 1,
              content_hash: revision.content_hash } }],
            starting_capital: { currency: "USD", amount_minor: 10_000_000 },
            execution_model: "virtual-execution-v1",
          },
        },
      });
    }
    if (path === "/studies/stu_0001/variants/a") {
      return Response.json({ study: {}, label: "a", revision: { kind: "workflow", name: "breakout", number: 1,
        contentHash: revision.content_hash } });
    }
    if (path === "/studies/stu_0001/variants/a/cycle") {
      return Response.json({ cycle: { key: "2026-06-26", symbol: "FIXT", bars: [{ t: 1, closeCents: 5000, volume: 9 }] } });
    }
    if (path === "/studies/stu_0001/variants/a/runs" || path === "/studies/stu_0001/runs") return Response.json({ runs: [] });
    if (path === "/studies/stu_0001/compare") {
      return Response.json({ comparison: { variants: ["a", "b"], sharedCycles: 0, equityChangeCents: [0, 0],
        costMicroUsd: [0, 0], outcome: "insufficient_sample", recordClass: "virtual" } });
    }
    if (path === "/studies/stu_0001/portfolios") {
      return Response.json({ portfolios: [{ label: "a", portfolio: { currency: "USD", cashCents: 1, positions: [], equityCents: 1 } }] });
    }
    if (path === "/connections/con_0001/revoke") return Response.json({ connection: { id: "con_0001" } });
    return Response.json({ code: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sessions() {
  const queue = new TestApprovalQueue();
  const api = new LabApi(config, async () => acting);
  const stub = () => new RpcStub(queue) as unknown as RpcStub<ApprovalQueue>;
  return {
    queue,
    lineage: new RevisionLineageSession(api, stub(), "workflow", "breakout"),
    study: new StudyReaderSession(api, stub(), "stu_0001"),
    catalog: new RevisionCatalogSession(api, stub()),
  };
}

describe("sessions", () => {
  it("record every read as an observation before returning it", async () => {
    stubLab();
    const { queue, lineage, study, catalog } = sessions();
    expect(await catalog.list()).toMatchObject([
      { kind: "workflow", name: "breakout", revisions: 1, latest: { number: 1, contentHash: revision.content_hash } },
    ]);
    expect((await catalog.files("workflow", "breakout", 1)).map((f) => f.path)).toEqual(["server.js"]);
    expect((await lineage.list()).map((r) => r.number)).toEqual([1]);
    expect((await lineage.get(1)).contentHash).toBe(revision.content_hash);
    expect(await lineage.files(1)).toEqual([{ path: "server.js", text: "export class Gadget {}" }]);
    expect((await study.describe()).startingCapital).toEqual({ currency: "USD", amountCents: 10_000_000 });
    expect(queue.observations.map((o) => o.title)).toEqual([
      "List everything published to the lab",
      "Read the files of workflow/breakout@1",
      "List revisions of workflow/breakout",
      "Read workflow/breakout@1",
      "Read the files of workflow/breakout@1",
      "Read study ab #1",
    ]);
  });

  it("record nothing when the lab refuses", async () => {
    stubLab();
    const { queue, lineage } = sessions();
    await expect(lineage.get(9)).rejects.toThrow(/Not found/);
    expect(queue.observations).toEqual([]);
  });

  it("throw for what the lab does not serve yet", async () => {
    stubLab();
    const { lineage } = sessions();
    for (const call of [() => lineage.diff(1), () => lineage.runs(1)]) {
      await expect(call()).rejects.toThrow(NOT_AVAILABLE);
    }
  });

  it("authorize nothing once disposed", async () => {
    stubLab();
    const { queue, lineage } = sessions();
    await lineage.list();
    lineage[Symbol.dispose]();
    // The queue stub is gone, and a read authorizes before returning, so no read can succeed.
    await expect(lineage.list()).rejects.toThrow();
    expect(queue.observations).toHaveLength(1);
  });
});

describe("UserAccount.revoke", () => {
  it("revokes the lab connection and then refuses every read", async () => {
    const spy = stubLab();
    await runInDurableObject(env.USER_ACCOUNT.getByName("revoked"), async (account, state) => {
      state.storage.kv.put("connection", acting);
      expect(await account.getActing()).toEqual(acting);
      await account.revoke();
      expect(spy.mock.calls.map(([url]) => url)).toEqual(["https://lab.test/connections/con_0001/revoke"]);
      await expect(account.getActing()).rejects.toThrow(/disconnected/);
    });
  });

  it("forgets the connection even when the lab cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await runInDurableObject(env.USER_ACCOUNT.getByName("offline"), async (account, state) => {
      state.storage.kv.put("connection", acting);
      await account.revoke();
      await expect(account.getActing()).rejects.toThrow(/disconnected/);
    });
  });
});

describe("StudyVariantSession", () => {
  function variant() {
    const queue = new TestApprovalQueue();
    const pending: PendingRun[] = [];
    const session = new StudyVariantSession(
      new LabApi(config, async () => acting),
      new RpcStub(queue) as unknown as RpcStub<ApprovalQueue>,
      "stu_0001", "a",
      { list: () => pending, add: (report) => { pending.push({ actionId: pending.length + 1, report, submittedAt: "t" }); return pending.length; } },
    );
    return { queue, pending, session };
  }
  const report = {
    cycleKey: "2026-06-26", agent: "momentum", outcome: "decided" as const, decision: "buy 10",
    orderIntent: { symbol: "FIXT", side: "buy" as const, quantity: 10 }, evidence: [],
  };

  it("queues a run as one auto-approvable action and holds the next cycle until it is recorded", async () => {
    stubLab();
    const { queue, session } = variant();
    expect((await session.nextCycle())?.key).toBe("2026-06-26");
    const run = await session.recordRun(report);
    expect(run).toMatchObject({ id: "pending:1", cycleKey: "2026-06-26", fill: null });
    expect((await session.recordRun(report)).id).toBe("pending:1");
    expect(queue.actions).toHaveLength(1);
    expect(queue.actions[0]?.description).toMatchObject({ autoApprovable: true, actionKind: { tag: "lab.record_run" } });
    expect(await session.nextCycle()).toBeNull();
    expect((await session.runs()).map((r) => r.id)).toEqual(["pending:1"]);
  });

  it("study reads now come from the lab", async () => {
    stubLab();
    const { study, queue } = sessions();
    expect(await study.portfolios()).toHaveLength(1);
    expect(await study.runs()).toEqual([]);
    expect((await study.compare("a", "b")).outcome).toBe("insufficient_sample");
    expect(queue.observations.map((o) => o.title)).toEqual([
      "Read the portfolios of study stu_0001",
      "Read runs of study stu_0001",
      "Compare a and b in study stu_0001",
    ]);
  });
});
