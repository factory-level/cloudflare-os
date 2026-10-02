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
  - packages/skills/skills/lab-catalog
  - packages/skills/skills/breakout-workflow/files/lib/study.ts
  - packages/skills/skills/breakout-workflow/files/server.ts
  - packages/skills/skills/breakout-workflow/__tests__/study.test.ts
touchpoints:
  - .gitignore
  - scripts/run-dev-server.ts
  - pnpm-lock.yaml
updated: 2026-10-02
---

# Revision Loop

## Overview

The `gadgets` command line and its MCP server can qualify a skill directory and publish it to the trading lab's registry as an immutable revision. This is the Qualify and Publish stages for artifacts authored under `packages/skills/skills/`. The lab connector, `packages/gatekeeper-lab`, lets a Gadget read published revisions, their files, and studies; it writes nothing. The `lab-catalog` skill is a view of everything published, read through the connector. A study variant resource lets a workflow Gadget run one variant of a lab study: it reads the cycle and portfolio and records its decision as a queued action; the lab books any fill. `breakout-workflow` does this when `LAB_VARIANT` is bound. Binding revisions to running Gadgets, run records, views, and branding are not built in the fork.

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
| `packages/gatekeeper-lab/src/resources.ts` | The three bindable resource URLs and their parsing |
| `packages/skills/skills/lab-catalog` | A view Gadget: everything published, grouped by kind, then each artifact's revisions and studies, then a revision's files |
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

A bound resource is one of the following. Resource URLs use the fixed origin `https://lab.invalid`, which names a resource rather than a host, so a blueprint that declares a lab binding works against any deployment; requests go to `LAB_URL`.

- `https://lab.invalid/revisions`, served by `RevisionCatalogGatekeeper` as `RevisionCatalog`: `list(kind?)` from the lab's `GET /revisions`, `revisions(kind, name)`, and `files(kind, name, number)`.
- `https://lab.invalid/revisions/<kind>/<name>`, served by `RevisionLineageGatekeeper` as `RevisionLineage`: `list()`, `get(number)`, and `files(number)`.
- `https://lab.invalid/studies/<stu_id>`, served by `StudyReaderGatekeeper` as `StudyReader`: `describe()`, `portfolios()`, and `runs()`.
- `https://lab.invalid/studies/<stu_id>/variants/<label>`, served by `StudyVariantGatekeeper` as `StudyVariant`: `describe()`, `nextCycle()`, `portfolio()`, `runs()`, and `recordRun()`.

`recordRun` is the connector's only write, and it is a queued action. It stores the report in the gatekeeper's own storage under the next action ID and submits it as kind `lab.record_run` ("Record study runs"), marked auto-approvable, with the report as a JSON field. A repeat for the same cycle key reuses the waiting action. It returns the run with ID `pending:<n>`. While any run is waiting, `nextCycle()` returns null and `runs()` lists the waiting runs first. `applyAction` posts the report to the lab's `POST /studies/:id/variants/:label/runs`, which keeps one run per cycle key, and then forgets it. `rejectAction` forgets it unsent. `revertAction` explains that runs are permanent. `getAutoApprovableActions` lists the kind, so a workspace can approve every run without asking.

`breakout-workflow`'s `runStudyCycle()` and its scheduled callback, when `LAB_VARIANT` is bound:
1. Take the variant's cycle and portfolio.
2. Run the same pure workflow (`lib/study.ts`).
3. Record `{event} -> {action}`, an order intent for a buy or sell, and evidence steps 1 to 4.

The workflow's own virtual fill (steps 5 to 7) is not sent; the lab's risk gate and fills decide.

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
- **The lab connector writes only run records.** Comparisons, diffs, and analytics are declared in its types but throw, because the lab does not serve them yet.
- **A study variant is bound by hand.** Nothing creates a Gadget per variant when a study is created, and nothing checks that the bound Gadget runs the variant's exact revision.
- **The connector acts for a person, not as an agent principal.** The design asks each study variant to call the lab as its own principal. The connector signs in as the deployment's service and names the connection and person on each read.
- **Review per revision, analytics per agent, run records, per-variant isolation, views, and branding** are not built.

## Open Questions

- The manifest `version` in `blueprint.json` is outside the content hash, so the same content can be packed under two numbers. The lab accepts that; whether it should is undecided.
