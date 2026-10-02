---
title: Pentacles Branding
status: draft
covers:
  - packages/workshop-shared/src/branding.json
  - packages/workshop-shared/src/branding.ts
  - packages/skills/__tests__/branding.test.ts
  - packages/skills/vitest.config.ts
  - packages/skills/tsconfig.tests.json
  - packages/skills/skills/lab-catalog/files/lib/theme.ts
  - packages/skills/skills/study-console/files/lib/theme.ts
  - packages/skills/skills/breakout-workflow/files/lib/theme.ts
  - packages/skills/skills/momentum-signal/files/lib/theme.ts
  - packages/skills/skills/lab-analytics/files/lib/theme.ts
touchpoints:
  - packages/workshop-shared/package.json
  - packages/workshop-shared/src/api.ts
  - packages/workshop-backend/src/admin-config.ts
  - packages/workshop-backend/__tests__/admin-config.test.ts
  - packages/workshop-frontend/src/main.tsx
  - packages/workshop-frontend/src/theme.ts
  - packages/workshop-frontend/src/styles.css
  - packages/workshop-frontend/src/useWorkspaceOpen.test.tsx
  - packages/workshop-frontend/vite.config.ts
  - packages/workshop-frontend/public/favicon.svg
  - packages/gatekeeper-kit/src/connect-pages.ts
  - packages/gatekeeper-context/app/styles.css
  - packages/gatekeeper-scheduler/app/styles.css
  - packages/bundled-blueprints/blueprints/workspace-docs/files/client.ts
  - packages/bundled-blueprints/blueprints/workspace-sheets/files/client.ts
  - packages/bundled-blueprints/blueprints/workspace-sheets/files/server.ts
  - packages/bundled-blueprints/blueprints/workspace-slides/files/client.ts
  - packages/bundled-blueprints/blueprints/workspace-slides/files/server.ts
  - packages/bundled-blueprints/blueprints/workspace-slides/files/README.md
updated: 2026-10-02
---

# Pentacles Branding

## Overview

This deployment is branded **pentacles**: the site name `pentacles` and the emerald accent `#047857` in place of Cloudflare OS and its orange `#ff4801`. Both values live in `packages/workshop-shared/src/branding.json`. Everything a person sees follows them: the Workshop, its favicon and page title, the connect pages connectors show, the context library and scheduler apps, the bundled Docs, Sheets and Slides blueprints, and the lab views in `packages/skills`.

Code that can import TypeScript reads the JSON. Stylesheets, the favicon, the bundled blueprints and the lab views cannot, so they carry the accent and its shades as literals. A test keeps every literal equal to the JSON.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/workshop-shared/src/branding.json` | The site name and accent. Change these two values to rebrand, then rebuild |
| `packages/workshop-shared/src/branding.ts` | Exports them as `BRANDING_SITE_NAME` and `BRANDING_ACCENT_COLOR` through `@gadgets/workshop-shared/branding` |
| `packages/skills/skills/*/files/lib/theme.ts` | The lab views' stylesheet, one identical copy per view: the Workshop's palette and type in light and dark mode, the accent, chart series colours, and gain, loss, hold and warning colours. Each view's page adds `THEME_CSS` to its `<head>` |
| `packages/skills/__tests__/branding.test.ts` | Fails when a stylesheet's light-mode brand differs from the JSON's accent, the favicon is not drawn in it, a lab view's theme copy differs or is not added, a view sets its own colours, or any of the upstream orange accent shades remains in the files below |

## Data and Control Flow

- **Defaults.** `DEFAULT_ADMIN_CONFIG` and `DEFAULT_SITE_NAME` take their values from the JSON. `normalizeAdminConfig` falls back to them when the saved site name or accent is empty, so a fresh instance needs no admin setup. Clearing either field in `/admin` brings back pentacles; a custom value an admin saves still wins.
- **First paint.** `main.tsx` applies the accent before the server's configuration arrives. The Vite `branded-title` plugin writes the site name into `index.html`'s `<title>`. `applyAccentColor("")` uses the branded accent rather than clearing to the base theme.
- **Stylesheet fallbacks.** `workshop-frontend`, `gatekeeper-context` and `gatekeeper-scheduler` stylesheets set the emerald scale as their base brand tokens (`--color-kumo-brand`, `--text-color-kumo-link`, `--color-accent-*`, selection, and accent shadows), light and dark. Before, only the runtime accent covered them, and the shadow tokens stayed orange.
- **Connect pages.** `PAGE_STYLE` in `gatekeeper-kit` interpolates the accent, and in dark mode darkens it to lightness 0.45, the same as the Workshop's accent helper.
- **Bundled blueprints.** Docs and Sheets use the accent for `--accent` and their tints. Slides maps its palette onto emerald: Tangerine `#047857`, Ruby `#0F766E`, Mango `#34D399`, the cover gradient onto emerald shades, and its editor's warm cream and brown neutrals onto near-neutral greys of the same lightness.
- **Lab views.** `lab-catalog`, `study-console`, `breakout-workflow`, `momentum-signal` and `lab-analytics` style themselves only through `THEME_CSS`. The one inline colour left is a chart legend swatch, which takes its series' colour.

## Configuration

| Setting | Effect |
| --- | --- |
| `packages/workshop-shared/src/branding.json` `siteName` | The name shown when no admin has saved one |
| `packages/workshop-shared/src/branding.json` `accentColor` | The accent seed when no admin has saved one. Changing it also requires updating the literals the branding test lists, which the test then confirms |
| Admin settings (`/admin`) | A saved name or accent overrides the JSON. Empty means the JSON's value |

## Upstream Touchpoints

| Upstream file | Edit | Why it could not be a net-new file |
| --- | --- | --- |
| `packages/workshop-shared/package.json` | Exports `./branding` | Packages import shared code only through these exports |
| `packages/workshop-shared/src/api.ts` | `DEFAULT_SITE_NAME` is the branded name | Every caller reads the default from here |
| `packages/workshop-backend/src/admin-config.ts` | Branded defaults, and empty saved values fall back to them | The admin config's defaults and normalization live here |
| `packages/workshop-backend/__tests__/admin-config.test.ts` | Tests for the branded defaults | Beside the tests of the same function |
| `packages/workshop-frontend/src/main.tsx` | Applies the accent before the configuration loads | The first paint happens here |
| `packages/workshop-frontend/src/theme.ts` | The default accent is the branded one | The admin picker and accent helper read it here |
| `packages/workshop-frontend/src/styles.css` | Emerald base brand tokens | The tokens are defined only here |
| `packages/workshop-frontend/src/useWorkspaceOpen.test.tsx` | Expects the branded title | It asserted the upstream name |
| `packages/workshop-frontend/vite.config.ts` | The `branded-title` plugin | `index.html`'s title is static |
| `packages/workshop-frontend/public/favicon.svg` | Emerald stroke, `pentacles` label | The file is served as is |
| `packages/gatekeeper-kit/src/connect-pages.ts` | `PAGE_STYLE` uses the accent | Every connector's connect page uses this style |
| `packages/gatekeeper-context/app/styles.css`, `packages/gatekeeper-scheduler/app/styles.css` | Emerald base brand tokens | Each app defines its own tokens |
| `packages/bundled-blueprints/blueprints/workspace-docs/files/client.ts`, `workspace-sheets/files/client.ts`, `workspace-sheets/files/server.ts` | Emerald accent and tints | Each blueprint is self-contained and cannot import the JSON |
| `packages/bundled-blueprints/blueprints/workspace-slides/files/client.ts`, `server.ts`, `README.md` | Emerald palette and neutral editor greys; the README's colour values | As above; the README documents the palette for agents |

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/workshop-shared/src/theme.ts` | `applyAccentColor`, which derives the runtime accent tokens from one seed |
| `packages/workshop-frontend/src/SandboxedGatekeeperApp.tsx` | Passing the saved accent to sandboxed gatekeeper apps, which therefore follow the branded default |

## Divergences from Design

No design document exists for this topic.

- **Names kept for compatibility.** Slides keeps the tone names Tangerine, Ruby and Mango, the `coverOrange` background flag, and the `C.orange` token, because saved decks and agent-written slides use them. They now hold emerald and teal colours.
- **Colours left as they were:** status colours (danger, warning, success); syntax-highlighting and diff colours; third-party marks, including the Cloudflare connector's logo and the MCP portal's colour, which matches the Cloudflare Gateway glyph it shows.
- **Prose still names Cloudflare OS.** Connector descriptions and OAuth error pages in the upstream gatekeepers (`gatekeeper-github`, `-slack`, `-notion` and others) say "Cloudflare OS". They are text in many upstream files, not styling, and are not changed.

## Open Questions

- Whether the connectors' "Cloudflare OS" prose should read the branded name.
