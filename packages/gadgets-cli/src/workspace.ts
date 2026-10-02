// The middle loop: put a skill into a Workshop and exercise it there, with no clicks. Uses only the
// Workshop's public RPC API: a blueprint instantiates into a workspace of its own
// (`newGadgetFromBlueprint`), whose gadget answers calls through `connectToGadget`. A workspace per
// try is also the platform's isolation boundary, so two tries never share state.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RpcPromise, RpcStub } from "capnweb";
import type { AuthenticatedApi, PublicApi } from "@gadgets/workshop-shared/api";
import { configDir } from "./credentials.ts";
import type { PackedSkill } from "./pack.ts";
import { pushSkill } from "./workshop.ts";

type User = RpcStub<AuthenticatedApi> | RpcPromise<AuthenticatedApi>;

/** A workspace `try` created, remembered so later commands can call it and `clean` can remove it. */
export type TriedWorkspace = {
  skill: string;
  version: number;
  contentSha256: string;
  /** The Workshop it lives in: an origin (Access mode) or an `/api` URL (the paired local Workshop). */
  target: string;
  workspaceId: string;
  gadgetId: number;
  blueprintId: string;
  createdAt: string;
};

const METHOD = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const storePath = () => join(configDir(), "workspaces.json");

/** The workspaces `try` has created and `clean` has not yet removed, oldest first. */
export async function readTried(): Promise<TriedWorkspace[]> {
  try {
    return JSON.parse(await readFile(storePath(), "utf8")) as TriedWorkspace[];
  } catch {
    return [];
  }
}

async function writeTried(workspaces: TriedWorkspace[]): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const temporary = `${storePath()}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(workspaces, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, storePath());
}

/** The most recent tried workspace for `skill` in `target`, if any. */
export async function latestTried(skill: string, target: string): Promise<TriedWorkspace | undefined> {
  return (await readTried()).findLast(entry => entry.skill === skill && entry.target === target);
}

/**
 * Pushes `packed`, creates a fresh workspace from it and remembers it. `verified` is whether the
 * Workshop serves back exactly the pushed bytes; an unverified push creates no workspace.
 */
export async function tryInWorkshop(api: RpcStub<PublicApi>, user: User, packed: PackedSkill, target: string)
    : Promise<{ workspace: TriedWorkspace; identity: { id: string; name: string } }> {
  const pushed = await pushSkill(api, user, packed);
  if (!pushed.verified) throw new Error("The Workshop holds different bytes than were pushed; not creating a workspace");
  using overseer = user.newGadgetFromBlueprint(pushed.blueprintId, {});
  const metadata = await overseer.getMetadata();
  if (metadata.defaultGadgetId === undefined) throw new Error("The new workspace has no gadget");
  const workspace: TriedWorkspace = {
    skill: packed.name,
    version: packed.version,
    contentSha256: packed.contentSha256,
    target,
    workspaceId: metadata.id,
    gadgetId: metadata.defaultGadgetId,
    blueprintId: pushed.blueprintId,
    createdAt: new Date().toISOString(),
  };
  await writeTried([...await readTried(), workspace]);
  return { workspace, identity: pushed.identity };
}

/** Calls `method` on the gadget in `workspace` with `args`, running its committed code. */
export async function callGadget(user: User, workspace: TriedWorkspace, method: string, args: unknown[] = [])
    : Promise<unknown> {
  if (!METHOD.test(method)) throw new Error(`Not a method name: ${method}`);
  using overseer = user.openGadget(workspace.workspaceId);
  using gadget = overseer.getGadget(workspace.gadgetId);
  using stub = gadget.connectToGadget();
  return await (stub as unknown as Record<string, (...values: unknown[]) => Promise<unknown>>)[method]!(...args);
}

/**
 * Deletes every remembered workspace in `target`, and the blueprint each was created from. A
 * workspace that is already gone is forgotten rather than reported as a failure.
 */
export async function cleanTried(user: User, target: string): Promise<{ removed: TriedWorkspace[]; failed: string[] }> {
  const all = await readTried();
  const removed: TriedWorkspace[] = [];
  const failed: string[] = [];
  for (const workspace of all.filter(entry => entry.target === target)) {
    try {
      {
        using overseer = user.openGadget(workspace.workspaceId);
        await overseer.deleteSelf();
      }
      await user.deleteOrphanedBlueprint(workspace.blueprintId).catch(() => undefined);
      removed.push(workspace);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found|no such|does not exist/i.test(message)) removed.push(workspace);
      else failed.push(`${workspace.skill} (${workspace.workspaceId}): ${message}`);
    }
  }
  await writeTried(all.filter(entry => !removed.includes(entry)));
  return { removed, failed };
}
