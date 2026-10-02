import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";

describe("gadgets mcp", () => {
  it("speaks MCP over stdio and lists its tools", async () => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "bin.ts"), "mcp"], {
      env: { ...process.env, GADGETS_CONFIG_DIR: mkdtempSync(join(tmpdir(), "gadgets-mcp-test-")) },
    });
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const request = async (id: number, method: string, params: unknown = {}) => {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      return JSON.parse((await lines.next()).value as string);
    };

    const init = await request(1, "initialize",
        { protocolVersion: "2025-06-18", clientInfo: { name: "claude-code" }, capabilities: {} });
    expect(init.result.serverInfo.name).toBe("gadgets");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const tools = await request(2, "tools/list");
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "workshop_status", "list_skills", "test_skill", "pack_skill", "new_skill", "replay_skill", "compare_skills",
      "check_golden", "try_skill", "call_gadget", "clean_workspaces", "qualify_skill", "publish_revision",
      "install_skill_locally", "push_skill",
    ]);

    const status = await request(3, "tools/call", { name: "workshop_status", arguments: {} });
    expect(JSON.parse(status.result.content[0].text)).toMatchObject({ paired: false });

    const push = await request(4, "tools/call",
        { name: "push_skill", arguments: { skill: "momentum-signal", target: "https://prod.example.com" } });
    expect(push.result.isError).toBe(true);
    expect(push.result.content[0].text).toMatch(/A human must run: gadgets login/);

    const escape = await request(5, "tools/call", { name: "pack_skill", arguments: { skill: "../../etc" } });
    expect(escape.result.isError).toBe(true);

    child.stdin.end();
    await new Promise(resolve => child.on("exit", resolve));
  }, 30_000);

  it("listens for a fresh pairing code even when an earlier pairing is saved", async () => {
    const config = mkdtempSync(join(tmpdir(), "gadgets-mcp-test-"));
    writeFileSync(join(config, "credentials.json"), JSON.stringify({
      access: {},
      harness: { apiUrl: "ws://127.0.0.1:1/api", sessionToken: "stale:stale",
        identity: { id: "old", name: "Old Session" }, pairedAt: "2026-01-01T00:00:00.000Z" },
    }));
    const port = 47900 + Math.floor(Math.random() * 90);
    const child = spawn(process.execPath,
        [join(import.meta.dirname, "bin.ts"), "mcp", "--pair", "fresh-code", "--pairing-port", String(port)],
        { env: { ...process.env, GADGETS_CONFIG_DIR: config } });
    try {
      let status = 0;
      for (let attempt = 0; attempt < 50 && status !== 200; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        status = await fetch(`http://127.0.0.1:${port}/harness/fresh-code`,
            { headers: { origin: "http://localhost:3000" } }).then(r => r.status, () => 0);
      }
      expect(status).toBe(200);
    } finally {
      child.kill();
    }
  }, 30_000);
});
