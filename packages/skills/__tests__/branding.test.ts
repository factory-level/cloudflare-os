// The pentacles look stays in one place: `packages/workshop-shared/src/branding.json`. Stylesheets,
// the favicon, the bundled blueprints and the lab views cannot import it, so they carry its accent as
// a literal. This checks every copy matches it and that none of the upstream orange accent is left.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packages = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, packages), "utf8");
const { accentColor } = JSON.parse(read("workshop-shared/src/branding.json")) as { accentColor: string };

/** The upstream accent and its shades, which pentacles replaces. Status and vendor colours are not here. */
const UPSTREAM_ORANGE = [
  "#ff4801", "#e03f00", "#ff7038", "#ff8a5c", "#b84e00", "#a54200", "#ffe9e0", "#ff500a", "#ffa683",
  "#b13200", "#f6821f", "#ff6633", "#fbad41", "#e1632e",
];

const STYLESHEETS = [
  "workshop-frontend/src/styles.css",
  "gatekeeper-context/app/styles.css",
  "gatekeeper-scheduler/app/styles.css",
];
const BLUEPRINTS = [
  "bundled-blueprints/blueprints/workspace-docs/files/client.ts",
  "bundled-blueprints/blueprints/workspace-sheets/files/client.ts",
  "bundled-blueprints/blueprints/workspace-sheets/files/server.ts",
  "bundled-blueprints/blueprints/workspace-slides/files/client.ts",
  "bundled-blueprints/blueprints/workspace-slides/files/server.ts",
];
const VIEWS = readdirSync(new URL("skills/skills/", packages))
  .filter((name) => readdirSync(new URL(`skills/skills/${name}/files/`, packages)).includes("client.ts"));

function leftovers(text: string): string[] {
  const lower = text.toLowerCase();
  return UPSTREAM_ORANGE.filter((hex) => new RegExp(`${hex}(?![0-9a-f])`).test(lower));
}

describe("pentacles branding", () => {
  it("uses the branded accent as each stylesheet's light-mode brand", () => {
    for (const path of STYLESHEETS) {
      const css = read(path);
      expect(/--color-kumo-brand:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1], path).toBe(accentColor);
      expect(leftovers(css), path).toEqual([]);
    }
  });

  it("draws the favicon in the accent", () => {
    const svg = read("workshop-frontend/public/favicon.svg");
    expect(svg).toContain(`stroke="${accentColor}"`);
    expect(leftovers(svg)).toEqual([]);
  });

  it("leaves no upstream orange in the bundled blueprints", () => {
    for (const path of BLUEPRINTS) expect(leftovers(read(path)), path).toEqual([]);
    expect(read(BLUEPRINTS[0] as string)).toContain(`--accent: ${accentColor};`);
  });

  it("gives every lab view the same theme, in the accent, and no colours of its own", () => {
    const [first, ...rest] = VIEWS.map((name) => read(`skills/skills/${name}/files/lib/theme.ts`));
    expect(first).toContain(`export const ACCENT = "${accentColor}";`);
    for (const theme of rest) expect(theme).toBe(first);
    for (const name of VIEWS) {
      const client = read(`skills/skills/${name}/files/client.ts`);
      expect(client, name).toContain('import { THEME_CSS } from "./lib/theme.ts";');
      expect(client.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [], name).toEqual([]);
    }
  });
});
