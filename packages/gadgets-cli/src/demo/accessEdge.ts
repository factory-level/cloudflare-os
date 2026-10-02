// A stand-in for the Cloudflare Access edge in front of a production Workshop, for the fully local
// demo. It implements the part of Access's contract the Workshop relies on, and no more:
//
// - It publishes its signing keys at `/cdn-cgi/access/certs`, which is where the Workshop's
//   `CF_ACCESS_ISS` points the backend's verifier.
// - Every request must carry a token it issued, as the `CF_Authorization` cookie (browsers) or the
//   `cf-access-token` header (the CLI), for an identity its policy allows *now* -- the policy file
//   is re-read per request, so removing someone revokes them immediately.
// - It forwards the request with the token as `cf-access-jwt-assertion`, having discarded whatever
//   assertion the client sent, so the backend only ever sees assertions the edge made.
//
// What it does not do is authenticate anyone: the "identity provider" is a picker that issues a
// token for any allowed email on request. That is the one thing real Access adds, and why this is
// a demo tool that only listens on loopback.

import { generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { MOCK_EDGE_INFO_PATH, MOCK_EDGE_TOKEN_PATH } from "../login.ts";

/** Who may reach the Workshop: the IAM policy. */
export type AccessPolicy = { allow: string[] };

/** How to run the edge. */
export type AccessEdgeOptions = {
  port: number;
  /** The Workshop the edge fronts, e.g. `http://127.0.0.1:8791`. */
  upstream: string;
  /** The application audience (`CF_ACCESS_AUD`) tokens are issued for. */
  audience: string;
  /** Reads the current policy; called on every request. */
  policy: () => AccessPolicy;
  tokenLifetimeSeconds?: number;
};

/** A running edge. */
export type AccessEdge = { server: Server; origin: string; issueToken: (email: string) => string };

const COOKIE = "CF_Authorization";
const STRIPPED_HEADERS = new Set(["cf-access-jwt-assertion", "cf-access-token", "cf-access-authenticated-user-email"]);

/** Reads a policy file each time it is called, so edits take effect on the next request. */
export function policyFromFile(path: string): () => AccessPolicy {
  return () => {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AccessPolicy>;
    return { allow: (parsed.allow ?? []).map(email => email.toLowerCase()) };
  };
}

/** Starts the edge on loopback. */
export async function startAccessEdge(options: AccessEdgeOptions): Promise<AccessEdge> {
  const origin = `http://127.0.0.1:${options.port}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const upstream = new URL(options.upstream);
  const lifetime = options.tokenLifetimeSeconds ?? 3600;

  const allowed = (email: string) => options.policy().allow.includes(email.toLowerCase());

  const issueToken = (email: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return signJwt(privateKey, kid, {
      iss: origin, aud: [options.audience], sub: `mock-${email.toLowerCase()}`,
      email: email.toLowerCase(), iat: now, nbf: now, exp: now + lifetime, type: "app",
    });
  };

  // The email of a request's valid, currently allowed token, or the reason there is none.
  const authorize = (req: IncomingMessage): { email: string; token: string } | { denied: string } => {
    const token = headerValue(req, "cf-access-token") ?? cookieValue(req, COOKIE);
    if (!token) return { denied: "no Access token" };
    const claims = verifyJwt(publicKey, token);
    if (!claims) return { denied: "invalid Access token" };
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== origin || !audience.includes(options.audience)
        || typeof claims.exp !== "number" || claims.exp <= now) {
      return { denied: "expired or misdirected Access token" };
    }
    if (typeof claims.email !== "string" || !allowed(claims.email)) {
      return { denied: `${String(claims.email)} is not allowed by the Access policy` };
    }
    return { email: claims.email, token };
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", origin);

    if (url.pathname === "/cdn-cgi/access/certs") {
      const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
      return json(res, 200, { keys: [jwk] });
    }
    if (url.pathname === MOCK_EDGE_INFO_PATH) {
      return json(res, 200, { mock: true, audience: options.audience, allow: options.policy().allow });
    }
    if (url.pathname === MOCK_EDGE_TOKEN_PATH && req.method === "POST") {
      void readJson(req).then(body => {
        const email = typeof body.email === "string" ? body.email : "";
        if (!allowed(email)) return json(res, 403, { error: `${email || "(none)"} is not allowed by the Access policy` });
        json(res, 200, { token: issueToken(email) });
      }, () => json(res, 400, { error: "expected a JSON body" }));
      return;
    }
    if (url.pathname === "/cdn-cgi/access/login") {
      const email = url.searchParams.get("email");
      if (!email) return html(res, 200, loginPage(options.policy().allow, url.searchParams.get("redirect")));
      if (!allowed(email)) return html(res, 403, `<p>${escapeHtml(email)} is not allowed by the Access policy.</p>`);
      res.writeHead(302, {
        "set-cookie": `${COOKIE}=${issueToken(email)}; Path=/; HttpOnly; SameSite=Lax`,
        "location": safeRedirect(url.searchParams.get("redirect")),
      }).end();
      return;
    }
    if (url.pathname === "/cdn-cgi/access/logout") {
      res.writeHead(302, {
        "set-cookie": `${COOKIE}=; Path=/; Max-Age=0`,
        "location": "/cdn-cgi/access/login",
      }).end();
      return;
    }

    const auth = authorize(req);
    if ("denied" in auth) {
      // A browser navigating gets the login page, as with Access; anything else gets the refusal.
      if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
        res.writeHead(302, { location: `/cdn-cgi/access/login?redirect=${encodeURIComponent(url.pathname)}` }).end();
        return;
      }
      res.writeHead(403, { "content-type": "text/plain" }).end(`Forbidden by Access: ${auth.denied}`);
      return;
    }

    const proxied = httpRequest({
      host: upstream.hostname, port: upstream.port, method: req.method, path: req.url,
      headers: forwardedHeaders(req, auth.token),
    }, upstreamRes => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    proxied.on("error", err => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end(`Upstream error: ${err.message}`);
    });
    req.pipe(proxied);
  });

  // WebSocket upgrades (the Workshop's `/api`) get the same check, then a raw byte pipe.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const auth = authorize(req);
    if ("denied" in auth) {
      socket.end(`HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\nForbidden by Access: ${auth.denied}`);
      return;
    }
    const upstreamSocket = connect(Number(upstream.port), upstream.hostname, () => {
      const headers = forwardedHeaders(req, auth.token);
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(headers)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) lines.push(`${name}: ${item}`);
        }
      }
      upstreamSocket.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.byteLength > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    const close = () => { upstreamSocket.destroy(); socket.destroy(); };
    upstreamSocket.on("error", close);
    socket.on("error", close);
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolveListen());
  });
  return { server, origin, issueToken };
}

// The client's own headers minus any Access material, plus the edge's assertion. The cookie is
// dropped from forwarding only as far as the Access token goes; other cookies pass through.
function forwardedHeaders(req: IncomingMessage, token: string): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (STRIPPED_HEADERS.has(name)) continue;
    if (name === "cookie") {
      const kept = String(value).split(";").map(part => part.trim())
          .filter(part => part && !part.startsWith(`${COOKIE}=`));
      if (kept.length > 0) headers.cookie = kept.join("; ");
      continue;
    }
    headers[name] = value;
  }
  headers["cf-access-jwt-assertion"] = token;
  return headers;
}

function signJwt(key: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const signingInput = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode(claims)}`;
  const signature = Buffer.from(sign("sha256", Buffer.from(signingInput), key));
  return `${signingInput}.${signature.toString("base64url")}`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function verifyJwt(key: KeyObject, token: string): Record<string, unknown> | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  try {
    const ok = verify("sha256", Buffer.from(`${header}.${payload}`), key,
        Buffer.from(signature, "base64url"));
    return ok ? JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) : null;
  } catch {
    return null;
  }
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function html(res: import("node:http").ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" })
      .end(`<!doctype html><meta charset="utf-8"><title>Mock Access</title><body style="font: 15px system-ui; margin: 40px">${body}</body>`);
}

// Only same-origin paths, so the login page cannot be used to bounce a browser elsewhere.
function safeRedirect(redirect: string | null): string {
  return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
}

function loginPage(allow: string[], redirect: string | null): string {
  const links = allow.map(email =>
    `<li><a href="/cdn-cgi/access/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(safeRedirect(redirect))}">${escapeHtml(email)}</a></li>`);
  return `<h1>Mock Cloudflare Access</h1><p>Demo identity provider. Sign in as one of the identities the policy allows:</p><ul>${links.join("")}</ul>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}
