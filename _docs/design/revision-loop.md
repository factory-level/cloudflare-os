---
title: Revision Loop
status: draft
updated: 2026-10-01
---

# Revision Loop

## Purpose

Define how this fork realizes the product's Revision Loop: one lifecycle for every authored artifact, so that A/B testing, analytics views, the connection to the trading lab API, isolation per agent, agent runs, branding, workflow revisions, and skill revisions are built from one mechanism instead of eight.

The fork is the product's development environment: the one place a person builds, tests, launches, reviews, and analyzes agents. Two things must be easy in it: reviewing an agent revision by revision, and reading analytics per agent.

The product contract is specified in the `factory-level/ai-trader` repository, in `docs/design/revision-loop.md` and its proposed ADR 0006. This document does not restate it. It records what the fork must add to Cloudflare OS to meet that contract, and how it does so without editing upstream files.

Qualification and publish to the lab are built; see [architecture](../architecture/revision-loop.md). Packing and push are described in [Local Skill Push](local-skill-push.md). Nothing else here is built.

## Relationship to Upstream

Upstream provides the parts the loop is assembled from, and none of the loop itself:

| Need | Upstream provides | Upstream does not provide |
| --- | --- | --- |
| Immutable content | Blueprint archives stored by id and version; a git object store per workspace | Running a pinned version; a link from a gadget back to its blueprint version; per-skill versions |
| Isolation | A facet per gadget with no outbound network and an environment made only of its bindings | A boundary between gadgets in one workspace for the action log and auto-approval rules |
| Connector | The gatekeeper interfaces, the approval queue, observations, and the gatekeeper authoring skill | A connector to the lab |
| Runs | Chat transcripts, the action log, per-chat cost, and trace spans | Any tag naming the revision a run executed; a run history for scheduled callbacks |
| Views | Gadget user interfaces | Saved analytics views; a query path for metrics |
| Review | A commit log and file reads per workspace commit; blueprint versions kept in storage | A page for one published revision; a difference between two blueprint versions; any list of a blueprint's revisions |
| Branding | Deployment admin settings for name, logo, accent color, instructions, and format names | A versioned brand; the page title |
| Comparison | Platform evals comparing two platform commits | Comparing two artifact revisions at run time |

The loop belongs in the fork because it is specific to the trading product and to its lab. Upstream documents to read first: [`../../docs/blueprints.md`](../../docs/blueprints.md), [`../../docs/observers.md`](../../docs/observers.md), [`../../docs/sharing.md`](../../docs/sharing.md).

## Requirements

Footprint:

- Every part of the loop must live in fork-owned files. The kernel packages `workshop-backend` and `workshop-shared` must not be edited.
- A capability that cannot be built without a kernel change must stop and be recorded as an open question here.
- User interface additions must mount from a fork-owned Vite configuration and their own root, as [Local Skill Push](local-skill-push.md) does.

Revisions:

- Every artifact kind must be authored as a directory in the bundled-blueprint layout and packed with the existing deterministic packer, so one archive format and one content hash serve all kinds.
- The packer's content hash must be the revision's identity, and the manifest `version` its number.
- Qualification must be one command that runs the artifact's tests, verifies every pinned dependency by name, number, and hash, refuses an unpinned reference, scans for secrets and binding values, and writes a qualification record.
- Publish must push the archive under the person's own identity and register the revision with the lab. The lab must be the registry of record.

Runs and isolation:

- A workflow gadget must write a run record to the lab through the lab connector on every cycle, carrying its revision name, number, hash, and cycle key, because the platform does not tag runs with revisions.
- Each study variant must be its own gadget with its own bindings. No two variants may share a binding to the same virtual portfolio.

Connector:

- The lab connector must be a new gatekeeper package exposing only the lab's fixed operation catalog. Reads must be observations; operations with side effects must be queued actions.
- The connector must expose no operation that publishes, approves, binds, or runs a query.

Development environment:

- Build, test, launch, review, and analyze must each be reachable from the workspace and from the local agent harness, without a second tool.
- The harness tools must cover the same steps as the command line: list, test, qualify, publish, list revisions, show a revision, and show the difference between two revisions.

Review per revision:

- A revision review gadget must show, for one `<kind>/<name>@<N>`: the manifest, pins with resolved hashes, content files, the difference from the previous revision, the qualification and publish records, the studies it runs in, its runs, and its cost.
- It must list all revisions of a name in order and open any of them.
- It must read everything through the lab connector, because the lab is the registry of record and the workspace does not link a gadget to the blueprint version it came from.
- It must be read-only.

Analytics per agent:

- An agent analytics gadget must show, for one agent across its revisions and for one revision alone: cycles and outcome codes, decisions by type, failed assertions, refused actions, operating cost, and latency.
- It must show two revisions side by side, and must show the study's paired comparison only when both ran as variants of one study.
- It must report portfolio results per study variant, never per agent.
- Both gadgets must be `view` revisions, published like any other artifact.

Views and branding:

- An analytics view must be a gadget revision that reads only through the lab connector.
- A brand must be a versioned file applied through the existing deployment admin settings, with the page title set by a fork-owned Vite configuration.

## Behavior

A developer authors a skill and a workflow under `packages/skills/skills/`, qualifies them, and publishes them. Each publish creates a separate blueprint, so two revisions of a workflow can run side by side as two gadgets. A study names two such revisions. Each gadget calls the lab through its own connector binding, receives the same observations, and writes its own run records. A reviewer opens the revision review gadget on either revision to see what changed and what it did, and the agent analytics gadget to see its outcomes and cost per revision. A view gadget reads the comparison through the connector. A deployment administrator applies a brand revision.

When a pinned dependency is missing or its hash differs, qualification fails and nothing is published. When a cycle is delivered twice, the second delivery writes no second run record.

## Non-Goals

- Changing upstream's kernel, RPC interfaces, or documentation.
- Storing study results, run records, or the revision registry inside the workspace.
- Live trading, or any connector to a broker.

## Open Questions

- Can a gadget be created from a blueprint, and its scheduled callback enabled, without a person using the workspace interface? If not, the end-to-end proof needs a manual step. (Calvin)
- Is a gadget per variant enough isolation, given that gadgets in one workspace share an action log and auto-approval rules, or does each variant need its own workspace? (Calvin)
- The archive metadata does not carry the manifest `revision` field. Is it added to the archive, or is `version` the only number? (Calvin)

## Related

- Architecture: [`../architecture/revision-loop.md`](../architecture/revision-loop.md)
- Design: [Local Skill Push](local-skill-push.md)
