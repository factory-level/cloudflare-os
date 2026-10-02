// Cap'n Web sessions to a Workshop's `/api`, from Node.
//
// Two ways in, matching the Workshop's two authentication modes:
//
// - Access mode (every production deployment): the request carries a Cloudflare Access token in
//   `cf-access-token`, which the Access edge exchanges for the signed `cf-access-jwt-assertion` the
//   backend verifies, and an `Origin` equal to the Workshop's own, which the backend requires of
//   every Access-mode `/api` request. The identity is the token's email claim; nothing else is sent.
// - Session mode (a local dev Workshop): an existing `<user>:<secret>` session token, passed in-band
//   to `authenticate()` the way the browser does.

import { newWebSocketRpcSession, type RpcPromise, type RpcStub } from "capnweb";
import type { AuthenticatedApi, PublicApi } from "@gadgets/workshop-shared/api";
import { archiveContentSha256, type PackedSkill } from "./pack.ts";

/** WebSocket URL of the `/api` endpoint at `origin`. */
export function apiUrlFor(origin: string): string {
  const url = new URL("/api", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Opens a session to the Workshop at `origin` carrying `accessToken`. Asks first over plain HTTP,
 * so a request the Access edge or the backend refuses fails with its reason rather than as an
 * anonymous WebSocket close.
 */
export async function connectWithAccess(origin: string, accessToken: string)
    : Promise<RpcStub<PublicApi>> {
  const headers = { "Origin": new URL(origin).origin, "cf-access-token": accessToken };
  // Never follow a redirect: it would carry the Access token to wherever the edge points, which
  // for an expired or missing session is its sign-in page on another origin.
  const probe = await fetch(new URL("/api", origin),
      { method: "POST", headers, body: "", redirect: "manual" });
  if (probe.status >= 300 && probe.status < 400) {
    throw new AccessDeniedError(origin, probe.status, "redirected to sign-in; run `gadgets login` again");
  }
  if (probe.status === 401 || probe.status === 403) {
    throw new AccessDeniedError(origin, probe.status, (await probe.text()).trim());
  }
  return openSession(apiUrlFor(origin), headers);
}

/** Opens an unauthenticated session to the `/api` WebSocket at `apiUrl`. */
export function connectSession(apiUrl: string): RpcStub<PublicApi> {
  return openSession(apiUrl, {});
}

/** The Access edge or the Workshop refused the request outright. */
export class AccessDeniedError extends Error {
  readonly origin: string;
  readonly status: number;
  readonly reason: string;

  constructor(origin: string, status: number, reason: string) {
    super(`${origin} refused the request (${status}): ${reason || "no reason given"}`);
    this.name = "AccessDeniedError";
    this.origin = origin;
    this.status = status;
    this.reason = reason;
  }
}

/** What a push did, as the receiving Workshop reports it. */
export type PushResult = {
  /** Who the Workshop says pushed it: the owner of the new blueprint. */
  identity: { id: string; name: string };
  blueprintId: string;
  /** The content hash of the archive as the Workshop serves it back. */
  remoteSha256: string;
  /** Whether `remoteSha256` matches the hash of what was pushed. */
  verified: boolean;
};

/**
 * Imports `skill` into the library of the user `user` authenticates as, then downloads it back and
 * compares content hashes, so success means the Workshop holds exactly the bytes that were tested.
 */
export async function pushSkill(
    api: RpcStub<PublicApi>,
    user: RpcStub<AuthenticatedApi> | RpcPromise<AuthenticatedApi>,
    skill: PackedSkill): Promise<PushResult> {
  const who = await user.whoami();
  const blueprintId = await user.importBlueprint(streamOf(skill.archive));
  const remoteSha256 = await downloadContentSha256(api, blueprintId);
  return {
    identity: { id: who.id, name: who.name },
    blueprintId,
    remoteSha256,
    verified: remoteSha256 === skill.contentSha256,
  };
}

/** Downloads blueprint `blueprintId` and returns its content hash. */
export async function downloadContentSha256(api: RpcStub<PublicApi>, blueprintId: string)
    : Promise<string> {
  const stream = await api.downloadBlueprint(blueprintId);
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return archiveContentSha256(bytes, blueprintId);
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// Node's WebSocket (undici) accepts request headers as a non-standard constructor option; the DOM
// typings do not know it.
function openSession(apiUrl: string, headers: Record<string, string>): RpcStub<PublicApi> {
  const NodeWebSocket = WebSocket as unknown as new (
      url: string, init: { headers: Record<string, string> }) => WebSocket;
  return newWebSocketRpcSession<PublicApi>(new NodeWebSocket(apiUrl, { headers }));
}
