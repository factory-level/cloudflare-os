// The pentacles look for a lab view: the Workshop's palette and type, applied to a Gadget page.
// Gadget pages do not receive the Workshop's stylesheet, so this mirrors it. Every lab view ships an
// identical copy; `packages/skills/__tests__/branding.test.ts` checks the copies match, that every
// view adds it, and that the accent is the deployment's branded one.

/** The deployment's accent, from `packages/workshop-shared/src/branding.json`. */
export const ACCENT = "#047857";

/** Categorical colours for chart series, accent first. Each stays legible in light and dark mode. */
export const SERIES = ["#047857", "#0891b2", "#7c3aed", "#65a30d", "#db2777", "#78716c"];

/** Colours with a meaning: gains and buys, losses and sells, holds, and anything blocked. */
export const SIGNAL = { gain: "#059669", loss: "#dc2626", neutral: "#a8a29e", warning: "#d97706" };

/** The stylesheet. Each page adds it to its `<head>` before rendering. */
export const THEME_CSS = `
:root {
  color-scheme: light dark;
  --font: "FT Kunst Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --base: #fcfcfb;
  --surface: #ffffff;
  --recessed: #f3f3f1;
  --line: #e8e7e4;
  --text: #1c1a18;
  --strong: #100f0d;
  --subtle: oklch(52% 0.006 60);
  --brand: ${ACCENT};
  --brand-soft: oklch(from ${ACCENT} 0.95 0.04 h);
  --danger: oklch(57.7% 0.245 27.325);
  --contrast: #14110f;
  --on-contrast: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --base: oklch(0.115 0.012 285);
    --surface: oklch(0.155 0.011 285);
    --recessed: oklch(0.19 0.012 285);
    --line: oklch(0.34 0.022 285);
    --text: oklch(0.92 0.01 285);
    --strong: oklch(0.97 0.006 285);
    --subtle: oklch(0.66 0.02 285);
    --brand: oklch(from ${ACCENT} 0.76 c h);
    --brand-soft: oklch(from ${ACCENT} 0.28 0.05 h);
    --danger: oklch(70.4% 0.191 22.216);
    --contrast: oklch(from ${ACCENT} 0.45 c h);
  }
}
body { font: 14px/1.5 var(--font); margin: 16px; background: var(--base); color: var(--text);
  -webkit-font-smoothing: antialiased; }
h1 { font-size: 18px; font-weight: 600; color: var(--strong); letter-spacing: -0.01em; margin: 0 0 4px; }
h2 { font-size: 15px; font-weight: 600; color: var(--strong); margin: 20px 0 6px; }
p { margin: 0 0 8px; }
a { color: var(--brand); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 20px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-weight: 500; font-size: 12px; color: var(--subtle); padding: 6px 10px;
  border-bottom: 1px solid var(--line); }
td { padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr.row-link { cursor: pointer; }
tr.row-link:hover td { background: var(--recessed); }
pre { font: 12px/1.5 var(--mono); background: var(--recessed); border: 1px solid var(--line);
  border-radius: 8px; padding: 12px; overflow: auto; max-height: 360px; }
code, .mono { font-family: var(--mono); font-size: 13px; }
input, select, button { font: inherit; color: inherit; }
input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
input:focus, select:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
button { background: var(--contrast); color: var(--on-contrast); border: 0; border-radius: 6px;
  padding: 5px 12px; cursor: pointer; }
nav { display: flex; gap: 16px; margin: 0 0 12px; }
nav strong { color: var(--strong); }
svg { color: var(--subtle); }
.muted { color: var(--subtle); }
.error { color: var(--danger); }
.gain { color: ${SIGNAL.gain}; }
.loss { color: ${SIGNAL.loss}; }
.pill { display: inline-block; padding: 0 8px; border-radius: 999px; background: var(--brand-soft);
  color: var(--brand); font-size: 12px; }
`;
