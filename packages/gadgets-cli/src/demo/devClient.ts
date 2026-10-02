#!/usr/bin/env node
// `pnpm --filter @gadgets/cli dev:client`: the Workshop's Vite dev server with the "Connect local
// agent harness" launcher added (workshop-frontend/vite.harness.config.ts). Use it in place of
// `pnpm dev-client`, alongside `pnpm dev-server` as usual.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "./demoConfig.ts";

const frontendDir = join(REPO_ROOT, "packages", "workshop-frontend");
const viteEntry = join(dirname(
    createRequire(join(frontendDir, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
const vite = spawn(process.execPath, [viteEntry, "--config", "vite.harness.config.ts", ...process.argv.slice(2)],
    { cwd: frontendDir, stdio: "inherit" });
vite.on("exit", code => process.exit(code ?? 0));
