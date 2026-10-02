import { describe, expect, it } from "vitest";
import { envModelList, resolveEnvModel } from "../src/env-models.js";

function env(overrides: Partial<Cloudflare.Env> = {}): Cloudflare.Env {
  return { ...overrides } as Cloudflare.Env;
}

describe("env-sourced Anthropic model", () => {
  it("offers nothing without a key", () => {
    expect(envModelList(env())).toEqual([]);
    expect(resolveEnvModel(env(), "claude-sonnet-5-5")).toBeUndefined();
  });

  it("offers the default model with the env key", () => {
    let e = env({ ANTHROPIC_API_KEY: "sk-test" });
    expect(envModelList(e)).toEqual([
      { type: "agent", id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    ]);
    expect(resolveEnvModel(e, "claude-sonnet-5-5")?.config).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5-5", apiToken: "sk-test",
    });
  });

  it("honors ANTHROPIC_MODEL and resolves only that ID", () => {
    let e = env({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODEL: "claude-haiku-4-5" });
    expect(envModelList(e).map(m => m.id)).toEqual(["claude-haiku-4-5"]);
    expect(resolveEnvModel(e, "claude-sonnet-5-5")).toBeUndefined();
    expect(resolveEnvModel(e, "claude-haiku-4-5")?.config.model).toBe("claude-haiku-4-5");
  });

  it("reads the key fresh from env on every resolve", () => {
    let e = env({ ANTHROPIC_API_KEY: "first" });
    expect(resolveEnvModel(e, "claude-sonnet-5-5")?.config.apiToken).toBe("first");
    e.ANTHROPIC_API_KEY = "rotated";
    expect(resolveEnvModel(e, "claude-sonnet-5-5")?.config.apiToken).toBe("rotated");
  });
});
