// The revision manifest a skill ships as `files/revision.json`: what kind of artifact it is and
// which other revisions it depends on. It lives under `files/` so it is part of the packed content,
// which makes a changed pin a changed content hash.

import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

/** The artifact kinds the lab's registry accepts for publish. */
export const REVISION_KINDS = ["skill", "workflow", "agent", "strategy", "view", "brand"] as const;
export type RevisionKind = typeof REVISION_KINDS[number];

/** An exact reference to another revision. A pin never names a range, a branch or "latest". */
export type Pin = { kind: RevisionKind; name: string; number: number; sha256: string };

/** A skill directory's revision manifest. */
export type RevisionManifest = { kind: RevisionKind; pins: Pin[] };

export const REVISION_MANIFEST_PATH = join("files", "revision.json");

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Reads and validates `directory`'s revision manifest. Throws with the reason when the file is
 * missing or anything in it is inexact, so qualification fails closed.
 */
export async function readRevisionManifest(directory: string): Promise<RevisionManifest> {
  const name = basename(resolve(directory));
  if (!NAME.test(name)) throw new Error(`Skill directory name is not a revision name: ${name}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(directory, REVISION_MANIFEST_PATH), "utf8"));
  } catch {
    throw new Error(`Missing or unreadable ${REVISION_MANIFEST_PATH}`);
  }
  if (!isRecord(parsed)) throw new Error("revision.json must be an object");
  const unknown = Object.keys(parsed).filter(key => key !== "kind" && key !== "pins");
  if (unknown.length) throw new Error(`revision.json has unknown fields: ${unknown.join(", ")}`);
  if (!isKind(parsed.kind)) throw new Error(`revision.json kind must be one of: ${REVISION_KINDS.join(", ")}`);
  const pins = parsed.pins ?? [];
  if (!Array.isArray(pins)) throw new Error("revision.json pins must be an array");
  return { kind: parsed.kind, pins: pins.map(parsePin) };
}

function parsePin(value: unknown, index: number): Pin {
  const where = `revision.json pins[${index}]`;
  if (!isRecord(value)) throw new Error(`${where} must be an object`);
  const { kind, name, number, sha256, ...rest } = value;
  if (Object.keys(rest).length) throw new Error(`${where} has unknown fields: ${Object.keys(rest).join(", ")}`);
  if (!isKind(kind)) throw new Error(`${where}.kind is not an artifact kind`);
  if (typeof name !== "string" || !NAME.test(name)) throw new Error(`${where}.name is not a revision name`);
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
    throw new Error(`${where}.number must be an exact positive integer, not a range or "latest"`);
  }
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) throw new Error(`${where}.sha256 must be a SHA-256 hex digest`);
  return { kind, name, number, sha256 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is RevisionKind {
  return typeof value === "string" && (REVISION_KINDS as readonly string[]).includes(value);
}
