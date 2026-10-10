import { describe, expect, it } from "vitest";
import type { BlueprintBinding, BlueprintBindingAssignment } from "@gadgets/workshop-shared/api";
import { checkBlueprintAssignments } from "../src/blueprint-assignments.js";

const bindings: Record<string, BlueprintBinding> = {
  DATA: {
    title: "Data", description: "", type: "gatekeeper",
    gatekeeperName: "test", typeUrlPattern: "https://example.com/*",
  },
  MODEL: { title: "Model", description: "", type: "aiModel" },
} as Record<string, BlueprintBinding>;

const data: BlueprintBindingAssignment =
    { type: "gatekeeper", accountId: 1, resourceUrl: "https://example.com/x" };
const model: BlueprintBindingAssignment = { type: "aiModel", modelId: "m" };

describe("checkBlueprintAssignments", () => {
  it("accepts every binding assigned with its own type", () => {
    expect(() => checkBlueprintAssignments(bindings, { DATA: data, MODEL: model })).not.toThrow();
    expect(() => checkBlueprintAssignments({}, {})).not.toThrow();
  });

  it("names every missing binding", () => {
    expect(() => checkBlueprintAssignments(bindings, {}))
        .toThrow(/missing assignments for "DATA", "MODEL"/);
    expect(() => checkBlueprintAssignments(bindings, { DATA: data }))
        .toThrow(/missing assignment for "MODEL"/);
  });

  it("rejects unknown names, including prototype keys", () => {
    expect(() => checkBlueprintAssignments(bindings, { DATA: data, MODEL: model, EXTRA: data }))
        .toThrow(/unknown binding "EXTRA"/);
    expect(() => checkBlueprintAssignments(bindings, { DATA: data, MODEL: model, toString: data }))
        .toThrow(/unknown binding "toString"/);
  });

  it("rejects an assignment of the wrong type", () => {
    expect(() => checkBlueprintAssignments(bindings, { DATA: model, MODEL: model }))
        .toThrow(/"DATA" needs a gatekeeper assignment, not aiModel/);
  });
});
