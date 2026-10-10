---
title: Blueprint Required Bindings
covers:
  - packages/workshop-backend/src/blueprint-assignments.ts
  - packages/workshop-backend/__tests__/blueprint-assignments.test.ts
  - packages/integration-tests/__tests__/blueprint-required-bindings.test.ts
touchpoints:
  - packages/workshop-backend/src/server.ts
updated: 2026-10-10
---

# Blueprint Required Bindings

## Overview

`AuthenticatedApi.newGadgetFromBlueprint` checks the caller's binding assignments against the blueprint before it creates anything. Upstream's API docs already say that every binding the blueprint declares must be assigned. Upstream's code only looped over the assignments it was given, though, and it created the workspace before running any check. So an omitted binding gave a gadget with that binding unwired, and an unknown or mistyped one failed with an orphan workspace left behind. The Blueprint landing page already blocks Create until every binding is set, so this enforces on the server what the UI assumed.

Blueprint access is unchanged, and that is deliberate. A blueprint id is 128 random bits and works as a share-link capability (`PublicApi.getBlueprint` documents "knowing the ID is sufficient"). Anyone holding the id can view, download or instantiate it, and on an Access deployment every `/api` call also needs a valid Access JWT.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/workshop-backend/src/blueprint-assignments.ts` | `checkBlueprintAssignments(bindings, assignments)` throws one error naming every missing binding, unknown name and type mismatch. It checks own properties only, so names like `toString` can't match through the prototype |
| `packages/workshop-backend/__tests__/blueprint-assignments.test.ts` | Unit tests for missing, unknown, prototype-key and mismatched assignments |
| `packages/integration-tests/__tests__/blueprint-required-bindings.test.ts` | End to end: each kind of bad input is rejected and the user's gadget count stays the same; a valid assignment still instantiates |

## Data and Control Flow

`newGadgetFromBlueprint` reads the KV record and calls `checkBlueprintAssignments(kvRecord.metadata.bindings, bindings)`. Only after that does it read R2 content, create the Overseer, or call `User.newGadget`. A blueprint with no bindings still accepts `{}`, which is how output formats and the `gadgets` CLI instantiate bindingless blueprints.

## Configuration

None.

## Upstream Touchpoints

| Upstream file | Edit | Why it could not be a net-new file |
| --- | --- | --- |
| `packages/workshop-backend/src/server.ts` | Import, plus one `checkBlueprintAssignments` call after the KV read in `newGadgetFromBlueprint` | The check has to run inside the RPC method, before it creates the workspace |

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/workshop-shared/src/api.ts` | `BlueprintBinding` (every entry is required; `type` is `gatekeeper`, `aiModel` or `agentSpawner`) and `BlueprintBindingAssignment` (the same `type` discriminant) |
| `packages/workshop-backend/src/server.ts` | `newGadgetFromBlueprint` creating the workspace only after the KV read |

## Divergences from Design

No fork design document exists. The intended behavior is upstream's documented contract on `newGadgetFromBlueprint` and `BlueprintBindingAssignment`, which this implements.

## Open Questions

- Whether to offer this upstream. That needs Calvin's approval.
