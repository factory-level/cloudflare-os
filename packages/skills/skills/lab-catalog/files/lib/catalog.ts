// Pure presentation logic for the catalog view, kept apart from the gadget so it can be tested.

export type Kind = "skill" | "workflow" | "agent" | "strategy" | "view" | "brand";

export type CatalogEntry = {
  kind: Kind;
  name: string;
  revisions: number;
  latest: { number: number; contentHash: string; publishedBy: string; publishedAt: string };
};

/** The order kinds are shown in: what runs first, then what it is built from. */
export const KIND_ORDER: readonly Kind[] = ["workflow", "strategy", "agent", "skill", "view", "brand"];

export const KIND_TITLES: Record<Kind, string> = {
  workflow: "Workflows",
  strategy: "Strategies",
  agent: "Agents",
  skill: "Skills",
  view: "Views",
  brand: "Brands",
};

/** Groups entries by kind in `KIND_ORDER`, names sorted within each, omitting empty kinds. */
export function groupByKind(entries: CatalogEntry[]): { kind: Kind; title: string; entries: CatalogEntry[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    title: KIND_TITLES[kind],
    entries: entries.filter((e) => e.kind === kind).toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  })).filter((group) => group.entries.length > 0);
}

/** A short hash for display: the first twelve hex digits. */
export function shortHash(contentHash: string): string {
  return contentHash.replace(/^sha256:/, "").slice(0, 12);
}

/** A date for display, `YYYY-MM-DD HH:MM` in UTC; the input unchanged when it is not a date. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? iso : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
