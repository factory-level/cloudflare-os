import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RpcTarget } from "capnweb";
import { describe, expect, it } from "vitest";
import { parseBind, resolveBindings, suggestedBindings } from "./bindings.ts";

const CATALOG = { name: "LAB_CATALOG", vendorId: "lab", resourceUrl: "https://lab.invalid/revisions" };

/** A user whose connected accounts are `accounts`, answering the subscription the way the Workshop does. */
function userWith(accounts: { id: number; vendorId: string }[]) {
  return {
    async subscribeConnectedAccounts(subscriber: RpcTarget & {
      add(id: number, d: unknown, v: unknown, r: unknown, c: boolean, vendorId: string): void;
      ready(): void;
    }) {
      for (const account of accounts) subscriber.add(account.id, {}, {}, [], true, account.vendorId);
      subscriber.ready();
      return { [Symbol.dispose]() {} };
    },
  } as never;
}

describe("parseBind", () => {
  it("reads NAME=vendor:resourceUrl and refuses anything else", () => {
    expect(parseBind("LAB_CATALOG=lab:https://lab.invalid/revisions")).toEqual(CATALOG);
    for (const bad of ["LAB_CATALOG", "lab_catalog=lab:x", "LAB=:x", "LAB=lab:"]) {
      expect(() => parseBind(bad)).toThrow(/--bind expects/);
    }
  });
});

describe("suggestedBindings", () => {
  it("lists gatekeeper bindings that suggest a resource, and only those", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bindings-"));
    await writeFile(join(dir, "blueprint.json"), JSON.stringify({ bindings: {
      LAB_CATALOG: { type: "gatekeeper", gatekeeperName: "lab", resourceUrl: CATALOG.resourceUrl },
      DOC: { type: "gatekeeper", gatekeeperName: "google" },
      MODEL: { type: "aiModel" },
    } }));
    expect(await suggestedBindings(dir)).toEqual([CATALOG]);
  });
});

describe("resolveBindings", () => {
  it("fills a suggestion from the one account of its vendor", async () => {
    const result = await resolveBindings(userWith([{ id: 3, vendorId: "lab" }, { id: 4, vendorId: "slack" }]), [], [CATALOG]);
    expect(result).toEqual({
      bindings: { LAB_CATALOG: { type: "gatekeeper", accountId: 3, resourceUrl: CATALOG.resourceUrl } },
      skipped: [],
    });
  });

  it("leaves a suggestion unbound, with the reason, when no single account fits", async () => {
    expect((await resolveBindings(userWith([]), [], [CATALOG])).skipped).toEqual([
      "LAB_CATALOG: no connected lab account; connect it in the Workshop first",
    ]);
    expect((await resolveBindings(userWith([{ id: 1, vendorId: "lab" }, { id: 2, vendorId: "lab" }]), [], [CATALOG]))
      .bindings).toEqual({});
  });

  it("refuses an explicit request it cannot fill, and lets it override a suggestion", async () => {
    await expect(resolveBindings(userWith([]), [CATALOG], [])).rejects.toThrow(/no connected lab account/);
    const override = { ...CATALOG, resourceUrl: "https://lab.invalid/studies/stu_0001" };
    expect((await resolveBindings(userWith([{ id: 7, vendorId: "lab" }]), [override], [CATALOG])).bindings)
      .toEqual({ LAB_CATALOG: { type: "gatekeeper", accountId: 7, resourceUrl: override.resourceUrl } });
  });
});
