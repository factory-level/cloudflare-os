// Pairs a local agent harness with the local Workshop, using the browser as the go-between.
//
// The Workshop's "Connect local agent harness" button makes up a one-time code and shows the
// command that starts this bridge with it. The bridge then listens on a fixed loopback port, and the
// page finds it there by the code and hands over its Workshop session. So a session moves only to a
// process the signed-in human just started with a code the page made up; the page cannot be made to
// talk to anything else, and nothing else can claim the session without the code.
//
// Deliberately narrow: the listener answers only the Workshop origins it is told to trust, accepts a
// session only for a Workshop on this machine, and closes once paired.

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { saveHarnessPairing, type HarnessPairing } from "./credentials.ts";
import { connectSession } from "./workshop.ts";

/** The loopback port the page looks for a waiting bridge on. Must match the frontend's. */
export const DEFAULT_PAIRING_PORT = 47821;

/** Workshop origins a dev Workshop is served from, whose pages may pair. */
export const DEFAULT_TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

const MAX_BODY_BYTES = 16 * 1024;

/** What a pairing listener needs to know. */
export type PairingOptions = {
  code: string;
  /** The connecting harness, e.g. `claude-code`, as the page should name it. */
  harness: () => string;
  port?: number;
  trustedOrigins?: readonly string[];
  /** Validates the handed-over session; defaults to asking the Workshop who it belongs to. */
  verifySession?: (apiUrl: string, sessionToken: string) => Promise<HarnessPairing["identity"]>;
  onPaired?: (pairing: HarnessPairing) => void;
};

/** Starts listening for the page; resolves once listening. */
export async function startPairingListener(options: PairingOptions): Promise<Server> {
  const trusted = new Set(options.trustedOrigins ?? DEFAULT_TRUSTED_ORIGINS);
  const verify = options.verifySession ?? whoamiForSession;
  const expected = createHash("sha256").update(options.code).digest();
  let paired = false;

  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (!origin || !trusted.has(origin)) return reply(res, 403, null, { error: "untrusted origin" });
    if (req.method === "OPTIONS") return reply(res, 204, origin, null);

    const match = /^\/harness\/([^/]+)(\/pair)?$/.exec(new URL(req.url ?? "/", "http://x").pathname);
    if (!match || !codeMatches(expected, decodeURIComponent(match[1]!))) {
      return reply(res, 404, origin, { error: "no harness is waiting with that code" });
    }
    if (req.method === "GET" && !match[2]) {
      return reply(res, 200, origin, { harness: options.harness(), paired });
    }
    if (req.method === "POST" && match[2]) {
      if (paired) return reply(res, 409, origin, { error: "already paired" });
      void handlePair(req, res, origin);
      return;
    }
    reply(res, 405, origin, { error: "method not allowed" });
  });

  const handlePair = async (req: IncomingMessage, res: ServerResponse, origin: string) => {
    try {
      const body = JSON.parse(await readBody(req)) as { apiUrl?: unknown; sessionToken?: unknown };
      if (typeof body.apiUrl !== "string" || typeof body.sessionToken !== "string") {
        return reply(res, 400, origin, { error: "apiUrl and sessionToken are required" });
      }
      if (!isLoopbackApiUrl(body.apiUrl)) {
        return reply(res, 400, origin, { error: "only a Workshop on this machine can be paired" });
      }
      const identity = await verify(body.apiUrl, body.sessionToken);
      const pairing: HarnessPairing = {
        apiUrl: body.apiUrl,
        sessionToken: body.sessionToken,
        identity,
        pairedAt: new Date().toISOString(),
      };
      await saveHarnessPairing(pairing);
      paired = true;
      reply(res, 200, origin, { harness: options.harness(), identity });
      options.onPaired?.(pairing);
      server.close();
    } catch (err) {
      reply(res, 400, origin, { error: err instanceof Error ? err.message : String(err) });
    }
  };

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? DEFAULT_PAIRING_PORT, "127.0.0.1", () => resolveListen());
  });
  return server;
}

/** Whether `apiUrl` is a `ws:`/`wss:` URL on a loopback host. */
export function isLoopbackApiUrl(apiUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return false;
  }
  return (url.protocol === "ws:" || url.protocol === "wss:")
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && url.pathname === "/api";
}

async function whoamiForSession(apiUrl: string, sessionToken: string)
    : Promise<HarnessPairing["identity"]> {
  using api = connectSession(apiUrl);
  using user = api.authenticate(sessionToken);
  const who = await user.whoami();
  return { id: who.id, name: who.name };
}

function codeMatches(expected: Buffer, candidate: string): boolean {
  return timingSafeEqual(expected, createHash("sha256").update(candidate).digest());
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function reply(res: ServerResponse, status: number, origin: string | null, body: unknown): void {
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-private-network", "true");
    res.setHeader("vary", "origin");
  }
  if (body === null) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
