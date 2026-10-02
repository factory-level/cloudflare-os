---
title: Agent Development Loop
status: draft
updated: 2026-10-01
---

# Agent Development Loop

## Purpose

Make the fork an effective place to prototype and test trading agents: a developer, or an agent harness acting for them, changes an agent's decision logic and sees what it now decides within a second, then exercises it in a Workshop within seconds, all from one command line. This is the Draft and Qualify stages of the [Revision Loop](revision-loop.md) made fast enough to iterate in.

## Relationship to Upstream

Upstream's loop for changing a gadget is a conversation with its workspace agent. That suits building an application; it does not suit a trading rule that must be deterministic, replayable on market data, and identical in test and in production. Upstream provides the pieces this loop is built from: the blueprint packer, `importBlueprint`, `newGadgetFromBlueprint`, `connectToGadget`, and workspace deletion. It provides no command line, no local replay, and no way to drive those calls without the interface.

## Requirements

Three nested loops:

- **Inner.** Replaying an agent's decision logic must need no Workshop, no lab, and no model, and must complete in about a second.
- **Middle.** Putting the agent into a Workshop, calling it, and removing it again must need no interaction with the Workshop's interface.
- **Outer.** Qualify, publish, study, review, and analytics are defined in [Revision Loop](revision-loop.md).

One control surface:

- Every step must be a `gadgets` command, and every command an agent harness may use must also be an MCP tool with the same behavior.
- Commands that produce data must offer machine-readable output.
- Accepting a change to expected behavior, signing in, and publishing must stay with a person. No tool may regenerate expected output.

Replay contract:

- Each skill must expose one pure entry, `files/lib/harness.ts`, with named scenarios, a function that runs one input, and a function that runs one session over market bars while carrying state.
- The command line, the skill's tests, and the skill's gadget must all call that entry, so that what is prototyped is what is tested is what ships.
- A replay must never call a model, read a clock, or use the network.

Feedback:

- On every save, the developer must see each scenario's decision, which decisions changed since the last save and since the session began, which now differ from the committed expected output, and whether the tests pass.
- A save that does not parse must be reported without ending the session or discarding the last good result.
- Two skills must be comparable on identical inputs, showing where their results differ and the first field that differs. A comparison must not rank them or name a winner.
- Market bars must be readable from a file, with prices converted to integer cents exactly and times independent of the machine's time zone.
- Bars must be replayable one session at a time with the portfolio carried forward, so that a strategy that runs daily or weekly is exercised in seconds.

Integrity:

- Tests, packing, qualification, and push must all read one immutable snapshot of the skill, so the bytes that ship are the bytes that were tested.
- A skill must be tested only by its own tests, and a skill with none must fail.
- A credential must never follow a redirect.
- A scheduled occurrence must call a model at most once, also across retries.

Workshop:

- Each try must create its own workspace, so tries never share state.
- A try must report whether the Workshop's results equal the local replay.
- The tool must remember what it created and be able to remove all of it.

## Behavior

A developer runs `gadgets new` to copy a working skill, then `gadgets dev` and edits its `lib/`. Each save prints the decision table with change marks. `gadgets run --explain` shows one decision's evidence chain; `gadgets run --bars` replays a file of bars; `gadgets compare` shows how a variant differs from the original. When a change is intended, the developer runs `gadgets golden --update`, which prints what it accepted.

`gadgets try` tests and packs the skill from a snapshot, pushes it, creates a workspace from it, calls it, and states whether the Workshop agreed with the local replay. `gadgets call` and `gadgets runs` reach the same workspace later. `gadgets clean` deletes the workspaces and their blueprints.

A failing test stops `try` and `push` before anything is sent. An expired sign-in is reported as such. A method name that is not a plain identifier is refused.

## Non-Goals

- Replacing the Workshop's agent conversation for building applications.
- Live or broker-connected execution. Every fill is virtual.
- Statistical evaluation. Comparison here is descriptive; evidence comes from studies.

## Open Questions

- Should a shared, versioned library of market scenarios exist outside any one skill, so that every skill is replayed on the same named cases? (Calvin, with Nathan)
- Should `compare` accept a published `name@N` fetched from the lab by hash, rather than only directories? It needs the lab to serve revision content. (Calvin)
- Should the watcher also show what changed since the last published revision? Same dependency. (Calvin)
- How is a schedule created without the workspace agent? The scheduler is bound by the platform as an ambient capability and a schedule is registered from gadget code. (Calvin)
- Should one command start the local Workshop, the lab, and the mock sign-in edge together? (Calvin)

## Related

- Architecture: [`../architecture/agent-dev-loop.md`](../architecture/agent-dev-loop.md)
- Design: [Revision Loop](revision-loop.md), [Local Skill Push](local-skill-push.md)
