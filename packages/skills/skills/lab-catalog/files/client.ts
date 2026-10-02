// The catalog page. `gadget` is the stub the Workshop injects for this iframe.
import { type CatalogEntry, formatTime, groupByKind, type Kind, shortHash } from "./lib/catalog.ts";
import { THEME_CSS } from "./lib/theme.ts";

type Revision = CatalogEntry["latest"] & { studies: { studyId: string; label: string }[] };

declare const gadget: {
  catalog(): Promise<{ bound: boolean; entries: CatalogEntry[] }>;
  revisions(kind: Kind, name: string): Promise<Revision[]>;
  files(kind: Kind, name: string, number: number): Promise<{ path: string; text: string }[]>;
};

const theme = document.createElement("style");
theme.textContent = THEME_CSS;
document.head.append(theme);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function table(headers: string[], rows: { cells: string[]; onClick?: () => void }[]): HTMLTableElement {
  const t = el("table");
  const head = t.insertRow();
  for (const label of headers) head.append(el("th", label));
  for (const row of rows) {
    const tr = t.insertRow();
    if (row.onClick) {
      tr.className = "row-link";
      tr.addEventListener("click", row.onClick);
    }
    for (const value of row.cells) tr.insertCell().append(value);
  }
  return t;
}

function show(...nodes: Node[]): void {
  document.body.replaceChildren(...nodes);
}

function failure(error: unknown): HTMLElement {
  return el("p", error instanceof Error ? error.message : String(error), "error");
}

async function showCatalog(): Promise<void> {
  try {
    const { bound, entries } = await gadget.catalog();
    if (!bound) {
      show(el("h1", "Lab Catalog"),
        el("p", "Bind LAB_CATALOG to the trading lab connector's catalog to see what has been published."));
      return;
    }
    const groups = groupByKind(entries);
    show(el("h1", "Lab Catalog"),
      ...(groups.length === 0 ? [el("p", "Nothing has been published to the lab yet.")] : []),
      ...groups.flatMap((group) => [
        el("h2", `${group.title} (${group.entries.length})`),
        table(["Name", "Latest", "Revisions", "Hash", "Published by", "Published"], group.entries.map((entry) => ({
          cells: [entry.name, `#${entry.latest.number}`, String(entry.revisions), shortHash(entry.latest.contentHash),
            entry.latest.publishedBy, formatTime(entry.latest.publishedAt)],
          onClick: () => void showRevisions(entry.kind, entry.name),
        }))),
      ]));
  } catch (error) {
    show(el("h1", "Lab Catalog"), failure(error));
  }
}

function back(label: string, to: () => void): HTMLParagraphElement {
  const link = el("a", `← ${label}`);
  link.addEventListener("click", to);
  const p = el("p");
  p.append(link);
  return p;
}

async function showRevisions(kind: Kind, name: string): Promise<void> {
  const heading = el("h1", `${kind}/${name}`);
  try {
    const revisions = await gadget.revisions(kind, name);
    show(back("Catalog", () => void showCatalog()), heading,
      table(["Revision", "Hash", "Published by", "Published", "Studies"], revisions.toReversed().map((r) => ({
        cells: [`#${r.number}`, shortHash(r.contentHash), r.publishedBy, formatTime(r.publishedAt),
          r.studies.map((s) => `${s.studyId} (${s.label})`).join(", ") || "none"],
        onClick: () => void showFiles(kind, name, r.number),
      }))));
  } catch (error) {
    show(back("Catalog", () => void showCatalog()), heading, failure(error));
  }
}

async function showFiles(kind: Kind, name: string, number: number): Promise<void> {
  const heading = el("h1", `${kind}/${name} #${number}`);
  const toRevisions = back(`${name} revisions`, () => void showRevisions(kind, name));
  try {
    const files = await gadget.files(kind, name, number);
    show(toRevisions, heading, ...files.flatMap((file) => [
      el("h2", file.path, "mono"),
      el("pre", file.text),
    ]));
  } catch (error) {
    show(toRevisions, heading, failure(error));
  }
}

await showCatalog();
