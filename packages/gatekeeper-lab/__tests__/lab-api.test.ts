import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, LabApi, LabError, readLabConfig, revoke } from "../src/lab-api";

const acting = { connectionId: "con_0001", onBehalfOf: "alice@example.com" };

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("readLabConfig", () => {
  it("needs a lab URL and a way to sign in", () => {
    expect(readLabConfig({})).toBeNull();
    expect(readLabConfig({ LAB_URL: "https://lab.test" })).toBeNull();
    expect(readLabConfig({ LAB_URL: "ftp://lab.test", LAB_ASSERTION: "a" })).toBeNull();
    expect(readLabConfig({ LAB_URL: "not a url", LAB_ASSERTION: "a" })).toBeNull();
    expect(readLabConfig({ LAB_URL: "https://lab.test/", LAB_CLIENT_ID: "id" })).toBeNull();
    expect(readLabConfig({ LAB_URL: "https://lab.test/api/", LAB_CLIENT_ID: "id", LAB_CLIENT_SECRET: "s" }))
      .toEqual({ url: "https://lab.test/api", clientId: "id", clientSecret: "s", assertion: undefined });
  });
});

describe("requests", () => {
  it("sign in with the service token and name the connection and person", async () => {
    const spy = stubFetch(200, { files: [{ path: "server.js", text: "x" }] });
    const api = new LabApi(
      { url: "https://lab.test", clientId: "id", clientSecret: "secret" }, async () => acting);
    expect(await api.revisionFiles("workflow", "breakout", 2)).toEqual([{ path: "server.js", text: "x" }]);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://lab.test/revisions/workflow/breakout/2/files");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({
      "cf-access-client-id": "id",
      "cf-access-client-secret": "secret",
      "x-lab-connection": "con_0001",
      "x-lab-on-behalf-of": "alice@example.com",
    });
    expect(init.headers).not.toHaveProperty("cf-access-jwt-assertion");
  });

  it("send a pre-minted assertion when there is no service token", async () => {
    const spy = stubFetch(201, { connection: { id: "con_0007" } });
    expect(await connect({ url: "https://lab.test", assertion: "jwt" }, "alice@example.com")).toBe("con_0007");
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://lab.test/connections");
    expect(init.headers).toMatchObject({ "cf-access-jwt-assertion": "jwt" });
    expect(JSON.parse(String(init.body))).toEqual({ on_behalf_of: "alice@example.com" });
  });

  it("escape path segments", async () => {
    const spy = stubFetch(200, { revisions: [] });
    await new LabApi({ url: "https://lab.test", assertion: "a" }, async () => acting)
      .listRevisions("workflow", "../studies");
    expect(spy.mock.calls[0]![0]).toBe("https://lab.test/revisions/workflow/..%2Fstudies");
  });

  it("revoke the named connection", async () => {
    const spy = stubFetch(200, { connection: { id: "con_0001" } });
    await revoke({ url: "https://lab.test", assertion: "a" }, acting);
    expect(spy.mock.calls[0]![0]).toBe("https://lab.test/connections/con_0001/revoke");
    expect(spy.mock.calls[0]![1].method).toBe("POST");
  });
});

describe("errors", () => {
  const api = () => new LabApi({ url: "https://lab.test", assertion: "a" }, async () => acting);

  it("keep the lab's code and say what happened", async () => {
    stubFetch(403, { code: "connection_revoked" });
    const error = await api().getStudy("stu_0001").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LabError);
    expect(error).toMatchObject({ status: 403, code: "connection_revoked" });
    expect((error as Error).message).toMatch(/disconnected/);
  });

  it("treat an Access redirect as a refused sign-in", async () => {
    stubFetch(302, undefined);
    await expect(api().getStudy("stu_0001")).rejects.toMatchObject({ code: "not_signed_in" });
  });

  it("report an unreachable lab without its address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connect ECONNREFUSED 10.0.0.1"); }));
    const error = await api().getStudy("stu_0001").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "unreachable" });
    expect((error as Error).message).not.toMatch(/10\.0\.0\.1/);
  });
});

describe("mapping", () => {
  it("turns lab records into the agent-facing shapes", async () => {
    stubFetch(200, {
      revision: {
        kind: "workflow", name: "breakout", number: 2, content_hash: "sha256:aa",
        pins: [{ kind: "skill", name: "momentum", number: 1, content_hash: "sha256:bb" }],
        published_by: "alice@example.com", created_at: "2026-10-02T00:00:00.000Z",
      },
      studies: [{ study_id: "stu_0001", label: "b" }],
    });
    expect(await api().getRevision("workflow", "breakout", 2)).toEqual({
      kind: "workflow", name: "breakout", number: 2, contentHash: "sha256:aa",
      pins: [{ kind: "skill", name: "momentum", number: 1, contentHash: "sha256:bb" }],
      publishedBy: "alice@example.com", publishedAt: "2026-10-02T00:00:00.000Z",
      studies: [{ studyId: "stu_0001", label: "b" }],
    });
  });

  function api() {
    return new LabApi({ url: "https://lab.test", assertion: "a" }, async () => acting);
  }
});
