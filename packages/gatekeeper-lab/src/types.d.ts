/** A published revision's name: what kind of artifact it is, what it is called, and its number. */
export type RevisionRef = {
  kind: "skill" | "workflow" | "agent" | "strategy" | "view" | "brand";
  /** Lowercase letters, digits and hyphens, e.g. `"breakout-workflow"`. */
  name: string;
  /** A positive integer chosen by the author. Higher is later. */
  number: number;
};

/** One published, immutable revision. */
export type Revision = RevisionRef & {
  /** `"sha256:<hex>"` of the revision's content. Two revisions are the same code exactly when this is equal. */
  contentHash: string;
  /** The exact revisions this one depends on. */
  pins: (RevisionRef & { contentHash: string })[];
  /** The email of the person who published it. */
  publishedBy: string;
  /** ISO-8601 time it was published. */
  publishedAt: string;
  /** The studies this revision is a variant of. */
  studies: { studyId: string; label: string }[];
};

/** One published artifact and its newest revision. */
export type CatalogEntry = {
  kind: RevisionRef["kind"];
  name: string;
  /** How many revisions of this name are published. */
  revisions: number;
  /** The highest-numbered revision. Its `studies` are not listed here; read them with `revisions()`. */
  latest: Omit<Revision, "studies">;
};

/** One file of a revision's content. */
export type RevisionFile = {
  /** Path inside the revision, e.g. `"lib/workflow.ts"`. */
  path: string;
  text: string;
};

/** How one revision differs from an earlier one of the same name. */
export type RevisionDiff = {
  /** The earlier revision, or null when `to` is the first. */
  from: RevisionRef | null;
  to: RevisionRef;
  /** Files added, removed or changed, with a unified diff for changed text. */
  files: { path: string; change: "added" | "removed" | "changed"; diff?: string }[];
  /** Pins added, removed, or moved to another number or hash. */
  pins: { name: string; from: number | null; to: number | null }[];
};

/** One market bar. Bars are always returned oldest first. */
export type Bar = {
  /** Epoch seconds. */
  t: number;
  /** Close price in integer cents. */
  closeCents: number;
  volume: number;
};

/** A virtual portfolio's state. All money is integer cents. */
export type Portfolio = {
  currency: string;
  cashCents: number;
  /** Shares held, by symbol. */
  positions: { symbol: string; quantity: number }[];
  /** Cash plus positions at the latest close, in cents. */
  equityCents: number;
};

/** A virtual fill. No real order exists behind it. */
export type VirtualFill = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  priceCents: number;
  feeCents: number;
  /** The execution model that produced the fill, e.g. `"virtual-execution-v1"`. */
  executionModel: string;
};

/** One step of the evidence behind a decision. */
export type EvidenceStep = {
  step: number;
  /** What kind of step this is, e.g. `"observation"`, `"assertions"`, `"decision"`. */
  kind: string;
  summary: string;
};

/** The work a variant is being asked to do now. */
export type Cycle = {
  /**
   * Identifies this cycle. Pass it back unchanged in `recordRun()`; recording the same key twice
   * records one run.
   */
  key: string;
  symbol: string;
  /** Every bar the variant may see for this cycle. Nothing later exists yet. */
  bars: Bar[];
};

/** What a variant decided in one cycle. */
export type RunReport = {
  /** The `key` of the cycle this run answers. */
  cycleKey: string;
  /** The agent inside the variant that acted, e.g. `"trade-evaluator"`. */
  agent: string;
  /**
   * How the cycle ended. `"decided"` when a decision was reached (including a decision to hold);
   * otherwise why not.
   */
  outcome: "decided" | "invalid_output" | "stale_evidence" | "refused" | "budget_exhausted" | "error";
  /** The decision in one phrase, e.g. `"price.breakout -> buy"`. */
  decision: string;
  /** The order the variant wants, or null to trade nothing. It is checked against risk limits before any fill. */
  orderIntent: { symbol: string; side: "buy" | "sell"; quantity: number } | null;
  evidence: EvidenceStep[];
  /** What this cycle cost to run, in USD micro-dollars, by source. Omit when nothing was spent. */
  cost?: { model?: number; data?: number; other?: number };
};

/** A recorded run. */
export type Run = RunReport & {
  id: string;
  studyId: string;
  variant: string;
  revision: RevisionRef & { contentHash: string };
  recordedAt: string;
  /** Why the order intent was not filled, when it was not. */
  riskRejection: string | null;
  fill: VirtualFill | null;
};

/** A study: a frozen comparison of revisions, each trading its own virtual portfolio. */
export type Study = {
  id: string;
  name: string;
  number: number;
  status: "active" | "stopped";
  startingCapital: { currency: string; amountCents: number };
  executionModel: string;
  variants: { label: string; revision: RevisionRef & { contentHash: string } }[];
  /** The study this one replaced, if any. */
  supersedes: string | null;
};

/** How two variants of one study compare over the cycles both received. */
export type Comparison = {
  variants: [string, string];
  /** Cycles both variants recorded a run for. Only these are compared. */
  sharedCycles: number;
  /** Each variant's change in equity over the shared cycles, in cents. */
  equityChangeCents: [number, number];
  /** Each variant's operating cost over the shared cycles, in USD micro-dollars. */
  costMicroUsd: [number, number];
  /**
   * `"insufficient_sample"` and `"inconclusive"` mean there is no winner. A `favours_` outcome is
   * only reported once the reviewers' thresholds are set.
   */
  outcome: "invalid" | "incomplete" | "insufficient_sample" | "inconclusive" | "favours_first" | "favours_second";
  /** Always `"virtual"`: these are simulated results, never live performance. */
  recordClass: "virtual";
};

/** What one agent did, for one revision or across all of them. These are virtual results, never ranked. */
export type AgentSummary = {
  agent: string;
  /** The revision this row covers, or null for all revisions together. */
  revision: (RevisionRef & { contentHash: string }) | null;
  cycles: number;
  /** Cycles by `outcome`. */
  outcomes: { [outcome: string]: number };
  /** Decided cycles by what was decided: the part after `->`, e.g. `{ buy: 3, hold: 40, blocked: 1 }`. */
  decisions: { [decision: string]: number };
  /** Cycles that asked for an order. */
  orders: number;
  /** Order intents the risk gate refused. */
  riskRejections: number;
  fills: number;
  /** Simulated fees on those fills, in cents. */
  feesCents: number;
  /**
   * The virtual equity change, in cents, of every study variant that ran this agent's revisions. A
   * variant runs one revision, so its whole change counts toward that revision.
   */
  equityChangeCents: number;
  /** What the agent said its cycles cost, in USD micro-dollars. Reported by the agent, not metered. */
  reportedCostMicroUsd: number;
  /** ISO-8601 time of the latest run counted. */
  asOf: string | null;
  recordClass: "virtual";
};

/** A variant's health: whether it is keeping up with the market sessions it may run. */
export type VariantHealth = {
  label: string;
  status: "active" | "paused" | "retired";
  /** The variant's latest recorded cycle key, if any. */
  lastCycle: string | null;
  /** The newest session that has closed. */
  latestSession: string | null;
  /** Closed sessions this variant has not run yet. More than one means it has fallen behind. */
  cyclesBehind: number;
  /** Approved orders still waiting for the next open. */
  workingOrders: number;
};

/** Something about a study a person should look at. */
export type StudyAlert = {
  severity: "P2" | "P3" | "P4";
  kind: "falling_behind" | "agent_failure" | "stale_evidence" | "risk_refusals" | "paused" | "retired";
  variant: string;
  detail: string;
};

/** One study at a glance. */
export type StudyOverview = {
  study: Study;
  /** ISO-8601 time the study was created. */
  createdAt: string;
  health: VariantHealth[];
  alerts: StudyAlert[];
  variants: {
    label: string;
    revision: RevisionRef & { contentHash: string };
    /** Virtual equity now, in cents. */
    equityCents: number;
    /** Virtual equity now minus the starting capital, in cents. */
    changeCents: number;
    /** Runs recorded. */
    runs: number;
  }[];
};

/** A variant's virtual equity at the close of one cycle it ran. */
export type EquityPoint = {
  /** The cycle's session, e.g. `"2026-06-26"`. */
  session: string;
  equityCents: number;
};

/** Options for reading runs, newest first. */
export type RunQuery = {
  /** At most this many runs. Default 50, maximum 200. */
  limit?: number;
  /** Only runs recorded before this run id, for paging. */
  before?: string;
};

/**
 * One study variant: the only thing a trading agent running in a study can reach.
 *
 * Each cycle: call `nextCycle()`, decide from its bars, then `recordRun()` once. The variant's
 * portfolio changes only through fills the lab makes from recorded runs. An approved order fills at
 * the next session's open, so its fill appears on the run only after a later `nextCycle()`.
 */
export interface StudyVariant {
  /** The study, this variant's label, and the exact revision it must be running. */
  describe(): Promise<{ study: Study; label: string; revision: RevisionRef & { contentHash: string } }>;

  /**
   * The cycle waiting for this variant, or null when there is nothing to do: the next session has
   * not closed yet, or this variant's last run is still waiting to be recorded. Calling it again
   * before `recordRun()` returns the same cycle.
   */
  nextCycle(): Promise<Cycle | null>;

  /** This variant's virtual portfolio as of its latest recorded run. */
  portfolio(): Promise<Portfolio>;

  /**
   * Records what this variant decided for a cycle and returns the run. An order intent that breaks
   * a risk limit is recorded with `riskRejection` set and no fill.
   *
   * Recording waits for the workspace to allow it. Until then the returned run's `id` starts with
   * `"pending:"`, `runs()` lists it that way, and `nextCycle()` returns null. A workspace can allow
   * every run to be recorded without asking each time.
   *
   * Safe to repeat: the same `cycleKey` returns the run already recorded and changes nothing.
   *
   * Throws if `cycleKey` is not this variant's current or an earlier cycle, or if the study has
   * stopped.
   */
  recordRun(report: RunReport): Promise<Run>;

  /** This variant's own runs, newest first. */
  runs(query?: RunQuery): Promise<Run[]>;
}

/** One study, read-only: for comparison views. */
export interface StudyReader {
  describe(): Promise<Study>;

  /** Each variant's virtual portfolio. */
  portfolios(): Promise<{ label: string; portfolio: Portfolio }[]>;

  /**
   * Compares two variants over the cycles both received.
   *
   * Throws if either label is not a variant of this study.
   */
  compare(first: string, second: string): Promise<Comparison>;

  /** Runs of this study, newest first. `variant` limits them to one variant. */
  runs(query?: RunQuery & { variant?: string }): Promise<Run[]>;
}

/** Every revision of one named artifact, read-only: for review views. */
export interface RevisionLineage {
  /** All published revisions of this name, lowest number first. */
  list(): Promise<Revision[]>;

  /** One revision. Throws if that number was never published. */
  get(number: number): Promise<Revision>;

  /** The files of one revision. Throws if that number was never published. */
  files(number: number): Promise<RevisionFile[]>;

  /**
   * How revision `number` differs from `against`, or from the previous published number when
   * `against` is omitted.
   *
   * Not available yet: always throws `"Not available yet"`.
   */
  diff(number: number, against?: number): Promise<RevisionDiff>;

  /**
   * Runs that executed one revision, across every study, newest first.
   *
   * Not available yet: always throws `"Not available yet"`.
   */
  runs(number: number, query?: RunQuery): Promise<Run[]>;
}

/** Everything published to the lab, read-only: for inventory views. */
export interface RevisionCatalog {
  /**
   * Every published artifact, ordered by kind then name, each with its newest revision. `kind`
   * limits the list to one kind.
   */
  list(kind?: RevisionRef["kind"]): Promise<CatalogEntry[]>;

  /** All published revisions of one artifact, lowest number first, with the studies that use each. */
  revisions(kind: RevisionRef["kind"], name: string): Promise<Revision[]>;

  /** The files of one revision. Throws if that revision was never published. */
  files(kind: RevisionRef["kind"], name: string, number: number): Promise<RevisionFile[]>;
}

/** Experiments and agents across the whole lab, read-only: for analytics views. */
export interface LabAnalytics {
  /** Every study, newest first, with its health, alerts, and each variant's equity. */
  studies(): Promise<StudyOverview[]>;

  /**
   * Each variant's equity at the close of every cycle it ran, oldest first.
   *
   * Throws if the study does not exist.
   */
  equity(studyId: string): Promise<{ label: string; points: EquityPoint[] }[]>;

  /** Every agent that has recorded runs, by name, with how many. */
  agents(): Promise<{ agent: string; runs: number }[]>;

  /**
   * One row for the agent across all its revisions, then one row per revision, lowest number first.
   * `from` and `to` are ISO-8601 times that limit which runs count. An agent with no runs gets one
   * empty row.
   */
  agent(agent: string, options?: { from?: string; to?: string }): Promise<AgentSummary[]>;
}
