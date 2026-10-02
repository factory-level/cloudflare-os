---
title: Env-Sourced Anthropic Model
status: draft
covers:
  - packages/workshop-backend/src/env-models.ts
  - packages/workshop-backend/src/fork-env.d.ts
  - packages/workshop-backend/__tests__/env-models.test.ts
touchpoints:
  - packages/workshop-backend/src/user.ts
  - scripts/run-dev-server.ts
updated: 2026-10-02
---

# Env-Sourced Anthropic Model

## Overview

When `ANTHROPIC_API_KEY` is set in the Workshop Worker's environment, every user is offered one deployment-wide Anthropic model. It is listed first, so it is the default for new chats. The model calls `https://api.anthropic.com` directly through the existing `getModelDirect` path in `ai-models.ts`. Its purpose is to let a local or self-hosted Workshop (`pnpm run-local`) chat with a real model without each user adding their own key.

## Components

| Path | Responsibility |
| --- | --- |
| `packages/workshop-backend/src/env-models.ts` | `envModelList(env)` returns the profile to list, or nothing when there is no key. `resolveEnvModel(env, id)` returns the full record, with the key read from env |
| `packages/workshop-backend/src/fork-env.d.ts` | Declares `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` on `Cloudflare.Env` without editing upstream `env.d.ts` |
| `packages/workshop-backend/__tests__/env-models.test.ts` | Covers listing, resolution, the model override, and fresh key reads |

## Data and Control Flow

1. `scripts/run-dev-server.ts` loads the root `.dev.vars` (or the shell environment). It copies `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` into the generated, gitignored `packages/workshop-backend/wrangler.dev.jsonc` as vars.
2. `User#listModels` puts `envModelList(env)` ahead of the user's stored models. Clients receive only the profile (`id`, `name`), never the key.
3. `User#resolveModel` is the single lookup used by chats, `setPreferredModel` and external-message context. It checks the gateway model, then `resolveEnvModel`, then the stored model. The key is never written to the user Durable Object.
4. `getModel` in `ai-models.ts` sends the resolved config to `getModelDirect`, which uses the `anthropic` provider and `x-api-key` auth.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Enables the env model when set |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model ID. The name comes from `SUGGESTED_MODELS.anthropic`, falling back to the ID |

`wrangler dev` prints plain vars in its startup bindings table, including a prefix of the key. Keep dev-server logs local, or pass the key as a secret in a deployed Worker.

The env model is disabled whenever platform AI Gateway mode (`CF_AI_GATEWAY`) is active. That mode routes every model through the gateway and ignores per-config tokens.

## Upstream Touchpoints

| File | Edit |
| --- | --- |
| `packages/workshop-backend/src/user.ts` | Imports `env-models.js`. `#listModels` starts from `envModelList(this.env)` when there is no gateway. `#resolveModel` tries `resolveEnvModel` between the gateway and stored models |
| `scripts/run-dev-server.ts` | Adds `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` to `OPTIONAL_FEATURE_VARS` |

## Divergences from Design

- No design doc or ADR exists for this change. It was made to bring the platform up locally against a real model.
- The front matter carries `status: draft`, which `_docs/AGENTS.md` does not list for architecture docs. It was written before the fork doc rules existed.
- Hand-added models with the same ID as the env model are shadowed by it. Unlike gateway models, the `addModel`, `deleteModel` and `#getHandAddedModel` checks do not account for env models.

## Open Questions

- Should a deployed (non-dev) Workshop accept this as a Worker secret, or stay limited to dev?
- Should the quick model (titles) also default to the env model?
