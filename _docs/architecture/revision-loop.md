---
title: Revision Loop
covers:
  - packages/gadgets-cli/src/revision.ts
  - packages/gadgets-cli/src/qualify.ts
  - packages/gadgets-cli/src/qualify.test.ts
  - packages/gadgets-cli/src/lab.ts
  - packages/gadgets-cli/src/lab.test.ts
  - packages/skills/skills/momentum-signal/files/revision.json
  - packages/skills/skills/breakout-workflow/files/revision.json
  - packages/gatekeeper-lab
touchpoints:
  - .gitignore
  - scripts/run-dev-server.ts
  - pnpm-lock.yaml
updated: 2026-10-02
---

# Revision Loop

## Overview

The `gadgets` command line and its MCP server can qualify a skill directory and publish it to the trading lab's registry as an immutable revision. This is the Qualify and Publish stages for artifacts authored under `packages/skills/skills/`. The lab connector, `packages/gatekeeper-lab`, lets a Gadget read published revisions, their files, and studies; it writes nothing. Binding revisions to running Gadgets, run records, views, and branding are not built in the fork.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/skills/skills/<name>/files/revision.json` | The revision manifest: the artifact `kind` and its `pins`. It is inside `files/`, so it is part of the packed content and a changed pin changes the content hash |
| `packages/gadgets-cli/src/revision.ts` | Reads and validates a revision manifest. Refuses unknown fields, unknown kinds, and any pin that is not an exact kind, name, positive integer, and SHA-256 |
| `packages/gadgets-cli/src/qualify.ts` | Runs the qualification checks and returns a record bound to the content hash |
| `packages/gadgets-cli/src/lab.ts` | Builds the publish request and sends it to the lab |
| `packages/gatekeeper-lab/src/lab.ts` | The lab connector: connect page, vendor, account, verifier, and one read-only gatekeeper per bound resource |
| `packages/gatekeeper-lab/src/lab-api.ts` | HTTP client for the lab. Signs in as the deployment's service, names the connection and person on every read, and maps the lab's codes to errors |
| `packages/gatekeeper-lab/src/lab-session.ts` | The sessions a Gadget holds. Each read is authorized as an observation before it returns |
| `packages/gatekeeper-lab/src/resources.ts` | The two bindable resource URLs and their parsing |
| `packages/gatekeeper-lab/src/types.d.ts` | The agent-facing interfaces, including those not served yet |
| `packages/gadgets-cli/src/bin.ts`, `mcp.ts` | `gadgets qualify`, `gadgets publish`, and the `qualify_skill` and `publish_revision` tools (also covered by [Local Skill Push](local-skill-push.md)) |

## Data and Control Flow

Qualification copies the directory to a snapshot (see [Agent Development Loop](agent-dev-loop.md)), packs the copy, then runs five checks on it. The bytes it returns for publishing come from the same copy. Every check runs even when an earlier one fails.

| Check | Passes when |
| --- | --- |
| `manifest` | `files/revision.json` is valid |
| `deterministic-pack` | Packing a second time gives identical bytes |
| `pins` | Every pin names a skill in the local skills directory whose kind, manifest version, and content hash match exactly |
| `secrets` | No shipped file matches a credential pattern: a private key block, an Anthropic, AWS, or GitHub key, a URL with embedded credentials, or a JSON Web Token |
| `tests` | The skill's own tests pass. A skill with no tests fails |

The record holds the kind, the directory name, the manifest `version` as the number, the content hash as `sha256:<hex>`, the pins, and each check's outcome. A failure's detail names the pattern and file, never the matched text.

Publish qualifies first and stops without a request when any check failed. Otherwise it posts the kind, name, number, content hash, the packed content as base64, the pins, and the check outcomes to the lab's `POST /revisions`, with the person's Cloudflare Access token in the `cf-access-token` header. It does not follow redirects. It reports the stored revision, the lab's refusal reason, or that the person is not signed in.

### Lab connector

A deployment signs in to the lab with one Cloudflare Access service token. Connecting the lab makes a lab connection for the person connecting (`POST /connections`), named by the Access sign-in header on the connect page. A typed email is accepted only where `LAB_ALLOW_TYPED_EMAIL` is `true`. The account stores the connection's ID and the person's email.

A bound resource is one of:

- `<LAB_URL>/revisions/<kind>/<name>`, served by `RevisionLineageGatekeeper` as `RevisionLineage`: `list()`, `get(number)`, and `files(number)`.
- `<LAB_URL>/studies/<stu_id>`, served by `StudyReaderGatekeeper` as `StudyReader`: `describe()`.

Each read sends `x-lab-connection` and `x-lab-on-behalf-of`, waits for the lab's answer, then calls `authorizeObservation` before returning. A refused read records no observation.

The other interface methods throw `Not available yet`: `StudyVariant`, `AgentAnalytics`, `RevisionLineage.diff` and `runs`, and `StudyReader.portfolios`, `compare`, and `runs`. Every action method throws, because nothing is written.

Disconnecting revokes the connection at the lab (`POST /connections/:id/revoke`) and deletes the account's storage even if the lab cannot be reached. After that, every read fails on this side, and the lab refuses the connection's ID. An observer is admitted when their own lab connection can read the bound resource.

## Configuration

| Setting | Effect |
| --- | --- |
| `gadgets publish <skill> --lab <url>` | The lab to publish to. The token comes from `gadgets login <url>` |
| `GADGETS_SKILLS_DIR` | Where pins are resolved |
| `LAB_URL` | The lab connector's lab. Unset: the connector advertises no resources and the Workshop hides it |
| `LAB_CLIENT_ID`, `LAB_CLIENT_SECRET` | The connector's Access service token |
| `LAB_ASSERTION` | Local development only: an assertion from the lab's `dev token --service local-gatekeeper`, sent instead of a service token. It expires after an hour |
| `LAB_ALLOW_TYPED_EMAIL` | Local development only: `true` lets the connect page ask who is connecting when no Access sign-in header is present |

`scripts/run-dev-server.ts` passes the `LAB_*` settings from the shell or the root `.dev.vars` to the connector.

## Upstream Touchpoints

| Upstream path | Change | Why it cannot be avoided |
| --- | --- | --- |
| `.gitignore` | Removes the fork's own ignore line for `packages/gatekeeper-lab/`, added with the gadgets CLI | The package is now committed |
| `scripts/run-dev-server.ts` | Adds a `gatekeeper-lab` entry to `PASSTHROUGH_GATEKEEPER_VARS` | It is the only way the dev server passes deployment variables to a gatekeeper without committing them to `wrangler.jsonc` |
| `pnpm-lock.yaml` | The connector's importer | The lockfile records every workspace package |

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/workshop-shared/src/gatekeeper.ts`, `packages/gatekeeper-kit` | The gatekeeper interfaces, connect handoff, and nonce helpers the lab connector implements and uses |
| `scripts/run-dev-server.ts` | Discovers the connector and binds it as `GATEKEEPER_LAB` |
| `packages/bundled-blueprints` | Packing. Its TypeScript bundling rejects a source file no entry point imports, so a skill cannot ship unreferenced code |

The lab's registry contract is defined in `factory-level/ai-trader`, in `docs/architecture/revision-loop.md`.

## Divergences from Design

- **Pins resolve locally, not against the registry.** Qualification compares each pin with the skill in the local directory. The lab checks pins against published revisions at publish.
- **A pin records a dependency but does not load it.** Nothing at run time resolves a pin to code. Neither shipped skill pins anything.
- **Publish does not push to a Workshop.** Publishing to the lab and pushing the blueprint to a Workshop are separate commands, and nothing links the lab's revision to a blueprint id.
- **No binding-value scan.** The secret check finds credentials. It does not detect environment names or other binding values in content.
- **The local demonstration has no lab behind its mock edge**, so publish has been exercised only against a stubbed lab in unit tests.
- **The lab connector only reads.** Run records (`StudyVariant.recordRun`), portfolios, comparisons, diffs, and analytics are declared in its types but throw, because the lab does not serve them yet.
- **The connector acts for a person, not as an agent principal.** The design asks each study variant to call the lab as its own principal. The connector signs in as the deployment's service and names the connection and person on each read.
- **Review per revision, analytics per agent, run records, per-variant isolation, views, and branding** are not built.

## Open Questions

- The manifest `version` in `blueprint.json` is outside the content hash, so the same content can be packed under two numbers. The lab accepts that; whether it should is undecided.
