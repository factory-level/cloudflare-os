// Fork-owned deployment branding (see _docs/architecture/pentacles-branding.md).
//
// The values live in branding.json so the deliverable can be rebranded without touching code. The
// backend uses them as the admin-config defaults, and the frontend applies them before the server
// config arrives, so the first paint is already branded.

import branding from "./branding.json" with { type: "json" };

/** The site name a deployment shows when no admin has saved a custom one. */
export const BRANDING_SITE_NAME: string = branding.siteName;

/** The accent seed color a deployment uses when no admin has saved a custom one. */
export const BRANDING_ACCENT_COLOR: string = branding.accentColor;
