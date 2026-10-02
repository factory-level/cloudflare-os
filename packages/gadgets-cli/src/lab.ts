// Publishing a qualified revision to the trading lab's registry. The lab is the registry of record:
// it recomputes the content hash from the bytes it receives and records who published.
//
// The lab sits behind the same kind of Cloudflare Access edge as a production Workshop, so the
// request carries the human's Access token and the edge turns it into the signed assertion the lab
// verifies. Nothing here can publish without a token a person obtained with `gadgets login`.

import type { QualifiedSkill } from "./qualify.ts";

/** A revision as the lab's registry returns it. */
export type LabRevision = {
  id: string;
  kind: string;
  name: string;
  number: number;
  content_hash: string;
  published_by: string;
  created_at: string;
};

/** The outcome of a publish: stored (newly or already), or refused with the lab's reason code. */
export type PublishOutcome =
  | { published: true; created: boolean; revision: LabRevision; publishId: string }
  | { published: false; reason: string; publishId?: string };

/** The request body `POST /revisions` accepts for `qualified`. */
export function publishRequestBody(qualified: QualifiedSkill): Record<string, unknown> {
  const { record, packed } = qualified;
  return {
    kind: record.kind,
    name: record.name,
    number: record.number,
    content_hash: record.contentHash,
    content: Buffer.from(packed.content).toString("base64"),
    pins: record.pins.map(pin => ({
      kind: pin.kind, name: pin.name, number: pin.number, content_hash: `sha256:${pin.sha256}`,
    })),
    qualification: {
      content_hash: record.contentHash,
      tool: "gadgets-cli",
      checks: record.checks.map(check => ({ name: check.name, passed: check.passed })),
    },
  };
}

/**
 * Publishes `qualified` to the lab at `labUrl`. Refuses locally, without a request, when
 * qualification did not pass.
 */
export async function publishRevision(
    labUrl: string, accessToken: string, qualified: QualifiedSkill,
    fetchImpl: typeof fetch = fetch): Promise<PublishOutcome> {
  if (!qualified.record.passed) return { published: false, reason: "qualification_failed" };
  const response = await fetchImpl(new URL("/revisions", labUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "cf-access-token": accessToken },
    body: JSON.stringify(publishRequestBody(qualified)),
    // Never follow the edge's redirect to its login page with the token attached.
    redirect: "manual",
  });
  const body = await response.json().catch(() => ({})) as
      { revision?: LabRevision; publish_id?: string; reason?: string };
  if ((response.status === 200 || response.status === 201) && body.revision) {
    return { published: true, created: response.status === 201,
      revision: body.revision, publishId: body.publish_id ?? "" };
  }
  if (response.status === 409 && body.reason) {
    return { published: false, reason: body.reason, publishId: body.publish_id };
  }
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    return { published: false, reason: "not_signed_in" };
  }
  throw new Error(`The lab answered ${response.status} to the publish request`);
}
