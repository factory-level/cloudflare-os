// Gatekeeper bindings for `try`: which of the person's connected accounts fills each binding a
// skill declares. A binding the skill suggests a resource for is filled from the person's only
// connected account of that vendor; `--bind NAME=vendor:resourceUrl` chooses explicitly.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RpcStub, RpcTarget, type RpcPromise } from "capnweb";
import type { AuthenticatedApi, BlueprintBindingAssignment } from "@gadgets/workshop-shared/api";

type User = RpcStub<AuthenticatedApi> | RpcPromise<AuthenticatedApi>;

/** One binding to fill: the vendor whose account fills it, and the resource it reads. */
export type BindingRequest = { name: string; vendorId: string; resourceUrl: string };

/** Parses `NAME=vendor:resourceUrl`. */
export function parseBind(spec: string): BindingRequest {
  const match = /^([A-Z][A-Z0-9_]*)=([a-z0-9-]+):(\S+)$/.exec(spec);
  if (!match) throw new Error(`--bind expects NAME=vendor:resourceUrl, e.g. LAB_CATALOG=lab:https://lab.invalid/revisions; got ${spec}`);
  return { name: match[1]!, vendorId: match[2]!, resourceUrl: match[3]! };
}

/** The gatekeeper bindings `blueprint.json` declares with a suggested resource. */
export async function suggestedBindings(directory: string): Promise<BindingRequest[]> {
  const blueprint = JSON.parse(await readFile(join(directory, "blueprint.json"), "utf8")) as {
    bindings?: Record<string, { type?: string; gatekeeperName?: string; resourceUrl?: string }>;
  };
  return Object.entries(blueprint.bindings ?? {}).flatMap(([name, binding]) =>
    binding.type === "gatekeeper" && binding.gatekeeperName && binding.resourceUrl
      ? [{ name, vendorId: binding.gatekeeperName, resourceUrl: binding.resourceUrl }]
      : []);
}

/**
 * Resolves each request to one of the person's connected accounts. An explicit request needs
 * exactly one account of its vendor; a suggested one is skipped, with the reason, when there is none
 * or more than one, so the gadget is created with that binding unfilled.
 */
export async function resolveBindings(
    user: User, explicit: BindingRequest[], suggested: BindingRequest[])
    : Promise<{ bindings: Record<string, BlueprintBindingAssignment>; skipped: string[] }> {
  const accounts = await connectedAccounts(user);
  const bindings: Record<string, BlueprintBindingAssignment> = {};
  const skipped: string[] = [];
  const chosen = new Map(suggested.map(request => [request.name, { request, explicit: false }]));
  for (const request of explicit) chosen.set(request.name, { request, explicit: true });
  for (const { request, explicit: isExplicit } of chosen.values()) {
    const matches = accounts.filter(account => account.vendorId === request.vendorId);
    if (matches.length === 1) {
      bindings[request.name] = { type: "gatekeeper", accountId: matches[0]!.id, resourceUrl: request.resourceUrl };
      continue;
    }
    const reason = matches.length === 0
      ? `${request.name}: no connected ${request.vendorId} account; connect it in the Workshop first`
      : `${request.name}: ${matches.length} connected ${request.vendorId} accounts; disconnect all but one`;
    if (isExplicit) throw new Error(reason);
    skipped.push(reason);
  }
  return { bindings, skipped };
}

async function connectedAccounts(user: User): Promise<{ id: number; vendorId: string }[]> {
  const accounts: { id: number; vendorId: string }[] = [];
  const { promise: ready, resolve } = Promise.withResolvers<void>();
  class Subscriber extends RpcTarget {
    add(id: number, _description: unknown, _vendor: unknown, _resources: unknown,
        _credentialsValid: boolean, vendorId: string) {
      accounts.push({ id, vendorId });
    }
    remove(id: number) {
      const at = accounts.findIndex(account => account.id === id);
      if (at >= 0) accounts.splice(at, 1);
    }
    ready() { resolve(); }
  }
  using subscriber = new RpcStub(new Subscriber());
  using _subscription = await user.subscribeConnectedAccounts(subscriber as never);
  await ready;
  return accounts;
}
