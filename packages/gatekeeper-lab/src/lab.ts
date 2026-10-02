// Trading lab connector. A deployment signs in to the ai-trader lab with one Cloudflare Access
// service token; each connected account is a lab connection made for the person who connected it,
// and disconnecting revokes that connection on the lab's side as well as here.

import { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import {
  connectHandoffPageHtml,
  errorPageHtml,
  escapeHtml,
  htmlResponse,
  INVALID_LINK_HTML,
  PAGE_STYLE,
} from "@gadgets/gatekeeper-kit/connect-pages";
import { constantTimeEqual, generateNonce, NONCE_BYTES } from "@gadgets/gatekeeper-kit/connect-nonce";
import { createLogger } from "@gadgets/observability/logger";
import type {
  AccountDescription,
  ActionKind,
  ApprovalQueue,
  ConnectHandoff,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperUser,
  GatekeeperUserVerifier,
  GatekeeperVendor as GatekeeperVendorIface,
  GitCache,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import type { RevisionsConfiguratorRpc } from "./configurator/revisions-configurator-types";
import type { StudyConfiguratorRpc } from "./configurator/study-configurator-types";
import REVISIONS_CONFIGURATOR_HTML from "./generated/revisions-configurator-ui.txt";
import STUDY_CONFIGURATOR_HTML from "./generated/study-configurator-ui.txt";
import {
  type Acting,
  connect,
  deniesAccess,
  LabApi,
  type LabConfig,
  type LabEnv,
  readLabConfig,
  revoke as revokeConnection,
} from "./lab-api";
import { RevisionLineageSession, StudyReaderSession } from "./lab-session";
import {
  KINDS,
  type LabResource,
  parseResourceUrl,
  resourceUrl,
  revisionsResource,
  studyResource,
} from "./resources";
import type { RevisionLineage, RevisionRef, StudyReader } from "./types";
import TYPES_CODE from "./types.txt";

const VENDOR_ID = "lab";
type LabLogFields = { vendorId: string };
const logger = createLogger<LabLogFields>({ component: "gatekeeper.lab", vendorId: VENDOR_ID });

type Env = Cloudflare.Env & LabEnv & {
  BASE_URL?: string;
  LAB_ALLOW_TYPED_EMAIL?: string;
};

const NONCE_LIFETIME_MS = 10 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 60 * 60 * 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

const LOGO_URL = "data:image/svg+xml;base64," + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1c1a18" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/>` +
  `<path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/></svg>`,
);

function getBaseUrl(env: Env): string {
  return (env.BASE_URL || "http://localhost:8787/gatekeeper/lab").replace(/\/+$/, "");
}

function getBasePath(env: Env): string {
  const path = new URL(getBaseUrl(env)).pathname;
  return path === "/" ? "" : path;
}

function requireConfig(env: Env): LabConfig {
  const config = readLabConfig(env);
  if (!config) throw new Error("This deployment has no trading lab configured.");
  return config;
}

function supportedResources(env: Env): SupportedResource[] {
  const config = readLabConfig(env);
  return config ? [revisionsResource(config.url), studyResource(config.url)] : [];
}

/**
 * Who is connecting. Behind Cloudflare Access the sign-in header names the person, and nothing
 * typed can override it. Without Access, a deployment that sets `LAB_ALLOW_TYPED_EMAIL` (local
 * development only) lets the person type it.
 */
function connectingPerson(req: Request, env: Env): { email: string } | { typed: true } | null {
  const fromAccess = req.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (fromAccess && EMAIL.test(fromAccess)) return { email: fromAccess };
  return env.LAB_ALLOW_TYPED_EMAIL === "true" ? { typed: true } : null;
}

function connectFormHtml(params: { actionUrl: string; email?: string; error?: string }): string {
  const who = params.email
    ? `<p>You are connecting as <strong>${escapeHtml(params.email)}</strong>.</p>`
    : `<label>Your email <input name="email" type="email" required autocomplete="email"></label>
<p class="sub">Local development: this email is not verified.</p>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect the trading lab</title><style>${PAGE_STYLE}
  form { display: grid; gap: 12px; }
  input { font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: 6px;
          background: var(--control); color: var(--text); width: 100%; box-sizing: border-box; }
  button { font: inherit; padding: 8px 14px; border: 0; border-radius: 6px;
           background: var(--contrast); color: var(--on-contrast); cursor: pointer; }
</style></head>
<body><main><h1>Connect the trading lab</h1>
<p class="sub">Gadgets you bind to it can read published revisions and studies for you.
They cannot publish, create studies, or change anything in the lab.</p>
${params.error ? `<p class="err">${escapeHtml(params.error)}</p>` : ""}
<form method="post" action="${escapeHtml(params.actionUrl)}">
${who}
<button type="submit">Connect</button>
</form></main></body></html>`;
}

// ---------------------------------------------------------------------------
// HTTP handler: the connect page.

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const basePath = getBasePath(env);
    if (!url.pathname.startsWith(`${basePath}/`) && url.pathname !== basePath) {
      throw new Error(`Request path ${url.pathname} does not match BASE_URL path ${basePath}`);
    }
    const path = url.pathname.slice(basePath.length + 1).split("/");
    if (path.length !== 2 || path[0]?.length !== 64 || path[1]?.length !== NONCE_BYTES * 2) {
      return new Response("Not Found", { status: 404 });
    }
    const [doId, nonce] = path as [string, string];
    const account = ctx.exports.UserAccount.get(ctx.exports.UserAccount.idFromString(doId));
    const person = connectingPerson(req, env);
    if (!person) {
      return htmlResponse(errorPageHtml(
        "Sign-in required",
        "This deployment connects the lab only for a person signed in through Cloudflare Access.",
      ), 403);
    }
    const email = "email" in person ? person.email : undefined;

    if (req.method === "GET") {
      if (!(await account.verifyNonceWithoutConsuming(nonce))) return htmlResponse(INVALID_LINK_HTML);
      return htmlResponse(connectFormHtml({ actionUrl: req.url, email }));
    }
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return new Response("Invalid form submission.", { status: 400 });
    }
    const who = email ?? String(form.get("email") ?? "").trim().toLowerCase();
    if (!EMAIL.test(who)) {
      return htmlResponse(
        connectFormHtml({ actionUrl: req.url, email, error: "Enter a valid email address." }), 400);
    }
    const result = await account.completeConnection(nonce, who);
    if (result.kind === "invalid_nonce") return htmlResponse(INVALID_LINK_HTML);
    if (result.kind === "error") {
      return htmlResponse(connectFormHtml({ actionUrl: req.url, email, error: result.message }), 400);
    }
    return htmlResponse(connectHandoffPageHtml(result.handoff));
  },
};

// ---------------------------------------------------------------------------
// Vendor

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Env> implements GatekeeperVendorIface {
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "Trading lab",
      url: readLabConfig(this.env)?.url ?? "https://github.com/factory-level/ai-trader",
      logo: { url: LOGO_URL },
      color: "#f3f1ee",
      tagline: "Read published revisions and studies from the trading lab",
      description:
        "Connect the ai-trader lab so Gadgets can read published skill, workflow, agent, and " +
        "strategy revisions, their files, and the studies that compare them. Reads only: nothing " +
        "bound to the lab can publish, create a study, or trade.",
    };
  }

  async connectAccount(callback: Fetcher<GatekeeperConnectCallback>): Promise<{ url: string }> {
    requireConfig(this.env);
    const userObjectId = this.ctx.exports.UserAccount.newUniqueId();
    const nonce = generateNonce();
    await this.ctx.exports.UserAccount.get(userObjectId).setCallback(callback, nonce);
    return { url: `${getBaseUrl(this.env)}/${userObjectId.toString()}/${nonce}` };
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return supportedResources(this.env);
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}

// ---------------------------------------------------------------------------
// UserAccount: one lab connection and the person it was made for.

type StoredNonce = { value: string; expiresAt: number; connecting?: true };
type StoredConnection = Acting;

type CompleteConnectionResult =
  | { kind: "ok"; handoff: ConnectHandoff }
  | { kind: "invalid_nonce" }
  | { kind: "error"; message: string };

export class UserAccount extends DurableObject<Env> {
  async setCallback(callback: Fetcher<GatekeeperConnectCallback>, nonce: string): Promise<void> {
    if (!this.ctx.storage.kv.get<StoredConnection>("connection")) {
      await this.ctx.storage.setAlarm(Date.now() + CONNECT_TIMEOUT_MS);
    }
    this.ctx.storage.kv.put("callback", callback);
    this.ctx.storage.kv.put<StoredNonce>("nonce", { value: nonce, expiresAt: Date.now() + NONCE_LIFETIME_MS });
  }

  async verifyNonceWithoutConsuming(nonce: string): Promise<boolean> {
    const stored = this.ctx.storage.kv.get<StoredNonce>("nonce");
    return Boolean(stored && Date.now() < stored.expiresAt && constantTimeEqual(stored.value, nonce));
  }

  async completeConnection(nonce: string, email: string): Promise<CompleteConnectionResult> {
    const stored = this.ctx.storage.kv.get<StoredNonce>("nonce");
    if (!stored || stored.connecting || Date.now() >= stored.expiresAt
        || !constantTimeEqual(stored.value, nonce)) {
      return { kind: "invalid_nonce" };
    }
    // Claim the nonce before the first await, so a second submission cannot connect twice.
    this.ctx.storage.kv.put<StoredNonce>("nonce", { ...stored, connecting: true });

    const config = readLabConfig(this.env);
    if (!config) {
      this.#release(nonce);
      return { kind: "error", message: "This deployment has no trading lab configured." };
    }
    let acting: Acting;
    try {
      acting = { connectionId: await connect(config, email), onBehalfOf: email };
    } catch (error) {
      this.#release(nonce);
      logger.warn("lab connection failed", { event: "connect.failed", error });
      return { kind: "error", message: error instanceof Error ? error.message : "The lab refused." };
    }
    this.ctx.storage.kv.delete("nonce");

    const callback = this.ctx.storage.kv.get<Fetcher<GatekeeperConnectCallback>>("callback");
    if (!callback) {
      await revokeQuietly(config, acting);
      return { kind: "error", message: "The connection request expired. Please start again." };
    }
    this.ctx.storage.kv.put<StoredConnection>("connection", acting);
    let handoff: ConnectHandoff;
    try {
      const props: LabUserProps = { userObjectId: this.ctx.id.toString() };
      handoff = await callback.complete(this.ctx.exports.LabUser({ props }));
    } catch (error) {
      this.ctx.storage.kv.delete("connection");
      await revokeQuietly(config, acting);
      return {
        kind: "error",
        message: `Failed to notify the Workshop: ${error instanceof Error ? error.message : error}`,
      };
    }
    await this.ctx.storage.deleteAlarm();
    return { kind: "ok", handoff };
  }

  #release(nonce: string): void {
    const stored = this.ctx.storage.kv.get<StoredNonce>("nonce");
    if (!stored?.connecting || !constantTimeEqual(stored.value, nonce)) return;
    const { connecting: _, ...released } = stored;
    this.ctx.storage.kv.put<StoredNonce>("nonce", released);
  }

  /** The live connection. Throws once the account is disconnected. */
  async getActing(): Promise<Acting> {
    const acting = this.ctx.storage.kv.get<StoredConnection>("connection");
    if (!acting) throw new Error("This lab connection was disconnected. Connect the lab again to read from it.");
    return acting;
  }

  async getEmail(): Promise<string | null> {
    return this.ctx.storage.kv.get<StoredConnection>("connection")?.onBehalfOf ?? null;
  }

  async alarm(): Promise<void> {
    if (!this.ctx.storage.kv.get<StoredConnection>("connection")) await this.ctx.storage.deleteAll();
  }

  /** Revokes the connection at the lab, then forgets it here whether or not the lab answered. */
  async revoke(): Promise<void> {
    const acting = this.ctx.storage.kv.get<StoredConnection>("connection");
    const config = readLabConfig(this.env);
    if (acting && config) await revokeQuietly(config, acting);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

async function revokeQuietly(config: LabConfig, acting: Acting): Promise<void> {
  try {
    await revokeConnection(config, acting);
  } catch (error) {
    // This side still forgets the connection, so no Gadget can use it through this connector.
    logger.warn("lab did not confirm revocation", { event: "revoke.failed", error });
  }
}

// ---------------------------------------------------------------------------
// LabUser: the connected account the Workshop holds.

type LabUserProps = { userObjectId: string };

@validateRpc()
export class LabUser extends WorkerEntrypoint<Env, LabUserProps> implements GatekeeperUser {
  #account() {
    return this.ctx.exports.UserAccount.get(
      this.ctx.exports.UserAccount.idFromString(this.ctx.props.userObjectId));
  }

  async describe(): Promise<AccountDescription> {
    const email = await this.#account().getEmail();
    return { displayName: "Trading lab", uniqueName: email ?? undefined, avatar: { url: LOGO_URL } };
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return supportedResources(this.env);
  }

  async startResourceConfigurator(resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    const { url } = requireConfig(this.env);
    if (resourceUrlPattern === revisionsResource(url).urlPattern) {
      return { iframeHtml: REVISIONS_CONFIGURATOR_HTML, ui: new RpcStub(new RevisionsConfiguratorUI(url)) };
    }
    if (resourceUrlPattern === studyResource(url).urlPattern) {
      return { iframeHtml: STUDY_CONFIGURATOR_HTML, ui: new RpcStub(new StudyConfiguratorUI(url)) };
    }
    throw new Error(`Unsupported resource configurator type: ${resourceUrlPattern}`);
  }

  async getGatekeeperClassFor(url: string): Promise<{
    class: DurableObjectClass<Gatekeeper<any>>;
    resource: SupportedResource;
  }> {
    const config = requireConfig(this.env);
    const resource = parseResourceUrl(config.url, url);
    if (!resource) throw new Error(`Not a trading lab resource: ${url}`);
    const { userObjectId } = this.ctx.props;
    if (resource.type === "revisions") {
      return {
        class: this.ctx.exports.RevisionLineageGatekeeper({
          props: { userObjectId, kind: resource.kind, name: resource.name },
        }),
        resource: revisionsResource(config.url),
      };
    }
    return {
      class: this.ctx.exports.StudyReaderGatekeeper({ props: { userObjectId, studyId: resource.studyId } }),
      resource: studyResource(config.url),
    };
  }

  async revoke(): Promise<void> {
    await this.#account().revoke();
  }

  async reconnect(): Promise<{ url: string }> {
    throw new Error("Disconnect the trading lab and connect it again.");
  }

  async commitReconnect(_stageId: string): Promise<void> {
    throw new Error("No reconnect is awaiting confirmation.");
  }

  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.LabVerifier({ props: { userObjectId: this.ctx.props.userObjectId } });
  }
}

// ---------------------------------------------------------------------------
// Verifier: strategy B. An observer may see what a Gadget read from one lab resource when the
// observer's own lab connection can read that resource.

export interface LabVerifierApi extends GatekeeperUserVerifier {
  canRead(resourceUrl: string): Promise<boolean>;
}

@validateRpc()
export class LabVerifier extends WorkerEntrypoint<Env, LabUserProps> implements LabVerifierApi {
  async canRead(url: string): Promise<boolean> {
    const config = requireConfig(this.env);
    const resource = parseResourceUrl(config.url, url);
    if (!resource) return false;
    const account = this.ctx.exports.UserAccount.get(
      this.ctx.exports.UserAccount.idFromString(this.ctx.props.userObjectId));
    const api = new LabApi(config, () => account.getActing());
    try {
      if (resource.type === "revisions") await api.listRevisions(resource.kind, resource.name);
      else await api.getStudy(resource.studyId);
      return true;
    } catch (error) {
      if (deniesAccess(error) || (error instanceof Error && /disconnected/.test(error.message))) {
        logger.info("observer cannot read the bound lab resource", { event: "observer.denied" });
        return false;
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Configurators

@validateRpc()
class RevisionsConfiguratorUI extends RpcTarget implements RevisionsConfiguratorRpc {
  readonly #labUrl: string;
  constructor(labUrl: string) {
    super();
    this.#labUrl = labUrl;
  }

  async resourceUrl(kind: string, name: string): Promise<string> {
    const url = resourceUrl(this.#labUrl, { type: "revisions", kind: kind as RevisionRef["kind"], name });
    if (!parseResourceUrl(this.#labUrl, url)) {
      throw new Error(`Choose one of ${KINDS.join(", ")} and a lowercase name of letters, digits, ` +
        "and hyphens.");
    }
    return url;
  }
}

@validateRpc()
class StudyConfiguratorUI extends RpcTarget implements StudyConfiguratorRpc {
  readonly #labUrl: string;
  constructor(labUrl: string) {
    super();
    this.#labUrl = labUrl;
  }

  async resourceUrl(studyId: string): Promise<string> {
    const url = resourceUrl(this.#labUrl, { type: "study", studyId: studyId.trim() });
    if (!parseResourceUrl(this.#labUrl, url)) throw new Error("A study ID looks like stu_0001.");
    return url;
  }
}

// ---------------------------------------------------------------------------
// Gatekeepers: one per bound resource. Both are read-only.

type RevisionLineageProps = LabUserProps & { kind: RevisionRef["kind"]; name: string };
type StudyReaderProps = LabUserProps & { studyId: string };

const READ_ONLY = "The trading lab connector is read-only.";

abstract class LabGatekeeper<Props extends LabUserProps, Session> extends DurableObject<Env, Props> {
  protected abstract resource(): LabResource;

  protected api(): LabApi {
    const account = this.ctx.exports.UserAccount.get(
      this.ctx.exports.UserAccount.idFromString(this.ctx.props.userObjectId));
    return new LabApi(requireConfig(this.env), () => account.getActing());
  }

  protected url(): string {
    return resourceUrl(requireConfig(this.env).url, this.resource());
  }

  abstract startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<Session>;

  async getTypeScriptTypes(): Promise<string> { return TYPES_CODE; }
  async getAutoApprovableActions(): Promise<ActionKind[]> { return []; }

  async addObserver(_id: string, user: Fetcher<GatekeeperUserVerifier>): Promise<void> {
    const verifier = user as unknown as Fetcher<LabVerifierApi>;
    if (!(await verifier.canRead(this.url()))) {
      throw new Error("This collaborator has no trading lab connection that can read the bound resource.");
    }
  }

  async removeObserver(_id: string): Promise<void> {
    // Strategy B checks on each admission and keeps no observer state.
  }

  async applyAction(_action: number, _cache: RpcStub<GitCache>): Promise<void> { throw new Error(READ_ONLY); }
  async rejectAction(_action: number): Promise<void> { throw new Error(READ_ONLY); }
  async revertAction(_action: number): Promise<void> { throw new Error(READ_ONLY); }
}

@validateRpc()
export class RevisionLineageGatekeeper extends LabGatekeeper<RevisionLineageProps, RevisionLineage>
    implements Gatekeeper<RevisionLineage> {
  protected resource(): LabResource {
    return { type: "revisions", kind: this.ctx.props.kind, name: this.ctx.props.name };
  }

  async describe(): Promise<ResourceDescription> {
    const label = `${this.ctx.props.kind}/${this.ctx.props.name}`;
    return {
      url: this.url(),
      title: `${label} revisions`,
      snippet: `Read every published revision of ${label} and its files.`,
      suggestedBindingName: "LAB_REVISIONS",
      tsType: "RevisionLineage",
    };
  }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<RevisionLineage> {
    return new RevisionLineageSession(this.api(), approvalQueue.dup(), this.ctx.props.kind, this.ctx.props.name);
  }
}

@validateRpc()
export class StudyReaderGatekeeper extends LabGatekeeper<StudyReaderProps, StudyReader>
    implements Gatekeeper<StudyReader> {
  protected resource(): LabResource {
    return { type: "study", studyId: this.ctx.props.studyId };
  }

  async describe(): Promise<ResourceDescription> {
    return {
      url: this.url(),
      title: `Study ${this.ctx.props.studyId}`,
      snippet: "Read this study's variants, their exact revisions, and its starting capital.",
      suggestedBindingName: "LAB_STUDY",
      tsType: "StudyReader",
    };
  }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<StudyReader> {
    return new StudyReaderSession(this.api(), approvalQueue.dup(), this.ctx.props.studyId);
  }
}
