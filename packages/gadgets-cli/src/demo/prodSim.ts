#!/usr/bin/env node
// `pnpm --filter @gadgets/cli demo:prod-sim`: a local stand-in for a production Workshop, behind
// the mock Access edge.
//
// It runs the real workshop-backend in Cloudflare Access mode -- the mode every released deployment
// runs in -- with the edge as its Access issuer, the Access-mode frontend build served as assets,
// and state of its own. Everything is generated under `.prod-sim/`, from the backend's checked-in
// wrangler.jsonc, so nothing in the upstream packages is edited and `pnpm dev-server` can run
// alongside it untouched.
//
// Only the backend runs: no router and no gatekeepers. A push needs neither -- the backend serves
// `/api` itself -- and leaving them out keeps the prod-sim's Worker names clear of the dev server's.

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { CLI_PACKAGE_DIR, DEMO, PROD_SIM_DIR, REPO_ROOT, policyPath } from "./demoConfig.ts";
import { policyFromFile, startAccessEdge } from "./accessEdge.ts";

const BACKEND_DIR = join(REPO_ROOT, "packages", "workshop-backend");
const FRONTEND_DIR = join(REPO_ROOT, "packages", "workshop-frontend");
const FRONTEND_OUT = join(PROD_SIM_DIR, "frontend");
const edgeOrigin = `http://127.0.0.1:${DEMO.edgePort}`;

mkdirSync(PROD_SIM_DIR, { recursive: true });
if (!existsSync(policyPath())) {
  copyFileSync(join(CLI_PACKAGE_DIR, "src", "demo", "policy.example.json"), policyPath());
  console.log(`created ${policyPath()} from policy.example.json`);
}

if (!process.argv.includes("--skip-frontend")) {
  console.log("building the Access-mode frontend ...");
  execFileSync(process.execPath, [
    "--input-type=module", "-e",
    `process.env.NODE_ENV='production'; await (await import('vite')).build({ build: { outDir: ${JSON.stringify(FRONTEND_OUT)}, emptyOutDir: true } })`,
  ], { cwd: FRONTEND_DIR, stdio: "inherit", env: { ...process.env, VITE_CF_ACCESS_MODE: "true" } });
}

// The backend's Worker, prebuilt by the same cached task the integration tests use, so Wrangler
// runs it as-is instead of invoking the package's pnpm-based build itself.
console.log("building workshop-backend ...");
execFileSync(join(REPO_ROOT, "node_modules", ".bin", "vp"),
    ["run", "--cache", "@gadgets/workshop-backend#build:integration-worker"],
    { cwd: REPO_ROOT, stdio: "inherit" });

// The backend's own config, re-rooted: paths resolve against the config file's directory, which is
// now .prod-sim/, so the entry point, build and assets are spelled absolutely.
const config = parse(readFileSync(join(BACKEND_DIR, "wrangler.jsonc"), "utf8"));
config.name = "workshop-backend-prod-sim";
config.main = join(BACKEND_DIR, config.main);
delete config.build;
config.vars = {
  ...config.vars,
  CF_ACCESS_AUD: DEMO.audience,
  CF_ACCESS_ISS: edgeOrigin,
  ADMINS: DEMO.admins,
  PUBLIC_BASE_URL: edgeOrigin,
};
config.assets = {
  directory: FRONTEND_OUT,
  not_found_handling: "single-page-application",
  run_worker_first: ["/api", "/api/*", "/blueprint-screenshot/*"],
};
// Named wrangler.dev.jsonc so the repository's ignore rules already cover it.
const configPath = join(PROD_SIM_DIR, "wrangler.dev.jsonc");
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`generated: ${configPath}`);

const edge = await startAccessEdge({
  port: DEMO.edgePort,
  upstream: `http://127.0.0.1:${DEMO.prodSimPort}`,
  audience: DEMO.audience,
  policy: policyFromFile(policyPath()),
});

const wranglerEntry = join(BACKEND_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const wrangler = spawn(process.execPath, [
  wranglerEntry, "dev", "-c", configPath,
  "--ip", "127.0.0.1", "--port", String(DEMO.prodSimPort),
  "--inspector-port", String(DEMO.inspectorPort),
  "--persist-to", join(PROD_SIM_DIR, "state"),
], { cwd: BACKEND_DIR, stdio: "inherit" });

console.log(`\nprod-sim: ${edge.origin} (mock Access edge) -> 127.0.0.1:${DEMO.prodSimPort} (workshop-backend, Access mode)`);
console.log(`policy:   ${policyPath()}  (edit to grant or revoke; takes effect immediately)`);

const stop = () => {
  wrangler.kill("SIGINT");
  edge.server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
wrangler.on("exit", code => {
  edge.server.close();
  process.exit(code ?? 0);
});
