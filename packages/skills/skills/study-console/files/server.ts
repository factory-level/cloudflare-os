// The console's Durable Object. It keeps no state: every method reads the study through the
// `LAB_STUDY` binding, which records each read as an observation.
import { DurableObject } from "cloudflare:workers";
import type { Comparison, Portfolio, Run, Study } from "./lib/console.ts";

/** The part of the lab connector's `StudyReader` this console uses. */
interface StudyReader {
  describe(): Promise<Study>;
  portfolios(): Promise<{ label: string; portfolio: Portfolio }[]>;
  runs(query?: { limit?: number; before?: string; variant?: string }): Promise<Run[]>;
  compare(first: string, second: string): Promise<Comparison>;
}

interface Env {
  LAB_STUDY?: StudyReader;
}

export class Gadget extends DurableObject<Env> {
  /** The study, each variant's portfolio, and its latest runs; `bound: false` when nothing is bound. */
  async overview(): Promise<
    | { bound: false }
    | {
        bound: true;
        study: Study;
        portfolios: { label: string; portfolio: Portfolio }[];
        runs: Run[];
        comparison: Comparison | null;
      }
  > {
    const study = this.env.LAB_STUDY;
    if (!study) return { bound: false };
    const [described, portfolios, runs] = await Promise.all([
      study.describe(), study.portfolios(), study.runs({ limit: 200 }),
    ]);
    const [first, second] = described.variants;
    const comparison = first && second ? await study.compare(first.label, second.label) : null;
    return { bound: true, study: described, portfolios, runs, comparison };
  }
}
