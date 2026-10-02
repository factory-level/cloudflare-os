import {
  DEFAULT_GATEKEEPER_WRANGLER, OBSERVABILITY, defineGadgetsWorker, type DurableObjectMigration,
} from "@gadgets/scripts/worker-config";

export default defineGadgetsWorker({
  name: "gatekeeper-lab",
  entrypoint: ".wrangler/validate/src/lab.ts",
  compatibilityFlags: ["allow_irrevocable_stub_storage"],

  // Every var is deployment configuration, so none is set here. Unset `LAB_URL` means the connector
  // advertises no resources and the Workshop hides it.
  //
  //   LAB_URL
  //     Base URL of the ai-trader lab API, e.g. "https://lab.example.com".
  //
  //   LAB_CLIENT_ID, LAB_CLIENT_SECRET (secrets)
  //     The Cloudflare Access service token this deployment signs in to the lab with. Access
  //     exchanges them for the assertion the lab verifies.
  //
  //   LAB_ASSERTION (secret, local development only)
  //     A pre-minted assertion sent instead of a service token, from the lab's
  //     `dev token --service local-gatekeeper`. It expires after an hour.
  //
  //   LAB_ALLOW_TYPED_EMAIL
  //     "true" lets the connect page ask who is connecting when no Cloudflare Access sign-in
  //     header is present. Local development only: a typed email is not verified.
  observability: OBSERVABILITY,
});

export const wrangler = DEFAULT_GATEKEEPER_WRANGLER;

export const migrations: DurableObjectMigration[] = [
  { tag: "v0", new_sqlite_classes: ["UserAccount", "RevisionLineageGatekeeper", "StudyReaderGatekeeper"] },
];
