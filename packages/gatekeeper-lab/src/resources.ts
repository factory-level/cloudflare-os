// Bindable lab resources. Their URLs name a resource, not a network location: they share one fixed
// origin, so a blueprint that declares a lab binding works against any deployment's lab. Requests
// go to the deployment's LAB_URL.

import type { SupportedResource } from "@gadgets/workshop-shared/gatekeeper";
import type { RevisionRef } from "./types";

/** The origin every lab resource URL uses. `.invalid` is reserved, so nothing resolves it. */
export const RESOURCE_ORIGIN = "https://lab.invalid";

export const KINDS: readonly RevisionRef["kind"][] = [
  "skill", "workflow", "agent", "strategy", "view", "brand",
];
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STUDY_ID = /^stu_[0-9]+$/;
const LABEL = /^[a-z0-9][a-z0-9-]{0,31}$/;

export type LabResource =
  | { type: "catalog" }
  | { type: "analytics" }
  | { type: "revisions"; kind: RevisionRef["kind"]; name: string }
  | { type: "study"; studyId: string }
  | { type: "variant"; studyId: string; label: string };

export const CATALOG_RESOURCE: SupportedResource = {
  urlPattern: `${RESOURCE_ORIGIN}/revisions`,
  title: "Lab catalog",
  description: "Read everything published to the lab: every skill, workflow, agent, and strategy, " +
    "their revisions, and their files.",
};

export const ANALYTICS_RESOURCE: SupportedResource = {
  urlPattern: `${RESOURCE_ORIGIN}/analytics`,
  title: "Lab analytics",
  description: "Read every study at a glance, each variant's equity over time, and what each agent " +
    "decided, ordered, filled, and reported spending. Results are virtual.",
};

export const REVISIONS_RESOURCE: SupportedResource = {
  urlPattern: `${RESOURCE_ORIGIN}/revisions/:kind/:name`,
  title: "Lab revisions",
  description: "Read every published revision of one named skill, workflow, agent, or strategy, " +
    "including its files.",
};

export const STUDY_RESOURCE: SupportedResource = {
  urlPattern: `${RESOURCE_ORIGIN}/studies/:studyId`,
  title: "Lab study",
  description: "Read one study: its variants, their exact revisions, and its starting capital.",
};

export const VARIANT_RESOURCE: SupportedResource = {
  urlPattern: `${RESOURCE_ORIGIN}/studies/:studyId/variants/:label`,
  title: "Lab study variant",
  description: "Run one variant of a study: read its cycles and portfolio, and record what it decided " +
    "each cycle. Its portfolio changes only through the lab's simulated fills.",
};

export const SUPPORTED_RESOURCES = [CATALOG_RESOURCE, ANALYTICS_RESOURCE, REVISIONS_RESOURCE, STUDY_RESOURCE, VARIANT_RESOURCE];

export function resourceUrl(resource: LabResource): string {
  if (resource.type === "catalog") return `${RESOURCE_ORIGIN}/revisions`;
  if (resource.type === "analytics") return `${RESOURCE_ORIGIN}/analytics`;
  if (resource.type === "variant") return `${RESOURCE_ORIGIN}/studies/${resource.studyId}/variants/${resource.label}`;
  return resource.type === "revisions"
    ? `${RESOURCE_ORIGIN}/revisions/${resource.kind}/${resource.name}`
    : `${RESOURCE_ORIGIN}/studies/${resource.studyId}`;
}

/** Parses a lab resource URL, or returns null for anything else. */
export function parseResourceUrl(url: string): LabResource | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== RESOURCE_ORIGIN || parsed.search || parsed.hash) return null;
  const parts = parsed.pathname.slice(1).split("/");
  if (parts.length === 1 && parts[0] === "revisions") return { type: "catalog" };
  if (parts.length === 1 && parts[0] === "analytics") return { type: "analytics" };
  if (parts.length === 3 && parts[0] === "revisions") {
    const [, kind, name] = parts as [string, string, string];
    if ((KINDS as readonly string[]).includes(kind) && NAME.test(name))
      return { type: "revisions", kind: kind as RevisionRef["kind"], name };
  }
  if (parts.length === 4 && parts[0] === "studies" && parts[2] === "variants"
      && STUDY_ID.test(parts[1] as string) && LABEL.test(parts[3] as string))
    return { type: "variant", studyId: parts[1] as string, label: parts[3] as string };
  if (parts.length === 2 && parts[0] === "studies" && STUDY_ID.test(parts[1] as string))
    return { type: "study", studyId: parts[1] as string };
  return null;
}
