// Bindable lab resources. Their URLs live under the deployment's LAB_URL, so each pattern is built
// from configuration rather than fixed here.

import type { SupportedResource } from "@gadgets/workshop-shared/gatekeeper";
import type { RevisionRef } from "./types";

export const KINDS: readonly RevisionRef["kind"][] = [
  "skill", "workflow", "agent", "strategy", "view", "brand",
];
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STUDY_ID = /^stu_[0-9]+$/;

export type LabResource =
  | { type: "revisions"; kind: RevisionRef["kind"]; name: string }
  | { type: "study"; studyId: string };

export function revisionsResource(labUrl: string): SupportedResource {
  return {
    urlPattern: `${labUrl}/revisions/:kind/:name`,
    title: "Lab revisions",
    description: "Read every published revision of one named skill, workflow, agent, or strategy, " +
      "including its files.",
  };
}

export function studyResource(labUrl: string): SupportedResource {
  return {
    urlPattern: `${labUrl}/studies/:studyId`,
    title: "Lab study",
    description: "Read one study: its variants, their exact revisions, and its starting capital.",
  };
}

export function resourceUrl(labUrl: string, resource: LabResource): string {
  return resource.type === "revisions"
    ? `${labUrl}/revisions/${resource.kind}/${resource.name}`
    : `${labUrl}/studies/${resource.studyId}`;
}

/** Parses a resource URL under `labUrl`, or returns null for anything else. */
export function parseResourceUrl(labUrl: string, url: string): LabResource | null {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(labUrl);
  } catch {
    return null;
  }
  if (parsed.origin !== base.origin || parsed.search || parsed.hash) return null;
  const prefix = base.pathname.replace(/\/+$/, "");
  if (!parsed.pathname.startsWith(`${prefix}/`)) return null;
  const parts = parsed.pathname.slice(prefix.length + 1).split("/");
  if (parts.length === 3 && parts[0] === "revisions") {
    const [, kind, name] = parts as [string, string, string];
    if ((KINDS as readonly string[]).includes(kind) && NAME.test(name))
      return { type: "revisions", kind: kind as RevisionRef["kind"], name };
  }
  if (parts.length === 2 && parts[0] === "studies" && STUDY_ID.test(parts[1] as string))
    return { type: "study", studyId: parts[1] as string };
  return null;
}
