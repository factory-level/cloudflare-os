import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAccessEdge, type AccessEdge, type AccessPolicy } from "./accessEdge.ts";

// Ports per test: fetch keeps sockets alive, and would reuse one to the previous test's server.
let nextPort = 47940;

let upstream: Server;
let edge: AccessEdge;
let seen: IncomingHttpHeaders[];
let policy: AccessPolicy;

beforeEach(async () => {
  const [EDGE_PORT, UPSTREAM_PORT] = [nextPort += 2, nextPort + 1];
  seen = [];
  policy = { allow: ["alice@demo.local"] };
  upstream = createServer((req, res) => {
    seen.push(req.headers);
    res.end("ok");
  });
  await new Promise<void>(resolve => upstream.listen(UPSTREAM_PORT, "127.0.0.1", resolve));
  edge = await startAccessEdge({
    port: EDGE_PORT, upstream: `http://127.0.0.1:${UPSTREAM_PORT}`, audience: "test-aud",
    policy: () => policy,
  });
});

afterEach(() => {
  edge.server.closeAllConnections();
  edge.server.close();
  upstream.closeAllConnections();
  upstream.close();
});

const call = (headers: Record<string, string>) => fetch(`${edge.origin}/api`, { headers });

describe("mock Access edge", () => {
  it("refuses requests without a token", async () => {
    expect((await call({})).status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("replaces any client-supplied assertion with the token it verified", async () => {
    const token = edge.issueToken("alice@demo.local");
    const response = await call({ "cf-access-token": token, "cf-access-jwt-assertion": "forged" });
    expect(response.status).toBe(200);
    expect(seen[0]?.["cf-access-jwt-assertion"]).toBe(token);
    expect(seen[0]?.["cf-access-token"]).toBeUndefined();
  });

  it("accepts the browser cookie and does not forward it", async () => {
    const token = edge.issueToken("alice@demo.local");
    await call({ cookie: `theme=dark; CF_Authorization=${token}` });
    expect(seen[0]?.["cf-access-jwt-assertion"]).toBe(token);
    expect(seen[0]?.cookie).toBe("theme=dark");
  });

  it("revokes a previously issued token when the policy drops its identity", async () => {
    const token = edge.issueToken("alice@demo.local");
    policy = { allow: [] };
    expect((await call({ "cf-access-token": token })).status).toBe(403);
  });

  it("refuses tampered tokens", async () => {
    const [header, , signature] = edge.issueToken("alice@demo.local").split(".");
    const claims = Buffer.from(JSON.stringify({ email: "alice@demo.local", iss: edge.origin,
      aud: ["test-aud"], exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    expect((await call({ "cf-access-token": `${header}.${claims}.${signature}` })).status).toBe(403);
  });

  it("issues tokens only to identities the policy allows", async () => {
    const issue = (email: string) => fetch(`${edge.origin}/cdn-cgi/gadgets-mock/token`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
    });
    expect((await issue("alice@demo.local")).status).toBe(200);
    expect((await issue("mallory@demo.local")).status).toBe(403);
  });

  it("publishes the signing key where the Workshop looks for it", async () => {
    const response = await fetch(`${edge.origin}/cdn-cgi/access/certs`);
    const { keys } = await response.json() as { keys: Array<{ kty: string; alg: string }> };
    expect(keys).toEqual([expect.objectContaining({ kty: "RSA", alg: "RS256" })]);
  });
});
