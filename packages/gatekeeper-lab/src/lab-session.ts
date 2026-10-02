// The sessions a Gadget holds. Every read is recorded on the approval queue as an observation before
// anything is returned. Operations the lab does not serve yet throw.

import { RpcStub, RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import type { LabApi } from "./lab-api";
import type {
  Comparison,
  Portfolio,
  Revision,
  RevisionDiff,
  RevisionFile,
  RevisionLineage,
  Run,
  RunQuery,
  Study,
  StudyReader,
} from "./types";

export const NOT_AVAILABLE = "Not available yet";

const MAX_FILES_LISTED = 20;

@validateRpc()
export class RevisionLineageSession extends RpcTarget implements RevisionLineage {
  readonly #api: LabApi;
  readonly #queue: RpcStub<ApprovalQueue>;
  readonly #kind: string;
  readonly #name: string;

  constructor(api: LabApi, queue: RpcStub<ApprovalQueue>, kind: string, name: string) {
    super();
    this.#api = api;
    this.#queue = queue;
    this.#kind = kind;
    this.#name = name;
  }

  [Symbol.dispose](): void { this.#queue[Symbol.dispose](); }

  get #label(): string { return `${this.#kind}/${this.#name}`; }

  async list(): Promise<Revision[]> {
    const revisions = await this.#api.listRevisions(this.#kind, this.#name);
    await this.#queue.authorizeObservation({
      title: `List revisions of ${this.#label}`,
      description: revisions.length
        ? `Read ${revisions.length} published revisions of ${this.#label}: ` +
          revisions.map((r) => `#${r.number}`).join(", ") + "."
        : `${this.#label} has no published revisions.`,
    });
    return revisions;
  }

  async get(number: number): Promise<Revision> {
    const revision = await this.#api.getRevision(this.#kind, this.#name, number);
    await this.#queue.authorizeObservation({
      title: `Read ${this.#label}@${number}`,
      description: `Read the record of ${this.#label}@${number} (${revision.contentHash}), ` +
        `published by ${revision.publishedBy}.`,
    });
    return revision;
  }

  async files(number: number): Promise<RevisionFile[]> {
    const files = await this.#api.revisionFiles(this.#kind, this.#name, number);
    const listed = files.slice(0, MAX_FILES_LISTED).map((f) => f.path).join(", ");
    await this.#queue.authorizeObservation({
      title: `Read the files of ${this.#label}@${number}`,
      description: `Read ${files.length} files of ${this.#label}@${number}: ${listed}` +
        (files.length > MAX_FILES_LISTED ? ", ..." : "") + ".",
    });
    return files;
  }

  async diff(_number: number, _against?: number): Promise<RevisionDiff> {
    throw new Error(NOT_AVAILABLE);
  }

  async runs(_number: number, _query?: RunQuery): Promise<Run[]> {
    throw new Error(NOT_AVAILABLE);
  }
}

@validateRpc()
export class StudyReaderSession extends RpcTarget implements StudyReader {
  readonly #api: LabApi;
  readonly #queue: RpcStub<ApprovalQueue>;
  readonly #studyId: string;

  constructor(api: LabApi, queue: RpcStub<ApprovalQueue>, studyId: string) {
    super();
    this.#api = api;
    this.#queue = queue;
    this.#studyId = studyId;
  }

  [Symbol.dispose](): void { this.#queue[Symbol.dispose](); }

  async describe(): Promise<Study> {
    const study = await this.#api.getStudy(this.#studyId);
    await this.#queue.authorizeObservation({
      title: `Read study ${study.name} #${study.number}`,
      description: `Read study ${this.#studyId} (${study.name} #${study.number}) and its ` +
        `${study.variants.length} variants: ` +
        study.variants.map((v) => `${v.label} = ${v.revision.kind}/${v.revision.name}@${v.revision.number}`)
          .join(", ") + ".",
    });
    return study;
  }

  async portfolios(): Promise<{ label: string; portfolio: Portfolio }[]> {
    throw new Error(NOT_AVAILABLE);
  }

  async compare(_first: string, _second: string): Promise<Comparison> {
    throw new Error(NOT_AVAILABLE);
  }

  async runs(_query?: RunQuery & { variant?: string }): Promise<Run[]> {
    throw new Error(NOT_AVAILABLE);
  }
}
