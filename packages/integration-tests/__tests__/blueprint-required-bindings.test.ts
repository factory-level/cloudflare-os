import { afterAll, beforeAll, expect, it } from "vitest";
import {
  startTestGatekeeperHarness, TEST_VENDOR_ID, type Harness,
} from "../src/harness.js";
import { NetworkInterceptor } from "../src/network-interceptor.js";
import {
  connect, listConnectedAccounts, nextUsernames, signUp, stubFor, waitFor, WorkpieceRecorder,
} from "../src/rpc-client.js";

let harness: Harness | undefined;
const network = new NetworkInterceptor();

beforeAll(async () => {
  network.install();
  harness = await startTestGatekeeperHarness();
});

afterAll(async () => {
  try {
    expect(network.getUnmockedCalls()).toEqual([]);
  } finally {
    network.uninstall();
    await harness?.server.close();
  }
});

it("rejects missing, unknown and mistyped bindings without creating a workspace", async () => {
  if (harness === undefined) throw new Error("Workshop harness did not start");
  const user = nextUsernames("requiredbindings").at(0);
  if (!user) throw new Error("Failed to allocate a test username");

  using publicApi = connect(harness.url);
  using api = await signUp(publicApi, user);
  await api.provisionAmbientAccount(TEST_VENDOR_ID);
  const account = (await listConnectedAccounts(api))
      .find(candidate => candidate.vendorId === TEST_VENDOR_ID);
  if (!account) throw new Error("Test account was not provisioned");

  // Publish a blueprint with one gatekeeper binding, DATA.
  const formats = await waitFor("bundled output formats to install", async () => {
    const offers = await api.listOutputFormats();
    return offers.length > 0 ? offers : null;
  });
  const document = formats.find(format => format.output.id === "document");
  if (!document) throw new Error("Document output format is not installed");
  using source = await api.newGadgetFromBlueprint(document.blueprintId, {});
  const workpieces = new WorkpieceRecorder();
  using workpiecesStub = stubFor(workpieces);
  using _workpieces = await source.subscribeToWorkpieces(workpiecesStub);
  await workpieces.loaded;
  const gadgetId = (await source.getMetadata()).defaultGadgetId;
  if (!gadgetId) throw new Error("Source workspace has no default Gadget");
  using gadget = await source.getGadget(gadgetId);
  using data = await source.newGatekeeper(account.id, "https://gadgets-test.example/things/source");
  if (!data) throw new Error("Failed to create the test connection");
  await gadget.bind("DATA", await data.getId());
  const blueprint = await gadget.createBlueprint("Bound", "Blueprint with a DATA binding");

  const before = (await api.listGadgets()).length;
  const valid = {
    type: "gatekeeper", accountId: account.id,
    resourceUrl: "https://gadgets-test.example/things/installed",
  } as const;

  await expect(api.newGadgetFromBlueprint(blueprint.id, {}))
      .rejects.toThrow(/missing assignment for "DATA"/);
  await expect(api.newGadgetFromBlueprint(blueprint.id, { DATA: valid, EXTRA: valid }))
      .rejects.toThrow(/unknown binding "EXTRA"/);
  await expect(api.newGadgetFromBlueprint(blueprint.id,
      { DATA: { type: "aiModel", modelId: "any" } }))
      .rejects.toThrow(/"DATA" needs a gatekeeper assignment, not aiModel/);
  expect((await api.listGadgets()).length).toBe(before);

  using installed = await api.newGadgetFromBlueprint(blueprint.id, { DATA: valid });
  expect((await installed.getMetadata()).defaultGadgetId).toBeDefined();
  expect((await api.listGadgets()).length).toBe(before + 1);
});
