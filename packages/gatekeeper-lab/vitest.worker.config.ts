import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import capnwebValidate from "capnweb-validate/vite";
import { defineConfig } from "vitest/config";
import deployed from "./cloudflare.config.ts";

const { compatibilityDate, compatibilityFlags } = deployed.worker;

/**
 * The suite that has to run in workerd: the approval-queue audit on every read and the account's
 * revocation are built on `RpcTarget`, `RpcStub`, and Durable Objects.
 */
export default defineConfig({
  plugins: [
    capnwebValidate(),
    cloudflareTest({
      main: "./__tests__/worker.ts",
      miniflare: {
        compatibilityDate,
        compatibilityFlags,
        bindings: { LAB_URL: "https://lab.test", LAB_ASSERTION: "test-assertion" },
        durableObjects: {
          USER_ACCOUNT: { className: "UserAccount", useSQLite: true },
          REVISION_LINEAGE: { className: "RevisionLineageGatekeeper", useSQLite: true },
          STUDY_READER: { className: "StudyReaderGatekeeper", useSQLite: true },
        },
      },
    }),
  ],
  test: {
    include: ["__tests__/workerd/*.test.ts"],
    setupFiles: ["@gadgets/scripts/assert-workerd"],
  },
});
