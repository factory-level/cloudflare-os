---
title: Agent Development Loop
covers:
  - packages/gadgets-cli/src/bindings.ts
  - packages/gadgets-cli/src/bindings.test.ts
  - packages/gadgets-cli/src/replay.ts
  - packages/gadgets-cli/src/replayWorker.ts
  - packages/gadgets-cli/src/replay.test.ts
  - packages/gadgets-cli/src/bars.ts
  - packages/gadgets-cli/src/golden.ts
  - packages/gadgets-cli/src/dev.ts
  - packages/gadgets-cli/src/format.ts
  - packages/gadgets-cli/src/scaffold.ts
  - packages/gadgets-cli/src/snapshot.ts
  - packages/gadgets-cli/src/snapshot.test.ts
  - packages/gadgets-cli/src/target.ts
  - packages/gadgets-cli/src/workspace.ts
  - packages/gadgets-cli/src/workspace.test.ts
  - packages/skills/skills/breakout-workflow/files/lib/harness.ts
  - packages/skills/skills/breakout-workflow/files/lib/occurrence.ts
  - packages/skills/skills/momentum-signal/files/lib/harness.ts
touchpoints: []
updated: 2026-10-02
---

# Agent Development Loop

## Overview

The `gadgets` command line runs an inner loop on the developer's machine and a middle loop in a Workshop. The inner loop replays a skill's decision logic in a child process. The middle loop pushes a skill, creates a workspace from it over the Workshop's public RPC interface, calls it, and deletes it. Both are also MCP tools.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/skills/skills/<name>/files/lib/harness.ts` | The replay contract: `scenarios`, `run(input)`, and `session(bars, state)`. Called by the tools, the skill's tests, and its gadget |
| `packages/gadgets-cli/src/replayWorker.ts` | Child process that imports one skill's harness and runs scenarios, given inputs, one session over bars, or one session per bar carrying state |
| `packages/gadgets-cli/src/replay.ts` | Starts the worker; compares two skills on identical inputs and reports the first differing field |
| `packages/gadgets-cli/src/bars.ts` | Reads bars from CSV |
| `packages/gadgets-cli/src/golden.ts` | Compares current behavior with `__tests__/golden.json`, and rewrites it on request |
| `packages/gadgets-cli/src/dev.ts` | One pass (replay, golden comparison, tests) and the file watcher that repeats it |
| `packages/gadgets-cli/src/format.ts` | Terminal rendering of replays, evidence chains, and comparisons |
| `packages/gadgets-cli/src/scaffold.ts` | Creates a skill by copying an existing one under a new name at version 1 |
| `packages/gadgets-cli/src/snapshot.ts` | Copies a skill to a temporary directory for testing and packing |
| `packages/gadgets-cli/src/target.ts` | Opens an authenticated session to a Workshop named with `--to`, or to the paired local one |
| `packages/gadgets-cli/src/workspace.ts` | Creates, calls, remembers, and deletes workspaces |
| `packages/skills/skills/breakout-workflow/files/lib/occurrence.ts` | Records one scheduled occurrence once |

## Data and Control Flow

**Replay.** Each replay is a new Node process, so an edited module is always re-read and a failing harness cannot stop the command line. The worker has a 30-second limit. A scenario whose harness throws is returned as an error entry, not a failure of the whole replay.

**Watcher.** `gadgets dev` runs a pass at start and 150 milliseconds after the last change under the skill directory. A pass replays the scenarios, compares them with the previous pass, the first pass, and the golden file, and runs the skill's tests. A change during a pass causes one more pass. A replay that cannot run is reported and the previous entries are kept. Failing tests are listed by name; the full output is available from `gadgets skill test`.

**Comparison.** `gadgets compare a b` replays `a`'s scenarios, then gives `b` the same inputs. With `--bars`, both replay the file. A row is equal only when the full results are equal, and an unequal row names the first differing field. The output states that it is not a ranking.

**Bars.** The CSV needs a header naming `t`, `time`, or `date`; `close` or `closeCents`; and `volume`. `close` is converted to cents by text arithmetic and may have at most two decimals. A `time` or `date` must be a plain date or carry a zone. Rows must be strictly increasing in time.

**Snapshot.** `withSnapshot` copies the skill, without `node_modules`, to a temporary directory that keeps the skill's name, writes a test configuration there that selects only that directory's `__tests__`, and links the skills package's `node_modules` so the tests can import the test runner. `testSkill`, `qualifySkill`, and the tested path of `push` and `try` all read the copy. The copy is removed afterwards, also on failure.

**Workshop.** `gadgets try` tests and packs from one snapshot, pushes, calls `newGadgetFromBlueprint` with its bindings, reads the new workspace's default gadget, calls `runFixtures` through `connectToGadget`, and compares the result with a local replay. It appends the workspace to `workspaces.json` in the configuration directory. `gadgets call` and `gadgets runs` reopen the latest workspace for a skill with `openGadget`. `gadgets clean` calls `deleteSelf` on each remembered workspace in that Workshop and deletes its blueprint; a workspace that no longer exists is forgotten, and one that could not be deleted stays remembered.

**Scheduled occurrence.** `recordOccurrence` stores the deterministic runs and claims the occurrence before the model is called, marking the review as interrupted. It then calls the model and overwrites the record with the review or its error. A retry of the same occurrence finds the claim and returns.

**Bindings.** `try` and `try_skill` fill each gatekeeper binding `blueprint.json` declares with a suggested `resourceUrl` from the person's connected account of that vendor (`gatekeeperName`), when there is exactly one; otherwise the binding is left empty and the reason printed. `try --bind NAME=vendor:resourceUrl` chooses explicitly and fails when no single account fits. Accounts come from `subscribeConnectedAccounts` (`src/bindings.ts`).

Commands: `new`, `dev`, `run`, `compare`, `golden`, `try`, `call`, `runs`, `clean`, `status`, `pair`. Tools: `new_skill`, `replay_skill`, `compare_skills`, `check_golden`, `try_skill`, `call_gadget`, `clean_workspaces`. There is no tool that updates a golden file.

## Configuration

| Setting | Effect |
| --- | --- |
| `--to <workshop-url>` | Act in that Workshop under the stored Access sign-in. Without it, the paired local Workshop |
| `--json` | Machine-readable output for `run`, `compare`, `golden`, `new`, `try`, `call`, `clean`, `status` |
| `GADGETS_CONFIG_DIR` | Where `workspaces.json` is kept |
| `GADGETS_SKILLS_DIR` | Where skills are found and created |

## Upstream Touchpoints

None.

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/workshop-shared/src/api.ts` | `newGadgetFromBlueprint`, `openGadget`, `Overseer.getMetadata` and its `defaultGadgetId`, `Overseer.getGadget`, `Overseer.deleteSelf`, `GadgetClient.connectToGadget`, `deleteOrphanedBlueprint` |
| `packages/workshop-backend` | A blueprint instantiating into a workspace of its own, and a gadget answering calls on its committed code without a chat |
| `packages/bundled-blueprints` | Packing; it rejects a source file no entry point imports, which is why each gadget's server imports its harness |

## Divergences from Design

- **No command creates a schedule.** `gadgets runs` reads recorded scheduled runs, but scheduling still needs the workspace agent and enabling the hook in the interface.
- **No command starts the local stack.** `gadgets status` reports the Workshop, pairing, skills, and remembered workspaces; it does not start anything and does not report the lab.
- **Comparison takes directories only.** A published revision cannot be fetched and compared.
- **The watcher compares with the session start and the golden file**, not with the last published revision.
- **There is no shared scenario library.** Each skill carries its own scenarios.
- **The scheduled-run view refreshes by polling every five seconds**, and has no automated test.
- **The middle loop was exercised by hand** against the local simulated-production Workshop; its automated tests use a stand-in for the Workshop.

## Open Questions

- A snapshot links the skills package's `node_modules`, so a test can still read mutable files outside the skill through an import.
- `gadgets clean` treats an error containing "not found" as already deleted, which depends on the Workshop's wording.
