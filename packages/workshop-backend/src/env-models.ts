// Fork-owned: a deployment-wide Anthropic model sourced from env (ANTHROPIC_API_KEY), so a local
// or self-hosted Workshop can chat with a real model without each user adding their own key.
// See _docs/architecture/env-anthropic-model.md.
//
// The key is read from env on every resolve and never stored in the user DO. Only the profile
// (id + name) is ever listed to clients.

import { AiChatAuthorInfo, SUGGESTED_MODELS } from "@gadgets/workshop-shared/api";
import type { UserAiModelRecord } from "./user.js";

const DEFAULT_ENV_MODEL = "claude-sonnet-5-5";

function envModelProfile(env: Cloudflare.Env): AiChatAuthorInfo | undefined {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  let id = env.ANTHROPIC_MODEL || DEFAULT_ENV_MODEL;
  let name = SUGGESTED_MODELS.anthropic?.[id]?.name ?? id;
  return { type: "agent", id, name };
}

/** The env-sourced models to list ahead of the user's own, or none when no key is set. */
export function envModelList(env: Cloudflare.Env): AiChatAuthorInfo[] {
  let profile = envModelProfile(env);
  return profile ? [profile] : [];
}

/** Resolve an env-sourced model by ID, with its key read fresh from env. */
export function resolveEnvModel(env: Cloudflare.Env, id: string): UserAiModelRecord | undefined {
  let profile = envModelProfile(env);
  if (!profile || profile.id !== id) return undefined;
  let suggested = SUGGESTED_MODELS.anthropic?.[id];
  return {
    profile,
    config: {
      provider: "anthropic",
      model: id,
      apiToken: env.ANTHROPIC_API_KEY!,
      ...(suggested?.contextWindow ? { contextWindow: suggested.contextWindow } : {}),
    },
  };
}
