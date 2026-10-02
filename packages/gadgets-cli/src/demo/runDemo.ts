#!/usr/bin/env node
// `pnpm --filter @gadgets/cli demo`: the scripted, deterministic end-to-end proof, run against the
// prod-sim (`demo:prod-sim` must already be running). No model is involved: every step's outcome is
// fixed by the inputs, so the demo passes or fails the same way every time.
//
//   1. The skill's tests pass against their fixtures.
//   2. Packing it twice gives byte-identical archives.
//   3. An allowed identity pushes it; the Workshop attributes it to them and serves back the same
//      content hash.
//   4. It lands in the pusher's library and no one else's.
//   5. An identity outside the policy, a forged token and a forged assertion sent straight to the
//      Workshop are all refused.
//   6. Removing an identity from the policy revokes a token issued before.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { packSkill } from "../pack.ts";
import { mockEdgeToken } from "../login.ts";
import { resolveSkillDir, testSkill } from "../skills.ts";
import { AccessDeniedError, apiUrlFor, connectWithAccess, pushSkill } from "../workshop.ts";
import { DEMO, policyPath } from "./demoConfig.ts";

// Never touch the developer's real credentials.
process.env.GADGETS_CONFIG_DIR = mkdtempSync(join(tmpdir(), "gadgets-demo-"));

const SKILL = process.argv[2] ?? "momentum-signal";
const edge = `http://127.0.0.1:${DEMO.edgePort}`;
const backend = `http://127.0.0.1:${DEMO.prodSimPort}`;

type Row = { step: string; expected: string; actual: string; pass: boolean };
const rows: Row[] = [];
const check = (step: string, expected: string, actual: string, pass = expected === actual) => {
  rows.push({ step, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${step}: ${actual}`);
};

async function refusal(attempt: () => Promise<unknown>): Promise<string> {
  try {
    await attempt();
    return "accepted";
  } catch (err) {
    if (err instanceof AccessDeniedError) return `refused ${err.status}`;
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const directory = await resolveSkillDir(SKILL);

// 1-2. Local proof and determinism.
const tests = await testSkill(directory);
check("skill tests", "pass", tests.passed ? "pass" : "fail");
const first = await packSkill(directory);
const second = await packSkill(directory);
check("pack is deterministic", "identical",
    Buffer.compare(first.archive, second.archive) === 0 ? "identical" : "different");

// 3. Alice pushes.
const aliceToken = await mockEdgeToken(edge, "alice@demo.local");
const alice = await connectWithAccess(edge, aliceToken);
const aliceUser = alice.authenticateFromCfAccess();
const pushed = await pushSkill(alice, aliceUser, first);
check("push attributed to pusher", "alice@demo.local", pushed.identity.id);
check("remote content hash", first.contentSha256, pushed.remoteSha256);

// 4. Ownership.
const aliceLibrary = await aliceUser.listLibraryBlueprints();
check("in alice's library", "yes", aliceLibrary.some(b => b.id === pushed.blueprintId) ? "yes" : "no");
const bob = await connectWithAccess(edge, await mockEdgeToken(edge, "bob@demo.local"));
const bobUser = bob.authenticateFromCfAccess();
const bobLibrary = await bobUser.listLibraryBlueprints();
check("not in bob's library", "no", bobLibrary.some(b => b.id === pushed.blueprintId) ? "yes" : "no");

// 5. Refusals.
check("identity outside policy gets no token", "refused",
    await mockEdgeToken(edge, "mallory@demo.local").then(() => "issued", () => "refused"));
check("forged token at the edge", "refused 403",
    await refusal(() => connectWithAccess(edge, forgedToken("alice@demo.local"))));
const direct = await fetch(new URL("/api", backend), {
  method: "POST",
  headers: { "Origin": backend, "cf-access-jwt-assertion": forgedToken("alice@demo.local") },
  body: "",
});
check("forged assertion straight to the Workshop", "refused 403", `refused ${direct.status}`,
    direct.status === 403);

// 6. Revocation: bob's token, issued while allowed, stops working once the policy drops him.
const bobToken = await mockEdgeToken(edge, "bob@demo.local");
const original = readFileSync(policyPath(), "utf8");
try {
  const policy = JSON.parse(original) as { allow: string[] };
  writeFileSync(policyPath(), JSON.stringify({ ...policy,
    allow: policy.allow.filter(email => email !== "bob@demo.local") }));
  check("revoked identity refused", "refused 403", await refusal(() => connectWithAccess(edge, bobToken)));
} finally {
  writeFileSync(policyPath(), original);
}

for (const stub of [aliceUser, alice, bobUser, bob]) stub[Symbol.dispose]();

console.log(`\nWorkshop: ${edge}  (api ${apiUrlFor(edge)})`);
console.log(`Skill:    ${first.blueprintId} v${first.version}  sha256:${first.contentSha256}`);
console.log(`Pushed:   blueprint ${pushed.blueprintId} as ${pushed.identity.id}\n`);
console.table(rows.map(({ step, expected, actual, pass }) => ({ step, expected, actual, result: pass ? "PASS" : "FAIL" })));
const failed = rows.filter(row => !row.pass).length;
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);

// A well-formed Access JWT for the edge's issuer and audience, signed with a key the edge never saw.
function forgedToken(email: string): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "RS256", typ: "JWT", kid: "forged" })}.${encode({
    iss: edge, aud: [DEMO.audience], email, sub: "forged", iat: now, exp: now + 600,
  })}`;
  return `${input}.${Buffer.from(sign("sha256", Buffer.from(input), privateKey)).toString("base64url")}`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
