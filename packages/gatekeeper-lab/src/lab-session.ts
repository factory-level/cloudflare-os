// The sessions a Gadget holds. Every read is recorded on the approval queue as an observation before
// anything is returned. Operations the lab does not serve yet throw.

import { RpcStub, RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import type { LabApi } from "./lab-api";
import type {
  AgentSummary,
  CatalogEntry,
  Comparison,
  Cycle,
  EquityPoint,
  LabAnalytics,
  Portfolio,
  Revision,
  RevisionDiff,
  RevisionFile,
  RevisionCatalog,
  RevisionLineage,
  RevisionRef,
  Run,
  RunQuery,
  RunReport,
  Study,
  StudyOverview,
  StudyReader,
  StudyVariant,
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
export class RevisionCatalogSession extends RpcTarget implements RevisionCatalog {
  readonly #api: LabApi;
  readonly #queue: RpcStub<ApprovalQueue>;

  constructor(api: LabApi, queue: RpcStub<ApprovalQueue>) {
    super();
    this.#api = api;
    this.#queue = queue;
  }

  [Symbol.dispose](): void { this.#queue[Symbol.dispose](); }

  async list(kind?: RevisionRef["kind"]): Promise<CatalogEntry[]> {
    const entries = await this.#api.catalog(kind);
    const shown = entries.slice(0, MAX_FILES_LISTED).map((e) => `${e.kind}/${e.name}@${e.latest.number}`);
    await this.#queue.authorizeObservation({
      title: kind ? `List published ${kind}s` : "List everything published to the lab",
      description: entries.length
        ? `Read ${entries.length} published artifacts: ${shown.join(", ")}` +
          (entries.length > shown.length ? ", ..." : "") + "."
        : "Nothing is published.",
    });
    return entries;
  }

  async revisions(kind: RevisionRef["kind"], name: string): Promise<Revision[]> {
    const revisions = await this.#api.listRevisions(kind, name);
    await this.#queue.authorizeObservation({
      title: `List revisions of ${kind}/${name}`,
      description: `Read ${revisions.length} published revisions of ${kind}/${name}.`,
    });
    return revisions;
  }

  async files(kind: RevisionRef["kind"], name: string, number: number): Promise<RevisionFile[]> {
    const files = await this.#api.revisionFiles(kind, name, number);
    const listed = files.slice(0, MAX_FILES_LISTED).map((f) => f.path).join(", ");
    await this.#queue.authorizeObservation({
      title: `Read the files of ${kind}/${name}@${number}`,
      description: `Read ${files.length} files of ${kind}/${name}@${number}: ${listed}` +
        (files.length > MAX_FILES_LISTED ? ", ..." : "") + ".",
    });
    return files;
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
    const portfolios = await this.#api.portfolios(this.#studyId);
    await this.#queue.authorizeObservation({
      title: `Read the portfolios of study ${this.#studyId}`,
      description: `Read ${portfolios.length} virtual portfolios: ` +
        portfolios.map((p) => `${p.label} equity ${p.portfolio.equityCents} cents`).join(", ") + ".",
    });
    return portfolios;
  }

  async compare(first: string, second: string): Promise<Comparison> {
    const comparison = await this.#api.compare(this.#studyId, first, second);
    await this.#queue.authorizeObservation({
      title: `Compare ${first} and ${second} in study ${this.#studyId}`,
      description: `Compared over ${comparison.sharedCycles} shared cycles: ${comparison.outcome}.`,
    });
    return comparison;
  }

  async runs(query?: RunQuery & { variant?: string }): Promise<Run[]> {
    const runs = await this.#api.studyRuns(this.#studyId, query);
    await this.#queue.authorizeObservation({
      title: `Read runs of study ${this.#studyId}`,
      description: `Read ${runs.length} runs${query?.variant ? ` of variant ${query.variant}` : ""}.`,
    });
    return runs;
  }
}

@validateRpc()
export class LabAnalyticsSession extends RpcTarget implements LabAnalytics {
  readonly #api: LabApi;
  readonly #queue: RpcStub<ApprovalQueue>;

  constructor(api: LabApi, queue: RpcStub<ApprovalQueue>) {
    super();
    this.#api = api;
    this.#queue = queue;
  }

  [Symbol.dispose](): void { this.#queue[Symbol.dispose](); }

  async studies(): Promise<StudyOverview[]> {
    const studies = await this.#api.studies();
    const shown = studies.slice(0, MAX_FILES_LISTED).map((s) => `${s.study.name} #${s.study.number}`);
    const alerts = studies.reduce((n, s) => n + s.alerts.length, 0);
    await this.#queue.authorizeObservation({
      title: "Read every study",
      description: studies.length
        ? `Read ${studies.length} studies with ${alerts} open alerts: ${shown.join(", ")}` +
          (studies.length > shown.length ? ", ..." : "") + "."
        : "No study exists.",
    });
    return studies;
  }

  async equity(studyId: string): Promise<{ label: string; points: EquityPoint[] }[]> {
    const variants = await this.#api.equity(studyId);
    await this.#queue.authorizeObservation({
      title: `Read the equity curves of study ${studyId}`,
      description: `Read ${variants.length} equity curves: ` +
        variants.map((v) => `${v.label} over ${v.points.length} cycles`).join(", ") + ".",
    });
    return variants;
  }

  async agents(): Promise<{ agent: string; runs: number }[]> {
    const agents = await this.#api.agents();
    await this.#queue.authorizeObservation({
      title: "List agents",
      description: agents.length
        ? `Read ${agents.length} agents: ` +
          agents.slice(0, MAX_FILES_LISTED).map((a) => `${a.agent} (${a.runs} runs)`).join(", ") +
          (agents.length > MAX_FILES_LISTED ? ", ..." : "") + "."
        : "No agent has recorded a run.",
    });
    return agents;
  }

  async agent(agent: string, options?: { from?: string; to?: string }): Promise<AgentSummary[]> {
    const summary = await this.#api.agentSummary(agent, options);
    const range = [options?.from && `from ${options.from}`, options?.to && `to ${options.to}`]
      .filter(Boolean).join(" ");
    await this.#queue.authorizeObservation({
      title: `Read the analytics of agent ${agent}`,
      description: `Read ${agent}'s activity${range ? ` ${range}` : ""}: ${summary[0]?.cycles ?? 0} cycles ` +
        `across ${summary.length - 1} revisions.`,
    });
    return summary;
  }
}

/** A run this variant asked to record, waiting for the workspace to allow it. */
export type PendingRun = { actionId: number; report: RunReport; submittedAt: string };

/** Where the variant's gatekeeper keeps runs waiting for approval. */
export interface PendingRuns {
  list(): PendingRun[];
  /** Stores `report` under the next action ID and returns it. */
  add(report: RunReport): number;
}

export const RECORD_RUN_KIND = { tag: "lab.record_run", label: "Record study runs" };

@validateRpc()
export class StudyVariantSession extends RpcTarget implements StudyVariant {
  readonly #api: LabApi;
  readonly #queue: RpcStub<ApprovalQueue>;
  readonly #studyId: string;
  readonly #label: string;
  readonly #pending: PendingRuns;

  constructor(api: LabApi, queue: RpcStub<ApprovalQueue>, studyId: string, label: string, pending: PendingRuns) {
    super();
    this.#api = api;
    this.#queue = queue;
    this.#studyId = studyId;
    this.#label = label;
    this.#pending = pending;
  }

  [Symbol.dispose](): void { this.#queue[Symbol.dispose](); }

  get #name(): string { return `${this.#studyId} variant ${this.#label}`; }

  async describe(): Promise<{ study: Study; label: string; revision: RevisionRef & { contentHash: string } }> {
    const described = await this.#api.describeVariant(this.#studyId, this.#label);
    await this.#queue.authorizeObservation({
      title: `Read study ${this.#name}`,
      description: `Read ${this.#name}: revision ${described.revision.kind}/${described.revision.name}@` +
        `${described.revision.number} (${described.revision.contentHash}).`,
    });
    return described;
  }

  async nextCycle(): Promise<Cycle | null> {
    if (this.#pending.list().length > 0) return null;
    const cycle = await this.#api.nextCycle(this.#studyId, this.#label);
    await this.#queue.authorizeObservation({
      title: `Read the next cycle of ${this.#name}`,
      description: cycle
        ? `Read cycle ${cycle.key}: ${cycle.bars.length} daily bars of ${cycle.symbol}.`
        : "No cycle is waiting.",
    });
    return cycle;
  }

  async portfolio(): Promise<Portfolio> {
    const portfolio = await this.#api.portfolio(this.#studyId, this.#label);
    await this.#queue.authorizeObservation({
      title: `Read the portfolio of ${this.#name}`,
      description: `Cash ${portfolio.cashCents} cents, equity ${portfolio.equityCents} cents, ` +
        `${portfolio.positions.map((p) => `${p.quantity} ${p.symbol}`).join(", ") || "no positions"}.`,
    });
    return portfolio;
  }

  async recordRun(report: RunReport): Promise<Run> {
    // Reading the variant's revision only prepares the action, so it is not an observation.
    const { revision } = await this.#api.describeVariant(this.#studyId, this.#label);
    const waiting = this.#pending.list().find((p) => p.report.cycleKey === report.cycleKey);
    const actionId = waiting?.actionId ?? this.#pending.add(report);
    if (!waiting) {
      const order = report.orderIntent;
      await this.#queue.submitAction(actionId, {
        title: `Record ${this.#name}'s run for ${report.cycleKey}: ${report.decision}`,
        description: `Records what ${report.agent} decided for cycle ${report.cycleKey} in the trading ` +
          "lab. " + (order
            ? `It asks for a virtual ${order.side} of ${order.quantity} ${order.symbol}, which the lab's ` +
              "risk gate checks before any simulated fill. No real order is placed."
            : "It asks for no order."),
        fields: [{ label: "Run report", kind: "json", value: JSON.stringify(report, null, 2) }],
        descriptionIsComplete: true,
        implementsRevert: false,
        autoApprovable: true,
        actionKind: RECORD_RUN_KIND,
      });
    }
    return {
      ...report,
      id: `pending:${actionId}`,
      studyId: this.#studyId,
      variant: this.#label,
      revision,
      recordedAt: new Date().toISOString(),
      riskRejection: null,
      fill: null,
    };
  }

  async runs(query?: RunQuery): Promise<Run[]> {
    const runs = await this.#api.variantRuns(this.#studyId, this.#label, query);
    await this.#queue.authorizeObservation({
      title: `Read the runs of ${this.#name}`,
      description: `Read ${runs.length} recorded runs.`,
    });
    if (query?.before) return runs;
    const { revision } = await this.#api.describeVariant(this.#studyId, this.#label);
    const pending: Run[] = this.#pending.list().toReversed().map((p) => ({
      ...p.report,
      id: `pending:${p.actionId}`,
      studyId: this.#studyId,
      variant: this.#label,
      revision,
      recordedAt: p.submittedAt,
      riskRejection: null,
      fill: null,
    }));
    return [...pending, ...runs].slice(0, query?.limit ?? 50);
  }
}
