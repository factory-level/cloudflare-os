// HTTP client for the ai-trader lab API. The deployment signs in as one Cloudflare Access service;
// every read also names the connection it acts through and the person who made it, and the lab
// refuses once that connection is revoked.

import type { CatalogEntry, Revision, RevisionFile, RevisionRef, Study } from "./types";

/** Deployment configuration read from the Worker environment. */
export type LabConfig = {
  url: string;
  /** Service-token credentials, which Cloudflare Access exchanges for an assertion. */
  clientId?: string;
  clientSecret?: string;
  /** A pre-minted assertion, for local development without Access in front of the lab. */
  assertion?: string;
};

export type LabEnv = {
  LAB_URL?: string;
  LAB_CLIENT_ID?: string;
  LAB_CLIENT_SECRET?: string;
  LAB_ASSERTION?: string;
};

/** The configuration, or null when the deployment has no lab or no way to sign in to it. */
export function readLabConfig(env: LabEnv): LabConfig | null {
  const raw = env.LAB_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const clientId = env.LAB_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.LAB_CLIENT_SECRET?.trim() || undefined;
  const assertion = env.LAB_ASSERTION?.trim() || undefined;
  if (!(clientId && clientSecret) && !assertion) return null;
  return { url: url.href.replace(/\/+$/, ""), clientId, clientSecret, assertion };
}

/** A connection this deployment made for one person. */
export type Acting = { connectionId: string; onBehalfOf: string };

/** A lab refusal or failure, with the lab's stable `code` when it sent one. */
export class LabError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "LabError";
  }
}

/** True when the lab says the caller may not read the resource, as opposed to a failure. */
export function deniesAccess(error: unknown): boolean {
  return error instanceof LabError && (error.status === 403 || error.status === 404);
}

const TIMEOUT_MS = 10_000;

type LabRevisionRecord = {
  kind: RevisionRef["kind"];
  name: string;
  number: number;
  content_hash: string;
  pins: { kind: RevisionRef["kind"]; name: string; number: number; content_hash: string }[];
  published_by: string;
  created_at: string;
};
type LabRevisionStudy = { study_id: string; label: string };
type LabStudyRecord = {
  id: string;
  name: string;
  number: number;
  spec: {
    variants: { label: string; revision: RevisionRef & { content_hash: string } }[];
    starting_capital: { currency: string; amount_minor: number };
    execution_model: string;
    supersedes?: string;
  };
};

export function toRevision(record: LabRevisionRecord, studies: LabRevisionStudy[]): Revision {
  return {
    kind: record.kind,
    name: record.name,
    number: record.number,
    contentHash: record.content_hash,
    pins: record.pins.map((pin) => ({
      kind: pin.kind, name: pin.name, number: pin.number, contentHash: pin.content_hash,
    })),
    publishedBy: record.published_by,
    publishedAt: record.created_at,
    studies: studies.map((study) => ({ studyId: study.study_id, label: study.label })),
  };
}

export function toStudy(record: LabStudyRecord): Study {
  const { spec } = record;
  return {
    id: record.id,
    name: record.name,
    number: record.number,
    // The lab has no way to stop a study yet, so every recorded study is active.
    status: "active",
    startingCapital: {
      currency: spec.starting_capital.currency,
      amountCents: spec.starting_capital.amount_minor,
    },
    executionModel: spec.execution_model,
    variants: spec.variants.map((variant) => ({
      label: variant.label,
      revision: {
        kind: variant.revision.kind,
        name: variant.revision.name,
        number: variant.revision.number,
        contentHash: variant.revision.content_hash,
      },
    })),
    supersedes: spec.supersedes ?? null,
  };
}

export class LabApi {
  readonly #config: LabConfig;
  readonly #acting: () => Promise<Acting>;

  /** `acting` resolves the connection to read through; it throws once the account is revoked. */
  constructor(config: LabConfig, acting: () => Promise<Acting>) {
    this.#config = config;
    this.#acting = acting;
  }

  /** Builds a URL under the lab from path segments, each escaped. */
  url(...segments: (string | number)[]): string {
    return `${this.#config.url}/${segments.map((s) => encodeURIComponent(String(s))).join("/")}`;
  }

  async catalog(kind?: string): Promise<CatalogEntry[]> {
    const acting = await this.#acting();
    const url = this.url("revisions") + (kind === undefined ? "" : `?kind=${encodeURIComponent(kind)}`);
    const body = await labRequest<{
      artifacts: { kind: RevisionRef["kind"]; name: string; revisions: number; latest: LabRevisionRecord }[];
    }>(this.#config, "GET", url, actingHeaders(acting));
    return body.artifacts.map((artifact) => {
      const { studies: _, ...latest } = toRevision(artifact.latest, []);
      return { kind: artifact.kind, name: artifact.name, revisions: artifact.revisions, latest };
    });
  }

  async listRevisions(kind: string, name: string): Promise<Revision[]> {
    const body = await this.#read<{ revisions: (LabRevisionRecord & { studies: LabRevisionStudy[] })[] }>(
      "revisions", kind, name,
    );
    return body.revisions.map((revision) => toRevision(revision, revision.studies));
  }

  async getRevision(kind: string, name: string, number: number): Promise<Revision> {
    const body = await this.#read<{ revision: LabRevisionRecord; studies: LabRevisionStudy[] }>(
      "revisions", kind, name, number,
    );
    return toRevision(body.revision, body.studies);
  }

  async revisionFiles(kind: string, name: string, number: number): Promise<RevisionFile[]> {
    const body = await this.#read<{ files: RevisionFile[] }>("revisions", kind, name, number, "files");
    return body.files;
  }

  async getStudy(id: string): Promise<Study> {
    const body = await this.#read<{ study: LabStudyRecord }>("studies", id);
    return toStudy(body.study);
  }

  async #read<T>(...segments: (string | number)[]): Promise<T> {
    const acting = await this.#acting();
    return labRequest<T>(this.#config, "GET", this.url(...segments), actingHeaders(acting));
  }
}

function actingHeaders(acting: Acting): Record<string, string> {
  return { "x-lab-connection": acting.connectionId, "x-lab-on-behalf-of": acting.onBehalfOf };
}

/** Makes a connection for `onBehalfOf`; only a service may. Returns the connection's ID. */
export async function connect(config: LabConfig, onBehalfOf: string): Promise<string> {
  const body = await labRequest<{ connection: { id: string } }>(
    config, "POST", `${config.url}/connections`, {}, { on_behalf_of: onBehalfOf },
  );
  return body.connection.id;
}

/** Revokes a connection. Revoking one already revoked succeeds. */
export async function revoke(config: LabConfig, acting: Acting): Promise<void> {
  await labRequest(
    config, "POST",
    `${config.url}/connections/${encodeURIComponent(acting.connectionId)}/revoke`,
    actingHeaders(acting),
  );
}

async function labRequest<T>(
  config: LabConfig,
  method: "GET" | "POST",
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const signIn: Record<string, string> =
    config.clientId && config.clientSecret
      ? { "cf-access-client-id": config.clientId, "cf-access-client-secret": config.clientSecret }
      : { "cf-access-jwt-assertion": config.assertion ?? "" };
  let response: Response;
  try {
    const init: RequestInit = {
      method,
      headers: { ...signIn, ...headers },
      // Access answers an unsigned request with a redirect to its sign-in page.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (body !== undefined) {
      init.headers = { ...signIn, ...headers, "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    response = await fetch(url, init);
  } catch {
    throw new LabError("The lab could not be reached.", 0, "unreachable");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new LabError("The lab refused this connector's sign-in.", response.status, "not_signed_in");
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  if (response.ok) return parsed as T;
  const { code, reason } = (parsed ?? {}) as { code?: string; reason?: string };
  throw labError(response.status, code ?? "unavailable", reason);
}

function labError(status: number, code: string, reason?: string): LabError {
  switch (code) {
    case "unauthenticated":
      return new LabError("The lab refused this connector's sign-in.", status, code);
    case "connection_revoked":
      return new LabError(
        "This lab connection was disconnected. Connect the lab again to read from it.", status, code);
    case "invalid_connection":
      return new LabError("The lab does not recognize this connection.", status, code);
    case "not_found":
      return new LabError("Not found in the lab.", status, code);
    case "refused":
      return new LabError(`The lab refused the request: ${reason ?? "no reason given"}.`, status, code, reason);
    default:
      return new LabError(`The lab could not answer (HTTP ${status}).`, status, code, reason);
  }
}
