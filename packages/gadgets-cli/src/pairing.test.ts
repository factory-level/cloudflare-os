import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readHarnessPairing } from "./credentials.ts";
import { isLoopbackApiUrl, startPairingListener } from "./pairing.ts";

const ORIGIN = "http://localhost:3000";
// A port per test: fetch keeps sockets alive, and would reuse one to the previous test's server.
let port = 47930;
let base: string;

let server: Server;
let verified: Array<[string, string]>;

beforeEach(async () => {
  port += 1;
  base = `http://127.0.0.1:${port}/harness`;
  process.env.GADGETS_CONFIG_DIR = mkdtempSync(join(tmpdir(), "gadgets-pairing-test-"));
  verified = [];
  server = await startPairingListener({
    code: "CODE123456",
    port,
    harness: () => "claude-code",
    verifySession: async (apiUrl, token) => {
      verified.push([apiUrl, token]);
      if (token === "bad") throw new Error("invalid session");
      return { id: "dev", name: "dev" };
    },
  });
});

afterEach(() => {
  server.closeAllConnections();
  server.close();
});

const pair = (code: string, body: unknown) => fetch(`${base}/${code}/pair`, {
  method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("pairing listener", () => {
  it("refuses origins it was not told to trust", async () => {
    const response = await fetch(`${base}/CODE123456`, { headers: { origin: "https://evil.example" } });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers only for the code it was started with", async () => {
    expect((await fetch(`${base}/WRONG`, { headers: { origin: ORIGIN } })).status).toBe(404);
    const found = await fetch(`${base}/CODE123456`, { headers: { origin: ORIGIN } });
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ harness: "claude-code", paired: false });
  });

  it("accepts a session only for a Workshop on this machine", async () => {
    const response = await pair("CODE123456", { apiUrl: "wss://prod.example.com/api", sessionToken: "t" });
    expect(response.status).toBe(400);
    expect(verified).toEqual([]);
    expect(await readHarnessPairing()).toBeNull();
  });

  it("does not store a session the Workshop rejects", async () => {
    const response = await pair("CODE123456", { apiUrl: "ws://localhost:8787/api", sessionToken: "bad" });
    expect(response.status).toBe(400);
    expect(await readHarnessPairing()).toBeNull();
  });

  it("stores a verified session, then refuses to pair again", async () => {
    const response = await pair("CODE123456", { apiUrl: "ws://localhost:8787/api", sessionToken: "dev:secret" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ harness: "claude-code", identity: { id: "dev", name: "dev" } });
    expect(await readHarnessPairing()).toMatchObject({
      apiUrl: "ws://localhost:8787/api", sessionToken: "dev:secret", identity: { id: "dev" },
    });
    // The listener closes once paired; a request either finds it gone or is refused.
    const again = await pair("CODE123456", { apiUrl: "ws://localhost:8787/api", sessionToken: "x" })
        .then(r => r.status, () => "closed");
    expect([409, "closed"]).toContain(again);
  });
});

describe("isLoopbackApiUrl", () => {
  it.each([
    ["ws://localhost:8787/api", true],
    ["ws://127.0.0.1:8787/api", true],
    ["ws://[::1]:8787/api", true],
    ["wss://gadgets.example.com/api", false],
    ["ws://localhost.evil.example/api", false],
    ["http://localhost:8787/api", false],
    ["ws://localhost:8787/other", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isLoopbackApiUrl(url)).toBe(expected);
  });
});
