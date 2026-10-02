#!/usr/bin/env node
// `gadgets`: author skills locally, push them to a Workshop as yourself.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { readBarsCsv } from "./bars.ts";
import { readAccessCredential, readHarnessPairing, saveHarnessPairing } from "./credentials.ts";
import { devLoop } from "./dev.ts";
import { renderComparison, renderExplain, renderReplay } from "./format.ts";
import { checkGolden, updateGolden } from "./golden.ts";
import { compareSkills, outcomeOf, type ReplayEntry, replaySkill, stable } from "./replay.ts";
import { DEFAULT_SOURCES, newSkill } from "./scaffold.ts";
import { openTarget } from "./target.ts";
import { callGadget, cleanTried, latestTried, readTried, tryInWorkshop } from "./workspace.ts";
import { loginToWorkshop } from "./login.ts";
import { serveMcp } from "./mcp.ts";
import { publishRevision } from "./lab.ts";
import { parseBind, resolveBindings, suggestedBindings } from "./bindings.ts";
import { packSkill } from "./pack.ts";
import { qualifySkill } from "./qualify.ts";
import { listSkills, resolveSkillDir, testSkill } from "./skills.ts";
import { testAndPack } from "./snapshot.ts";
import { connectWithAccess, downloadContentSha256, pushSkill } from "./workshop.ts";

const USAGE = `Usage:
  Inner loop (this machine only, no Workshop):
  gadgets new <name> [--kind workflow|skill] [--from <skill>]
  gadgets dev <skill>                                   (replay and test on every save)
  gadgets run <skill> [--scenario <name>] [--bars <file.csv> [--walk]] [--explain]
  gadgets compare <skill-a> <skill-b> [--bars <file.csv> [--walk]]
  gadgets golden <skill> [--update]

  Middle loop (in a Workshop: --to <url>, or the paired local one):
  gadgets try <skill> [--to <workshop-url>] [--method <name>] [--args <json-array>]
              [--bind NAME=vendor:resourceUrl ...]   (default: the skill's suggested bindings)
  gadgets call <skill> <method> [--args <json-array>] [--to <workshop-url>]
  gadgets runs <skill> [--to <workshop-url>]            (recorded scheduled runs)
  gadgets clean [--to <workshop-url>]                   (delete the workspaces try created)
  gadgets status [--to <workshop-url>]

  gadgets skill list
  gadgets skill test <skill>
  gadgets skill pack <skill> [--out <file.gadget>]
  gadgets qualify <skill> [--out <record.json>]
  gadgets publish <skill> --lab <lab-url>
  gadgets login <workshop-url> [--email <identity>]     (--email: demo mock edge only)
  gadgets push <skill> --to <workshop-url> [--skip-tests]
  gadgets verify <blueprint-id> --to <workshop-url> --sha256 <hash>
  gadgets mcp [--pair <code>] [--pairing-port <port>]   (run by an agent harness)
  gadgets pair --reset                                  (forget the paired local Workshop)

Add --json to run, compare, golden and new for machine-readable output.
<skill> is a name under packages/skills/skills or a path to a skill directory.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      to: { type: "string" },
      out: { type: "string" },
      lab: { type: "string" },
      email: { type: "string" },
      sha256: { type: "string" },
      pair: { type: "string" },
      "pairing-port": { type: "string" },
      "skip-tests": { type: "boolean" },
      reset: { type: "boolean" },
      kind: { type: "string" },
      from: { type: "string" },
      scenario: { type: "string" },
      bars: { type: "string" },
      walk: { type: "boolean" },
      explain: { type: "boolean" },
      update: { type: "boolean" },
      json: { type: "boolean" },
      method: { type: "string" },
      bind: { type: "string", multiple: true },
      args: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  switch (command) {
    case "skill":
      return await skillCommand(rest[0], rest[1], values.out);

    case "login": {
      const url = required(rest[0], "workshop-url");
      const { origin, email } = await loginToWorkshop(url, { email: values.email });
      console.log(`Logged in to ${origin}${email ? ` as ${email}` : ""}.`);
      return 0;
    }

    case "push": {
      const target = required(values.to, "--to");
      const directory = await resolveSkillDir(required(rest[0], "skill"));
      let packed;
      if (values["skip-tests"]) {
        packed = await packSkill(directory);
      } else {
        // Tested and packed from one snapshot, so the pushed archive is the tested one.
        const tested = await testAndPack(directory);
        if (!tested.tests.passed) {
          console.error(tested.tests.output);
          console.error("Tests failed; not pushing.");
          return 1;
        }
        console.log("Tests passed.");
        packed = tested.packed;
      }
      const credential = await readAccessCredential(target);
      if (!credential) throw new Error(`Not logged in to ${target}; run: gadgets login ${target}`);
      using api = await connectWithAccess(target, credential.token);
      using user = api.authenticateFromCfAccess();
      const result = await pushSkill(api, user, packed);
      console.log(JSON.stringify({ contentSha256: packed.contentSha256, ...result }, null, 2));
      return result.verified ? 0 : 1;
    }

    case "new": {
      const kind = values.kind ?? "workflow";
      if (kind !== "workflow" && kind !== "skill") throw new Error("--kind must be workflow or skill");
      const name = required(rest[0], "name");
      const directory = await newSkill(name, values.from ?? DEFAULT_SOURCES[kind]);
      console.log(values.json ? JSON.stringify({ name, directory }, null, 2)
          : `Created ${directory}\nNext: gadgets dev ${name}`);
      return 0;
    }

    case "dev": {
      const directory = await resolveSkillDir(required(rest[0], "skill"));
      const stop = new AbortController();
      process.once("SIGINT", () => stop.abort());
      await devLoop(directory, text => console.log(text), stop.signal);
      return 0;
    }

    case "run": {
      const directory = await resolveSkillDir(required(rest[0], "skill"));
      const entries = await replaySkill(directory, {
        scenario: values.scenario,
        bars: values.bars ? await readBarsCsv(values.bars) : undefined,
        walk: values.walk,
      });
      console.log(values.json ? JSON.stringify(entries, null, 2)
          : values.explain ? renderExplain(entries) : renderReplay(entries));
      return entries.some(entry => "error" in entry) && !values.walk ? 1 : 0;
    }

    case "compare": {
      const [a, b] = [required(rest[0], "skill-a"), required(rest[1], "skill-b")];
      const rows = await compareSkills(await resolveSkillDir(a), await resolveSkillDir(b),
          { bars: values.bars ? await readBarsCsv(values.bars) : undefined, walk: values.walk });
      console.log(values.json ? JSON.stringify(rows, null, 2) : renderComparison(rows, a, b));
      return 0;
    }

    case "golden": {
      const directory = await resolveSkillDir(required(rest[0], "skill"));
      const diff = values.update ? await updateGolden(directory) : await checkGolden(directory);
      if (values.json) {
        console.log(JSON.stringify({ updated: Boolean(values.update), ...diff }, null, 2));
      } else if (diff.matches) {
        console.log("Golden file matches current behaviour.");
      } else {
        const verb = values.update ? "Accepted" : "Differs";
        for (const [label, names] of [["changed", diff.changed], ["added", diff.added], ["removed", diff.removed]] as const) {
          if (names.length) console.log(`${verb} (${label}): ${names.join(", ")}`);
        }
        if (!values.update) console.log("Accept with --update once the change is intended.");
      }
      return diff.matches || values.update ? 0 : 1;
    }

    case "try": {
      const directory = await resolveSkillDir(required(rest[0], "skill"));
      const { tests, packed } = await testAndPack(directory);
      if (!tests.passed) {
        console.error(tests.output);
        console.error("Tests failed; not trying it in a Workshop.");
        return 1;
      }
      using opened = await openTarget(values.to);
      const { bindings, skipped } = await resolveBindings(
          opened.user, (values.bind ?? []).map(parseBind), await suggestedBindings(directory));
      for (const reason of skipped) console.error(`Not bound: ${reason}`);
      const { workspace, identity } = await tryInWorkshop(opened.api, opened.user, packed, opened.target, bindings);
      const method = values.method ?? "runFixtures";
      const result = await callGadget(opened.user, workspace, method, jsonArgs(values.args));
      const local = method === "runFixtures" ? await replaySkill(directory) : undefined;
      const matchesLocal = local === undefined ? undefined : sameAsLocal(result, local);
      if (values.json) {
        console.log(JSON.stringify({ workspace, identity, method, result, matchesLocal }, null, 2));
      } else {
        console.log(`Created workspace ${workspace.workspaceId} in ${workspace.target} as ${identity.name}`
          + ` from ${workspace.skill}@${workspace.version} (sha256:${workspace.contentSha256}).`);
        // When the gadget agrees with the local replay, the replay's table is the readable form of both.
        console.log(matchesLocal && local ? renderReplay(local) : JSON.stringify(summarize(result), null, 2));
        if (matchesLocal !== undefined) {
          console.log(matchesLocal ? "The Workshop's results equal the local replay."
              : "The Workshop's results DIFFER from the local replay.");
        }
      }
      return matchesLocal === false ? 1 : 0;
    }

    case "call":
    case "runs": {
      const skill = required(rest[0], "skill");
      const method = command === "runs" ? "scheduledRuns" : required(rest[1], "method");
      using opened = await openTarget(values.to);
      const workspace = await latestTried(skill, opened.target);
      if (!workspace) throw new Error(`No workspace for ${skill} in ${opened.target}; run: gadgets try ${skill}`);
      const result = await callGadget(opened.user, workspace, method, jsonArgs(values.args));
      console.log(JSON.stringify(values.json ? result : summarize(result), null, 2));
      return 0;
    }

    case "clean": {
      using opened = await openTarget(values.to);
      const { removed, failed } = await cleanTried(opened.user, opened.target);
      if (values.json) console.log(JSON.stringify({ removed, failed }, null, 2));
      else {
        console.log(`Removed ${removed.length} workspace(s) from ${opened.target}.`);
        for (const line of failed) console.error(`Could not remove ${line}`);
      }
      return failed.length ? 1 : 0;
    }

    case "status": {
      const tried = await readTried();
      const pairing = await readHarnessPairing();
      let workshop: Record<string, unknown>;
      try {
        using opened = await openTarget(values.to);
        const who = await opened.user.whoami();
        workshop = { target: opened.target, reachable: true, identity: who.name };
      } catch (err) {
        workshop = { target: values.to ?? pairing?.apiUrl ?? null, reachable: false,
          reason: err instanceof Error ? err.message : String(err) };
      }
      const status = {
        workshop,
        paired: pairing ? { workshop: pairing.apiUrl, identity: pairing.identity.name, since: pairing.pairedAt } : null,
        skills: (await listSkills()).map(skill => `${skill.name}@${skill.version}`),
        triedWorkspaces: tried.map(entry => `${entry.skill}@${entry.version} in ${entry.target} (${entry.workspaceId})`),
      };
      if (values.json) console.log(JSON.stringify(status, null, 2));
      else {
        console.log(workshop.reachable ? `Workshop ${workshop.target}: signed in as ${workshop.identity}`
            : `Workshop ${workshop.target ?? "(none)"}: not reachable (${workshop.reason})`);
        console.log(status.paired ? `Paired with ${status.paired.workshop} as ${status.paired.identity}` : "Not paired with a local Workshop");
        console.log(`Skills: ${status.skills.join(", ")}`);
        console.log(`Tried workspaces: ${status.triedWorkspaces.length ? `\n  ${status.triedWorkspaces.join("\n  ")}` : "none"}`);
      }
      return 0;
    }

    case "qualify": {
      const { record } = await qualifySkill(await resolveSkillDir(required(rest[0], "skill")));
      const json = JSON.stringify(record, null, 2);
      if (values.out) await writeFile(values.out, `${json}\n`);
      console.log(json);
      return record.passed ? 0 : 1;
    }

    case "publish": {
      const lab = required(values.lab, "--lab");
      const qualified = await qualifySkill(await resolveSkillDir(required(rest[0], "skill")));
      if (!qualified.record.passed) {
        console.error(JSON.stringify(qualified.record.checks.filter(check => !check.passed), null, 2));
        console.error("Qualification failed; not publishing.");
        return 1;
      }
      const credential = await readAccessCredential(lab);
      if (!credential) throw new Error(`Not logged in to ${lab}; run: gadgets login ${lab}`);
      const outcome = await publishRevision(lab, credential.token, qualified);
      console.log(JSON.stringify({
        revision: `${qualified.record.kind}/${qualified.record.name}@${qualified.record.number}`,
        contentHash: qualified.record.contentHash,
        ...outcome,
      }, null, 2));
      return outcome.published ? 0 : 1;
    }

    case "verify": {
      const target = required(values.to, "--to");
      const expected = required(values.sha256, "--sha256");
      const credential = await readAccessCredential(target);
      if (!credential) throw new Error(`Not logged in to ${target}; run: gadgets login ${target}`);
      using api = await connectWithAccess(target, credential.token);
      const actual = await downloadContentSha256(api, required(rest[0], "blueprint-id"));
      console.log(actual === expected ? `OK ${actual}` : `MISMATCH expected ${expected}, got ${actual}`);
      return actual === expected ? 0 : 1;
    }

    case "pair": {
      const pairing = await readHarnessPairing();
      if (!values.reset) {
        console.log(pairing
          ? `Paired with ${pairing.apiUrl} as ${pairing.identity.name} since ${pairing.pairedAt}.`
          : "Not paired. In the local Workshop, choose \"Connect local agent harness\".");
        return 0;
      }
      await saveHarnessPairing(null);
      console.log(pairing ? `Forgot the pairing with ${pairing.apiUrl}.` : "There was no pairing.");
      return 0;
    }

    case "mcp": {
      const port = values["pairing-port"];
      await serveMcp({ pairCode: values.pair, pairingPort: port ? Number(port) : undefined });
      // The harness closed stdin; a pairing listener still waiting must not keep us alive.
      process.exit(0);
    }

    default:
      console.error(USAGE);
      return 1;
  }
}

async function skillCommand(sub: string | undefined, skill: string | undefined, out?: string)
    : Promise<number> {
  switch (sub) {
    case "list":
      for (const summary of await listSkills()) {
        console.log(`${summary.name}\t${summary.blueprintId}\tv${summary.version}\t${summary.title}`);
      }
      return 0;
    case "test": {
      const run = await testSkill(await resolveSkillDir(required(skill, "skill")));
      console.log(run.output);
      return run.passed ? 0 : 1;
    }
    case "pack": {
      const packed = await packSkill(await resolveSkillDir(required(skill, "skill")));
      const file = out ?? `${packed.name}.gadget`;
      await writeFile(file, packed.archive);
      console.log(`${file}\t${packed.archive.byteLength} bytes\tsha256:${packed.contentSha256}`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 1;
  }
}

/** `--args`, which must be a JSON array of the call's arguments. */
function jsonArgs(text: string | undefined): unknown[] {
  if (text === undefined) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("--args must be a JSON array, e.g. --args '[5]'");
  return parsed;
}

/** Whether a gadget's `runFixtures()` result equals the local replay of the same scenarios. */
function sameAsLocal(remote: unknown, local: ReplayEntry[]): boolean {
  if (!Array.isArray(remote) || remote.length !== local.length) return false;
  return local.every((entry, index) => {
    const run = remote[index] as { name?: unknown; result?: unknown };
    return run.name === entry.name && stable(run.result) === stable(outcomeOf(entry));
  });
}

/** A result short enough to read: evidence data and nested detail are dropped from fixture runs. */
function summarize(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map(item => {
    const run = item as { name?: unknown; result?: Record<string, unknown> };
    if (typeof run?.name !== "string" || typeof run.result !== "object" || run.result === null) return item;
    const { evidence: _evidence, ...rest } = run.result;
    return { name: run.name, ...rest };
  });
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}.\n\n${USAGE}`);
  return value;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
