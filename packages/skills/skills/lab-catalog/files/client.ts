// The catalog page. `gadget` is the stub the Workshop injects for this iframe.
import { type CatalogEntry, formatTime, groupByKind, type Kind, shortHash } from "./lib/catalog.ts";

type Revision = CatalogEntry["latest"] & { studies: { studyId: string; label: string }[] };

declare const gadget: {
  catalog(): Promise<{ bound: boolean; entries: CatalogEntry[] }>;
  revisions(kind: Kind, name: string): Promise<Revision[]>;
  files(kind: Kind, name: string, number: number): Promise<{ path: string; text: string }[]>;
};

document.body.style.cssText = "font: 14px/1.5 system-ui, sans-serif; margin: 16px; color: #1c1a18";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, css?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

function table(headers: string[], rows: { cells: string[]; onClick?: () => void }[]): HTMLTableElement {
  const t = el("table", undefined, "border-collapse: collapse; margin: 8px 0 20px; width: 100%");
  const head = t.insertRow();
  for (const label of headers) head.append(el("th", label, "text-align: left; padding: 4px 12px; border-bottom: 1px solid #ddd"));
  for (const row of rows) {
    const tr = t.insertRow();
    if (row.onClick) {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", row.onClick);
    }
    for (const value of row.cells) tr.insertCell().append(el("span", value, "padding: 4px 12px; display: block"));
  }
  return t;
}

function show(...nodes: Node[]): void {
  document.body.replaceChildren(...nodes);
}

function failure(error: unknown): HTMLElement {
  return el("p", error instanceof Error ? error.message : String(error), "color: #b42318");
}

async function showCatalog(): Promise<void> {
  try {
    const { bound, entries } = await gadget.catalog();
    if (!bound) {
      show(el("h1", "Lab Catalog", "font-size: 18px"),
        el("p", "Bind LAB_CATALOG to the trading lab connector's catalog to see what has been published."));
      return;
    }
    const groups = groupByKind(entries);
    show(el("h1", "Lab Catalog", "font-size: 18px"),
      ...(groups.length === 0 ? [el("p", "Nothing has been published to the lab yet.")] : []),
      ...groups.flatMap((group) => [
        el("h2", `${group.title} (${group.entries.length})`, "font-size: 15px; margin-top: 16px"),
        table(["Name", "Latest", "Revisions", "Hash", "Published by", "Published"], group.entries.map((entry) => ({
          cells: [entry.name, `#${entry.latest.number}`, String(entry.revisions), shortHash(entry.latest.contentHash),
            entry.latest.publishedBy, formatTime(entry.latest.publishedAt)],
          onClick: () => void showRevisions(entry.kind, entry.name),
        }))),
      ]));
  } catch (error) {
    show(el("h1", "Lab Catalog", "font-size: 18px"), failure(error));
  }
}

function back(label: string, to: () => void): HTMLButtonElement {
  const button = el("button", `← ${label}`, "margin-bottom: 12px");
  button.addEventListener("click", to);
  return button;
}

async function showRevisions(kind: Kind, name: string): Promise<void> {
  const heading = el("h1", `${kind}/${name}`, "font-size: 18px");
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
  const heading = el("h1", `${kind}/${name} #${number}`, "font-size: 18px");
  const toRevisions = back(`${name} revisions`, () => void showRevisions(kind, name));
  try {
    const files = await gadget.files(kind, name, number);
    show(toRevisions, heading, ...files.flatMap((file) => [
      el("h2", file.path, "font: 600 13px ui-monospace, monospace; margin-top: 16px"),
      el("pre", file.text, "background: #f6f5f3; padding: 12px; overflow: auto; max-height: 360px"),
    ]));
  } catch (error) {
    show(toRevisions, heading, failure(error));
  }
}

await showCatalog();
