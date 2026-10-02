// `gadgets mcp`: an MCP server (stdio) that lets a local agent harness such as Claude Code author,
// test and ship skills, and act in the local Workshop as the developer who paired it.
//
// The harness runs on the developer's own subscription, in its own process; nothing here relays or
// sees its model traffic. What the harness gets is a set of tools, each a thin call into the same
// modules the CLI uses. The two that reach a Workshop keep the CLI's authority split: the local
// Workshop through the pairing, and any other Workshop only through an Access token a human
// obtained with `gadgets login`, so a push is attributed to that human.

import { createInterface } from "node:readline";
import { readAccessCredential, readHarnessPairing } from "./credentials.ts";
import { checkGolden } from "./golden.ts";
import { compareSkills, outcomeOf, replaySkill, stable } from "./replay.ts";
import { DEFAULT_SOURCES, newSkill } from "./scaffold.ts";
import { publishRevision } from "./lab.ts";
import { packSkill } from "./pack.ts";
import { qualifySkill } from "./qualify.ts";
import { DEFAULT_PAIRING_PORT, startPairingListener } from "./pairing.ts";
import { listSkills, resolveSkillDir, testSkill } from "./skills.ts";
import { testAndPack } from "./snapshot.ts";
import { openTarget } from "./target.ts";
import { callGadget, cleanTried, latestTried, tryInWorkshop } from "./workspace.ts";
import { connectSession, connectWithAccess, pushSkill } from "./workshop.ts";

const PROTOCOL_VERSION = "2025-06-18";

type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const skillArg = { skill: { type: "string", description: "Skill name (directory under packages/skills/skills)" } };

const TOOLS: Tool[] = [
  {
    name: "workshop_status",
    description: "Whether this harness is paired with the local Workshop, and as whom.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const pairing = await readHarnessPairing();
      return pairing
        ? { paired: true, identity: pairing.identity, workshop: pairing.apiUrl, pairedAt: pairing.pairedAt }
        : { paired: false, howToPair: "In the local Workshop, choose \"Connect local agent harness\" and run the command it shows." };
    },
  },
  {
    name: "list_skills",
    description: "List the skills authored in this repository (packages/skills/skills).",
    inputSchema: { type: "object", properties: {} },
    run: async () => await listSkills(),
  },
  {
    name: "test_skill",
    description: "Run a skill's deterministic tests (its __tests__ against fixed fixtures).",
    inputSchema: { type: "object", properties: skillArg, required: ["skill"] },
    run: async args => await testSkill(await resolveSkillDir(stringArg(args, "skill"))),
  },
  {
    name: "pack_skill",
    description: "Pack a skill into a .gadget archive and report its content hash. Identical source always gives the same hash.",
    inputSchema: { type: "object", properties: skillArg, required: ["skill"] },
    run: async args => {
      const packed = await packSkill(await resolveSkillDir(stringArg(args, "skill")));
      return { blueprintId: packed.blueprintId, version: packed.version,
        bytes: packed.archive.byteLength, contentSha256: packed.contentSha256 };
    },
  },
  {
    name: "new_skill",
    description: "Create a new skill by copying a working one (default: breakout-workflow), renamed and reset to version 1. Start here, then edit its files/lib.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "New skill name: lowercase letters, digits, hyphens" },
        from: { type: "string", description: "Skill to copy; defaults to breakout-workflow" } },
      required: ["name"],
    },
    run: async args => ({ directory: await newSkill(stringArg(args, "name"),
        typeof args.from === "string" ? args.from : DEFAULT_SOURCES.workflow) }),
  },
  {
    name: "replay_skill",
    description: "Run a skill's decision logic locally on its built-in scenarios, or on supplied bars ({t, closeCents, volume}, oldest first), and return each decision with its evidence chain. No Workshop and no model are involved. With walk, runs one session per bar carrying the portfolio forward.",
    inputSchema: {
      type: "object",
      properties: { ...skillArg, scenario: { type: "string" },
        bars: { type: "array", items: { type: "object" } }, walk: { type: "boolean" } },
      required: ["skill"],
    },
    run: async args => await replaySkill(await resolveSkillDir(stringArg(args, "skill")), {
      scenario: typeof args.scenario === "string" ? args.scenario : undefined,
      bars: Array.isArray(args.bars) ? args.bars as never : undefined,
      walk: args.walk === true,
    }),
  },
  {
    name: "compare_skills",
    description: "Feed two skills identical inputs (the first skill's scenarios) and report, per scenario, each one's decision and whether their full results are the same. Descriptive only; it does not say which is better.",
    inputSchema: {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a", "b"],
    },
    run: async args => await compareSkills(
        await resolveSkillDir(stringArg(args, "a")), await resolveSkillDir(stringArg(args, "b"))),
  },
  {
    name: "check_golden",
    description: "Compare a skill's current behaviour with its committed golden file and list the scenarios that changed. Accepting a change (`gadgets golden <skill> --update`) is for the human to run.",
    inputSchema: { type: "object", properties: skillArg, required: ["skill"] },
    run: async args => await checkGolden(await resolveSkillDir(stringArg(args, "skill"))),
  },
  {
    name: "try_skill",
    description: "Test a skill, push it, create a fresh workspace from it and call its runFixtures there. Acts in the paired local Workshop, or in `target` under the Access login a human made with `gadgets login`. Reports whether the Workshop's results equal the local replay.",
    inputSchema: { type: "object", properties: { ...skillArg, target: { type: "string" } }, required: ["skill"] },
    run: async args => {
      const directory = await resolveSkillDir(stringArg(args, "skill"));
      const { tests, packed } = await testAndPack(directory);
      if (!tests.passed) return { tried: false, reason: "tests failed", output: tests.output };
      using opened = await openTarget(typeof args.target === "string" ? args.target : undefined);
      const { workspace, identity } = await tryInWorkshop(opened.api, opened.user, packed, opened.target);
      const result = await callGadget(opened.user, workspace, "runFixtures");
      const local = await replaySkill(directory);
      const matchesLocal = Array.isArray(result) && result.length === local.length && local.every((entry, index) =>
          stable((result[index] as { result?: unknown }).result) === stable(outcomeOf(entry)));
      return { tried: true, workspace, identity, matchesLocal, result };
    },
  },
  {
    name: "call_gadget",
    description: "Call a server method on the workspace most recently created for a skill by try_skill, e.g. replay with bars, or scheduledRuns.",
    inputSchema: {
      type: "object",
      properties: { ...skillArg, method: { type: "string" }, args: { type: "array" }, target: { type: "string" } },
      required: ["skill", "method"],
    },
    run: async args => {
      using opened = await openTarget(typeof args.target === "string" ? args.target : undefined);
      const workspace = await latestTried(stringArg(args, "skill"), opened.target);
      if (!workspace) throw new Error("No workspace for that skill here; use try_skill first.");
      return await callGadget(opened.user, workspace, stringArg(args, "method"), Array.isArray(args.args) ? args.args : []);
    },
  },
  {
    name: "clean_workspaces",
    description: "Delete every workspace try_skill created in the Workshop, and the blueprints they came from.",
    inputSchema: { type: "object", properties: { target: { type: "string" } } },
    run: async args => {
      using opened = await openTarget(typeof args.target === "string" ? args.target : undefined);
      return await cleanTried(opened.user, opened.target);
    },
  },
  {
    name: "qualify_skill",
    description: "Run every qualification check on a skill (revision manifest, deterministic pack, pins, secret scan, tests) and return the record bound to its content hash. A revision can only be published when this passes.",
    inputSchema: { type: "object", properties: skillArg, required: ["skill"] },
    run: async args => (await qualifySkill(await resolveSkillDir(stringArg(args, "skill")))).record,
  },
  {
    name: "publish_revision",
    description: "Publish a qualified skill to the trading lab's registry as an immutable revision, under the identity of the human who ran `gadgets login <lab>`. Qualifies first and refuses when any check fails. The lab recomputes the content hash and may refuse.",
    inputSchema: {
      type: "object",
      properties: { ...skillArg, lab: { type: "string", description: "Lab URL, e.g. https://lab.example.com" } },
      required: ["skill", "lab"],
    },
    run: async args => {
      const lab = stringArg(args, "lab");
      const credential = await readAccessCredential(lab);
      if (!credential) throw new Error(`No login for ${lab}. A human must run: gadgets login ${lab}`);
      const qualified = await qualifySkill(await resolveSkillDir(stringArg(args, "skill")));
      return { contentHash: qualified.record.contentHash, checks: qualified.record.checks,
        ...await publishRevision(lab, credential.token, qualified) };
    },
  },
  {
    name: "install_skill_locally",
    description: "Import a skill into the paired developer's library in the local Workshop, so it can be tried there.",
    inputSchema: { type: "object", properties: skillArg, required: ["skill"] },
    run: async args => {
      const pairing = await readHarnessPairing();
      if (!pairing) throw new Error("Not paired with a local Workshop; see workshop_status.");
      const packed = await packSkill(await resolveSkillDir(stringArg(args, "skill")));
      using api = connectSession(pairing.apiUrl);
      using user = api.authenticate(pairing.sessionToken);
      return { contentSha256: packed.contentSha256, ...await pushSkill(api, user, packed) };
    },
  },
  {
    name: "push_skill",
    description: "Push a skill to a deployed Workshop under the identity of the human who ran `gadgets login <target>`. Tests the skill first and refuses to push if they fail.",
    inputSchema: {
      type: "object",
      properties: { ...skillArg, target: { type: "string", description: "Workshop URL, e.g. https://gadgets.example.com" } },
      required: ["skill", "target"],
    },
    run: async args => {
      const target = stringArg(args, "target");
      const credential = await readAccessCredential(target);
      if (!credential) {
        throw new Error(`No login for ${target}. A human must run: gadgets login ${target}`);
      }
      const { tests, packed } = await testAndPack(await resolveSkillDir(stringArg(args, "skill")));
      if (!tests.passed) return { pushed: false, reason: "tests failed", output: tests.output };
      using api = await connectWithAccess(target, credential.token);
      using user = api.authenticateFromCfAccess();
      return { pushed: true, contentSha256: packed.contentSha256, ...await pushSkill(api, user, packed) };
    },
  },
];

/** Serves MCP on stdin/stdout until stdin closes. Logs go to stderr; stdout carries only protocol. */
export async function serveMcp(options: { pairCode?: string; pairingPort?: number }): Promise<void> {
  let clientName = "agent-harness";
  // A fresh code is an explicit request to pair, also over an earlier pairing that has gone stale
  // (a reset Workshop, another account). The saved pairing is replaced only once the developer
  // confirms in the Workshop.
  if (options.pairCode) {
    try {
      await startPairingListener({
        code: options.pairCode,
        port: options.pairingPort ?? DEFAULT_PAIRING_PORT,
        harness: () => clientName,
        onPaired: pairing => log(`paired with the local Workshop as ${pairing.identity.name}`),
      });
      log(`waiting to be paired on 127.0.0.1:${options.pairingPort ?? DEFAULT_PAIRING_PORT}`);
    } catch (err) {
      log(`could not listen for pairing: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    let request: { id?: number | string; method?: string; params?: Record<string, unknown> };
    try {
      request = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    if (request.id === undefined) continue;  // A notification; none needs an answer.

    const respond = (result: unknown) => send({ jsonrpc: "2.0", id: request.id, result });
    switch (request.method) {
      case "initialize": {
        const info = request.params?.clientInfo as { name?: unknown } | undefined;
        if (typeof info?.name === "string") clientName = info.name;
        respond({
          protocolVersion: typeof request.params?.protocolVersion === "string"
              ? request.params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "gadgets", version: "1.0.0" },
        });
        break;
      }
      case "ping":
        respond({});
        break;
      case "tools/list":
        respond({ tools: TOOLS.map(({ run: _run, ...tool }) => tool) });
        break;
      case "tools/call": {
        const tool = TOOLS.find(candidate => candidate.name === request.params?.name);
        if (!tool) {
          send({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Unknown tool" } });
          break;
        }
        try {
          const result = await tool.run((request.params?.arguments ?? {}) as Record<string, unknown>);
          respond({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (err) {
          respond({ isError: true,
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] });
        }
        break;
      }
      default:
        send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
    }
  }
}

function send(message: unknown): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  return value;
}

function log(message: string): void {
  process.stderr.write(`[gadgets mcp] ${message}\n`);
}
