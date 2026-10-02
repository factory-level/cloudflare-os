// The analytics view's Durable Object. It keeps no state: every method reads through the
// `LAB_ANALYTICS` binding, which records each read as an observation.
import { DurableObject } from "cloudflare:workers";
import type { AgentSummary, EquitySeries, StudyOverview } from "./lib/analytics.ts";

/** The lab connector's `LabAnalytics`. */
interface LabAnalytics {
  studies(): Promise<StudyOverview[]>;
  equity(studyId: string): Promise<EquitySeries[]>;
  agents(): Promise<{ agent: string; runs: number }[]>;
  agent(agent: string, options?: { from?: string; to?: string }): Promise<AgentSummary[]>;
}

interface Env {
  LAB_ANALYTICS?: LabAnalytics;
}

export class Gadget extends DurableObject<Env> {
  /** Whether `LAB_ANALYTICS` is bound. Every other method throws when it is not. */
  async bound(): Promise<boolean> {
    return this.env.LAB_ANALYTICS !== undefined;
  }

  async studies(): Promise<StudyOverview[]> {
    return this.#lab().studies();
  }

  async equity(studyId: string): Promise<EquitySeries[]> {
    return this.#lab().equity(studyId);
  }

  async agents(): Promise<{ agent: string; runs: number }[]> {
    return this.#lab().agents();
  }

  async agent(agent: string, options?: { from?: string; to?: string }): Promise<AgentSummary[]> {
    return this.#lab().agent(agent, options);
  }

  #lab(): LabAnalytics {
    const lab = this.env.LAB_ANALYTICS;
    if (!lab) throw new Error("Bind LAB_ANALYTICS to the trading lab to see its studies and agents.");
    return lab;
  }
}
