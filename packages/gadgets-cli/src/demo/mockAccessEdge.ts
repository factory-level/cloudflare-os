#!/usr/bin/env node
// Runs the mock Access edge on its own: `pnpm --filter @gadgets/cli demo:edge`.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CLI_PACKAGE_DIR, DEMO, policyPath } from "./demoConfig.ts";
import { policyFromFile, startAccessEdge } from "./accessEdge.ts";

if (!existsSync(policyPath())) {
  copyFileSync(join(CLI_PACKAGE_DIR, "src", "demo", "policy.example.json"), policyPath());
}
const edge = await startAccessEdge({
  port: DEMO.edgePort,
  upstream: `http://127.0.0.1:${DEMO.prodSimPort}`,
  audience: DEMO.audience,
  policy: policyFromFile(policyPath()),
});
console.log(`mock Access edge on ${edge.origin} -> 127.0.0.1:${DEMO.prodSimPort} (policy: ${policyPath()})`);
