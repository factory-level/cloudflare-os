// The fixed ports and names the local demo uses, in one place.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The `@gadgets/cli` package directory. */
export const CLI_PACKAGE_DIR: string = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Repository root. */
export const REPO_ROOT: string = resolve(CLI_PACKAGE_DIR, "..", "..");

export const DEMO = {
  /** The mock Access edge: the prod-sim's public origin. */
  edgePort: portFromEnv("GADGETS_DEMO_EDGE_PORT", 18790),
  /** The prod-sim Workshop itself, reachable only through the edge in the demo. */
  prodSimPort: portFromEnv("GADGETS_DEMO_PROD_SIM_PORT", 18791),
  /** The prod-sim's inspector, clear of the dev server's 9229. */
  inspectorPort: portFromEnv("GADGETS_DEMO_INSPECTOR_PORT", 19239),
  /** `CF_ACCESS_AUD` for the prod-sim. */
  audience: "gadgets-prod-sim",
  /** Prod-sim admins; must be allowed by the policy to sign in at all. */
  admins: ["admin@demo.local"],
} as const;

/** The policy file the edge reads: `$GADGETS_DEMO_POLICY`, else `policy.json` in the package. */
export function policyPath(): string {
  return process.env.GADGETS_DEMO_POLICY ?? join(CLI_PACKAGE_DIR, "policy.json");
}

/** Where the prod-sim keeps its generated config, frontend build and state. */
export const PROD_SIM_DIR: string = join(CLI_PACKAGE_DIR, ".prod-sim");

function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}
