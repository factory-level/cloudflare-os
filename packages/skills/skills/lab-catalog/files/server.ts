// The view's Durable Object. It keeps no state: every method reads the lab through the
// `LAB_CATALOG` binding, which records each read as an observation.
import { DurableObject } from "cloudflare:workers";
import type { CatalogEntry, Kind } from "./lib/catalog.ts";

type Revision = {
  kind: Kind;
  name: string;
  number: number;
  contentHash: string;
  pins: { kind: Kind; name: string; number: number; contentHash: string }[];
  publishedBy: string;
  publishedAt: string;
  studies: { studyId: string; label: string }[];
};
type RevisionFile = { path: string; text: string };

/** The part of the lab connector's `RevisionCatalog` this view uses. */
interface RevisionCatalog {
  list(kind?: Kind): Promise<CatalogEntry[]>;
  revisions(kind: Kind, name: string): Promise<Revision[]>;
  files(kind: Kind, name: string, number: number): Promise<RevisionFile[]>;
}

interface Env {
  LAB_CATALOG?: RevisionCatalog;
}

export class Gadget extends DurableObject<Env> {
  /** Everything published, or `bound: false` when no lab catalog is bound yet. */
  async catalog(): Promise<{ bound: boolean; entries: CatalogEntry[] }> {
    if (!this.env.LAB_CATALOG) return { bound: false, entries: [] };
    return { bound: true, entries: await this.env.LAB_CATALOG.list() };
  }

  /** Every revision of one artifact, with the studies that use each. */
  async revisions(kind: Kind, name: string): Promise<Revision[]> {
    if (!this.env.LAB_CATALOG) throw new Error("Bind LAB_CATALOG to the trading lab first.");
    return await this.env.LAB_CATALOG.revisions(kind, name);
  }

  /** The files of one revision. */
  async files(kind: Kind, name: string, number: number): Promise<RevisionFile[]> {
    if (!this.env.LAB_CATALOG) throw new Error("Bind LAB_CATALOG to the trading lab first.");
    return await this.env.LAB_CATALOG.files(kind, name, number);
  }
}
