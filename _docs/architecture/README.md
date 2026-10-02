# Architecture

Current implementation of fork features. Each document lists the repository paths it `covers` so documentation agents can map code changes to topics, the upstream-owned files it edits as `touchpoints`, and the upstream behaviors it depends on. Intended behavior lives in [`../design/`](../design/) under the same filename.

Create documents from [`_template.md`](_template.md).

## Index

| Document | Covers | Summary |
| --- | --- | --- |
| [Revision Loop](revision-loop.md) | Revision manifest, qualification, and the lab publish client in the `gadgets` CLI | Qualify a skill into a record bound to its content hash and publish it to the lab's registry |
| [Agent Development Loop](agent-dev-loop.md) | Replay, watcher, comparison, golden files, snapshots, and headless workspaces in the `gadgets` CLI; each skill's harness | Inner loop on the developer's machine and middle loop in a Workshop |
| [Local Skill Push](local-skill-push.md) | `gadgets` CLI, skills, local harness pairing, authoring rules | Deterministic packing, identity-bound push through `importBlueprint`, MCP bridge, and a local production demonstration |
