import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packSkill } from "./pack.ts";
import { qualifySkill } from "./qualify.ts";
import { skillsDir, testSkill } from "./skills.ts";
import { testAndPack, withSnapshot } from "./snapshot.ts";
import { AccessDeniedError, connectWithAccess } from "./workshop.ts";

const source = join(skillsDir(), "momentum-signal");

function copyTo(name: string): { skills: string; directory: string } {
  const skills = mkdtempSync(join(tmpdir(), "gadgets-snapshot-test-"));
  const directory = join(skills, name);
  cpSync(source, directory, { recursive: true });
  return { skills, directory };
}

describe("snapshots", () => {
  it("publishes the bytes that were tested when the directory changes mid-qualification", async () => {
    const { directory } = copyTo("momentum-signal");
    const before = await packSkill(directory);
    let testedReadme = "";

    const { record, packed } = await qualifySkill(directory, {
      runTests: async snapshot => {
        // A save lands while the tests run.
        writeFileSync(join(directory, "files", "README.md"), "# Edited during qualification\n");
        testedReadme = readFileSync(join(snapshot, "files", "README.md"), "utf8");
        return { passed: true, output: "" };
      },
    });

    expect(testedReadme).toBe(readFileSync(join(source, "files", "README.md"), "utf8"));
    expect(record.contentHash).toBe(`sha256:${before.contentSha256}`);
    expect(Buffer.compare(packed.archive, before.archive)).toBe(0);
    expect((await packSkill(directory)).contentSha256).not.toBe(before.contentSha256);
  });

  it("removes the snapshot afterwards, also when the work fails", async () => {
    let seen = "";
    await expect(withSnapshot(source, async snapshot => {
      seen = snapshot;
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(seen).not.toBe("");
    expect(existsSync(seen)).toBe(false);
  });

  it("runs a skill's own tests, and only those", async () => {
    const run = await testSkill(source);
    expect(run.passed).toBe(true);
    expect(run.output).toContain("signal.test.ts");
    expect(run.output).not.toContain("workflow.test.ts");
  }, 60_000);

  it("fails a skill that has no tests even when a sibling shares its name as a prefix", async () => {
    // `momentum` next to `momentum-signal`: a prefix match would borrow the sibling's suite.
    const { skills, directory: sibling } = copyTo("momentum-signal");
    const untested = join(skills, "momentum");
    cpSync(sibling, untested, { recursive: true });
    rmSync(join(untested, "__tests__"), { recursive: true });

    expect((await testSkill(untested)).passed).toBe(false);
    const { tests } = await testAndPack(untested);
    expect(tests.passed).toBe(false);
    expect((await qualifySkill(untested)).record.checks.find(c => c.name === "tests"))
        .toMatchObject({ passed: false });
  }, 60_000);
});

describe("connectWithAccess", () => {
  it("does not carry the Access token across a redirect", async () => {
    const received: (string | undefined)[] = [];
    const elsewhere = createServer((req, res) => {
      received.push(req.headers["cf-access-token"] as string | undefined);
      res.end();
    });
    await new Promise<void>(done => elsewhere.listen(0, "127.0.0.1", done));
    const target = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}/login`;
    const edge = createServer((_req, res) => {
      res.writeHead(302, { location: target });
      res.end();
    });
    await new Promise<void>(done => edge.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${(edge.address() as AddressInfo).port}`;

    try {
      await expect(connectWithAccess(origin, "secret-token")).rejects.toBeInstanceOf(AccessDeniedError);
      expect(received).toEqual([]);
    } finally {
      edge.close();
      elsewhere.close();
    }
  });
});
