import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publishRequestBody, publishRevision } from "./lab.ts";
import { qualifySkill } from "./qualify.ts";
import { skillsDir } from "./skills.ts";

const passingTests = async () => ({ passed: true, output: "" });
const qualified = () =>
  qualifySkill(join(skillsDir(), "momentum-signal"), { runTests: passingTests });

function lab(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("publishRevision", () => {
  it("sends the qualified bytes, their hash and the human's Access token", async () => {
    const skill = await qualified();
    const revision = { id: "rev_0001", published_by: "alice@example.com" };
    const { calls, fetchImpl } = lab(201, { revision, publish_id: "pub_0001" });

    const outcome = await publishRevision("https://lab.example.com", "token-1", skill, fetchImpl);

    expect(outcome).toEqual({ published: true, created: true, revision, publishId: "pub_0001" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://lab.example.com/revisions");
    expect(calls[0].init.redirect).toBe("manual");
    expect(new Headers(calls[0].init.headers).get("cf-access-token")).toBe("token-1");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent).toEqual(publishRequestBody(skill));
    expect(sent).toMatchObject({
      kind: "skill", name: "momentum-signal", number: skill.record.number,
      content_hash: `sha256:${skill.packed.contentSha256}`,
      qualification: { content_hash: `sha256:${skill.packed.contentSha256}`, tool: "gadgets-cli" },
    });
    expect(Buffer.from(sent.content, "base64").equals(Buffer.from(skill.packed.content))).toBe(true);
  });

  it("does not contact the lab when qualification failed", async () => {
    const skill = await qualifySkill(join(skillsDir(), "momentum-signal"),
        { runTests: async () => ({ passed: false, output: "" }) });
    const { calls, fetchImpl } = lab(201, {});
    expect(await publishRevision("https://lab.example.com", "t", skill, fetchImpl))
        .toEqual({ published: false, reason: "qualification_failed" });
    expect(calls).toHaveLength(0);
  });

  it("reports the lab's refusal reason, an existing revision, and a missing sign-in", async () => {
    const skill = await qualified();
    const refused = lab(409, { reason: "revision_exists_different_hash", publish_id: "pub_0002" });
    expect(await publishRevision("https://lab.example.com", "t", skill, refused.fetchImpl))
        .toEqual({ published: false, reason: "revision_exists_different_hash", publishId: "pub_0002" });

    const exists = lab(200, { revision: { id: "rev_0001" }, publish_id: "pub_0003" });
    expect(await publishRevision("https://lab.example.com", "t", skill, exists.fetchImpl))
        .toMatchObject({ published: true, created: false });

    expect(await publishRevision("https://lab.example.com", "t", skill, lab(401, {}).fetchImpl))
        .toEqual({ published: false, reason: "not_signed_in" });
    await expect(publishRevision("https://lab.example.com", "t", skill, lab(503, {}).fetchImpl))
        .rejects.toThrow("503");
  });
});
