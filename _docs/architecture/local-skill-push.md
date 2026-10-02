---
title: Local Skill Push
covers:
  - packages/gadgets-cli
  - packages/skills
  - packages/workshop-frontend/src/features/local-harness
  - packages/workshop-frontend/vite.harness.config.ts
  - .claude/skills/author-gadget-skill
touchpoints:
  - .gitignore
  - scripts/env-passthrough.test.ts
  - pnpm-lock.yaml
updated: 2026-10-01
---

# Local Skill Push

## Overview

A command-line tool, `gadgets`, packs skills authored under `packages/skills/skills/` into `.gadget` archives and pushes them to a Workshop through the existing `importBlueprint` call. The same tool runs as an MCP server so a local agent harness can use it, and it holds a fully local demonstration of the production path. A small frontend feature, present only in a local development server, pairs the harness with the local Workshop.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/skills/skills/<name>/` | One skill in the bundled-blueprint layout: `blueprint.json`, `files/` (`server.ts`, `client.ts`, `lib/`), and `__tests__/` with golden fixtures that are not shipped |
| `packages/skills/skills/momentum-signal` | Demo skill: a moving-average momentum rule over integer-cent prices that yields an order intent |
| `packages/skills/skills/breakout-workflow` | Deterministic workflow: observe, classify, assert risk, decide, execute virtually, and record an evidence chain. Exposes a scheduled callback that runs its fixtures |
| `packages/gadgets-cli/src/pack.ts` | Deterministic packing, reusing upstream's manifest parser, content builder, and archive serializer. Computes the SHA-256 of the archive's content section |
| `packages/gadgets-cli/src/skills.ts` | Lists skills and runs a skill's tests |
| `packages/gadgets-cli/src/workshop.ts` | Connects to a Workshop, pushes with `importBlueprint`, and verifies by downloading and re-hashing |
| `packages/gadgets-cli/src/login.ts`, `credentials.ts` | Sign-in through `cloudflared` or the mock edge; credentials stored under the user's configuration directory with owner-only permissions |
| `packages/gadgets-cli/src/pairing.ts` | Loopback bridge that receives a local Workshop session after a one-time code is confirmed |
| `packages/gadgets-cli/src/mcp.ts` | MCP server with `workshop_status`, `list_skills`, `test_skill`, `pack_skill`, `install_skill_locally`, and `push_skill`, plus the two tools described in [Revision Loop](revision-loop.md) |
| `packages/gadgets-cli/src/bin.ts` | Command entry: `skill list`, `skill test`, `skill pack`, `login`, `push`, `verify`, `mcp`, plus `qualify` and `publish` described in [Revision Loop](revision-loop.md) |
| `packages/gadgets-cli/src/demo/` | Mock Cloudflare Access edge, an Access-mode Workshop behind it, the launcher for the local client, and the scripted proof |
| `packages/workshop-frontend/src/features/local-harness/` | "Connect local agent harness" launcher and pairing panel |
| `packages/workshop-frontend/vite.harness.config.ts` | Merges upstream's Vite configuration and injects the launcher's entry when serving |
| `.claude/skills/author-gadget-skill/` | Authoring and determinism rules for skills |

## Data and Control Flow

Push: the tool tests and packs the skill from one snapshot (see [Agent Development Loop](agent-dev-loop.md)), connects to the Workshop, calls `whoami`, then `importBlueprint` with the archive, then downloads the blueprint and compares content hashes. The Workshop assigns a new blueprint id on every import and records the caller as owner.

Production identity: the tool first sends a plain request that does not follow redirects, so the token never reaches a sign-in page on another origin; a redirect is reported as a missing sign-in. It then sends the Cloudflare Access token with the connection, and the Workshop authenticates the caller from the Access assertion. Locally, the tool authenticates with the paired session.

Pairing: the frontend panel shows a one-time code and the command to register the MCP server. The bridge listens on a loopback port until paired, answers only the local Workshop's origin, and accepts only a loopback Workshop address. After the developer confirms the named harness, the panel posts the session to the bridge, which verifies it with `whoami` and stores it. A new code always starts the bridge, also when an earlier pairing is stored, and the stored pairing is replaced only on confirmation. `gadgets pair --reset` forgets it.

Demonstration: the scripted proof checks that tests pass, packing is byte-identical, a push is attributed to the pusher and hash-verified, the blueprint appears only in the pusher's library, an identity outside the policy, a forged token, and a forged assertion are refused, and removing an identity from the policy revokes its existing token.

## Configuration

| Setting | Effect |
| --- | --- |
| `GADGETS_CONFIG_DIR` | Overrides where credentials are stored |
| `GADGETS_SKILLS_DIR` | Overrides the skills directory |
| `GADGETS_DEMO_POLICY` | Overrides the demonstration's policy file |
| `GADGETS_DEMO_*_PORT` | Overrides the demonstration's ports |
| `packages/gadgets-cli/policy.json` | The mock edge's allow-list, re-read on every request. Ignored by git; created from `src/demo/policy.example.json` |

## Upstream Touchpoints

| Upstream file | Edit | Why it could not be a net-new file |
| --- | --- | --- |
| `.gitignore` | Adds `.env` | A file at the repository root can only be ignored from the root ignore file or a clone-local exclude |
| `scripts/env-passthrough.test.ts` | Registers the environment variables `packages/gadgets-cli` reads | The test fails on any build-time environment read that is not listed in its own table |
| `pnpm-lock.yaml` | Adds the fork's packages | Generated by the package manager for the whole workspace |

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/bundled-blueprints` | The blueprint manifest parser, source file reader, content builder, and archive serializer used by packing |
| `packages/workshop-shared/src/api.ts` | `whoami`, `importBlueprint`, `downloadBlueprint`, `authenticate`, and authentication from Cloudflare Access |
| `packages/workshop-backend` | Access-mode authentication and blueprint import, run unmodified by the demonstration |
| `packages/workshop-frontend/vite.config.ts` | Base configuration merged by the harness configuration |
| `packages/gatekeeper-scheduler` | The scheduled callback contract `breakout-workflow` implements |

## Divergences from Design

None.

## Open Questions

- The session handed to a harness is the browser's full session. It cannot be scoped or revoked without a kernel change.
- The manifest `revision` field is validated but is not written into the archive metadata.
- `breakout-workflow.gadget` at the repository root is a packed archive outside any ignore rule.
- Push with `--skip-tests` packs the live directory, not a snapshot.
