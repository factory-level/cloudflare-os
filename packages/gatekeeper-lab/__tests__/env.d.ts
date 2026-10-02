/// <reference types="@cloudflare/vitest-pool-workers/types" />

// Test-only bindings, declared in `vitest.worker.config.ts` rather than `wrangler.jsonc`.

import type { UserAccount } from "./worker.js";

declare global {
  namespace Cloudflare {
    interface Env {
      USER_ACCOUNT: DurableObjectNamespace<UserAccount>;
      LAB_URL: string;
      LAB_ASSERTION: string;
    }
  }
}
