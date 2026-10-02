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

/** What one agent did, for one revision or across all of them. */
export type AgentSummary = {
  agent: string;
  /** The revision this row covers, or null for all revisions together. */
  revision: RevisionRef | null;
  cycles: number;
  /** Cycles by `outcome`. */
  outcomes: { [outcome: string]: number };
  /** Decided cycles by what was decided, e.g. `{ buy: 3, hold: 40, blocked: 1 }`. */
  decisions: { [decision: string]: number };
  /** Order intents the risk gate rejected. */
  riskRejections: number;
  costMicroUsd: number;
  /** ISO-8601 time of the latest run counted. */
  asOf: string | null;
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
 * Not available yet: every method always throws `"Not available yet"`.
 *
 * Each cycle: call `nextCycle()`, decide from its bars, then `recordRun()` once. The variant's
 * portfolio changes only through fills the lab makes from recorded runs.
 */
export interface StudyVariant {
  /** The study, this variant's label, and the exact revision it must be running. */
  describe(): Promise<{ study: Study; label: string; revision: RevisionRef & { contentHash: string } }>;

  /**
   * The cycle waiting for this variant, or null when there is nothing to do. Calling it again
   * before `recordRun()` returns the same cycle.
   */
  nextCycle(): Promise<Cycle | null>;

  /** This variant's virtual portfolio as of its latest recorded run. */
  portfolio(): Promise<Portfolio>;

  /**
   * Records what this variant decided for a cycle and returns the stored run, including any
   * virtual fill. An order intent that breaks a risk limit is recorded with `riskRejection` set and
   * no fill.
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

  /**
   * Each variant's virtual portfolio.
   *
   * Not available yet: always throws `"Not available yet"`.
   */
  portfolios(): Promise<{ label: string; portfolio: Portfolio }[]>;

  /**
   * Compares two variants over the cycles both received.
   *
   * Throws if either label is not a variant of this study.
   *
   * Not available yet: always throws `"Not available yet"`.
   */
  compare(first: string, second: string): Promise<Comparison>;

  /**
   * Runs of this study, newest first. `variant` limits them to one variant.
   *
   * Not available yet: always throws `"Not available yet"`.
   */
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

/**
 * One agent's analytics, read-only: for agent views.
 *
 * Not available yet: every method always throws `"Not available yet"`.
 */
export interface AgentAnalytics {
  /** One row for the agent across all revisions, then one row per revision, lowest number first. */
  summary(options?: { from?: string; to?: string }): Promise<AgentSummary[]>;

  /** The agent's runs, newest first. `revision` limits them to one revision number. */
  runs(query?: RunQuery & { revision?: number }): Promise<Run[]>;
}
