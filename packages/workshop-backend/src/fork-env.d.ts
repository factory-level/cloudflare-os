// Fork-owned env declarations (see src/env-models.ts). Kept out of upstream env.d.ts.
// A global script declaration (no imports/exports), merged into the generated Cloudflare.Env.

declare namespace Cloudflare {
  interface Env {
    // Deployment-wide Anthropic key; when set, an env-sourced Anthropic model is offered first.
    ANTHROPIC_API_KEY?: string;
    // Model ID for that env-sourced model (default claude-sonnet-5-5).
    ANTHROPIC_MODEL?: string;
  }
}
