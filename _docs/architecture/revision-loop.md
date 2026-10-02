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
touchpoints: []
updated: 2026-10-01
---

# Revision Loop

## Overview

The `gadgets` command line and its MCP server can qualify a skill directory and publish it to the trading lab's registry as an immutable revision. This is the Qualify and Publish stages for artifacts authored under `packages/skills/skills/`. Binding, running, studies, views, the lab connector, and branding are not built in the fork.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/skills/skills/<name>/files/revision.json` | The revision manifest: the artifact `kind` and its `pins`. It is inside `files/`, so it is part of the packed content and a changed pin changes the content hash |
| `packages/gadgets-cli/src/revision.ts` | Reads and validates a revision manifest. Refuses unknown fields, unknown kinds, and any pin that is not an exact kind, name, positive integer, and SHA-256 |
| `packages/gadgets-cli/src/qualify.ts` | Runs the qualification checks and returns a record bound to the content hash |
| `packages/gadgets-cli/src/lab.ts` | Builds the publish request and sends it to the lab |
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

## Configuration

| Setting | Effect |
| --- | --- |
| `gadgets publish <skill> --lab <url>` | The lab to publish to. The token comes from `gadgets login <url>` |
| `GADGETS_SKILLS_DIR` | Where pins are resolved |

## Upstream Touchpoints

None.

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/bundled-blueprints` | Packing. Its TypeScript bundling rejects a source file no entry point imports, so a skill cannot ship unreferenced code |

The lab's registry contract is defined in `factory-level/ai-trader`, in `docs/architecture/revision-loop.md`.

## Divergences from Design

- **Pins resolve locally, not against the registry.** Qualification compares each pin with the skill in the local directory. The lab checks pins against published revisions at publish.
- **A pin records a dependency but does not load it.** Nothing at run time resolves a pin to code. Neither shipped skill pins anything.
- **Publish does not push to a Workshop.** Publishing to the lab and pushing the blueprint to a Workshop are separate commands, and nothing links the lab's revision to a blueprint id.
- **No binding-value scan.** The secret check finds credentials. It does not detect environment names or other binding values in content.
- **The local demonstration has no lab behind its mock edge**, so publish has been exercised only against a stubbed lab in unit tests.
- **Review per revision, analytics per agent, the lab connector, run records, per-variant isolation, views, and branding** are not built.

## Open Questions

- The manifest `version` in `blueprint.json` is outside the content hash, so the same content can be packed under two numbers. The lab accepts that; whether it should is undecided.
