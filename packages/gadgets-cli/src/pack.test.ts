import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveContentSha256, packSkill } from "./pack.ts";
import { skillsDir } from "./skills.ts";

const skill = join(skillsDir(), "momentum-signal");

describe("packSkill", () => {
  it("is byte-identical across builds", async () => {
    const [first, second] = [await packSkill(skill), await packSkill(skill)];
    expect(Buffer.compare(first.archive, second.archive)).toBe(0);
    expect(first.contentSha256).toBe(second.contentSha256);
  });

  it("reports the hash of the content section the archive embeds", async () => {
    const packed = await packSkill(skill);
    expect(archiveContentSha256(packed.archive, "test")).toBe(packed.contentSha256);
  });

  it("changes the hash when the code changes, but not when only the manifest does", async () => {
    const copy = join(mkdtempSync(join(tmpdir(), "gadgets-pack-test-")), "momentum-signal");
    cpSync(skill, copy, { recursive: true });
    const original = await packSkill(copy);

    const manifestPath = join(copy, "blueprint.json");
    const manifest = JSON.parse((await import("node:fs")).readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, title: "Renamed" }));
    expect((await packSkill(copy)).contentSha256).toBe(original.contentSha256);

    writeFileSync(join(copy, "files", "README.md"), "# Changed\n");
    expect((await packSkill(copy)).contentSha256).not.toBe(original.contentSha256);
  });
});
