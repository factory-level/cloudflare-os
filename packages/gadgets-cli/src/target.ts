// Which Workshop a command acts in, and as whom: a deployed (or simulated) one named with `--to`,
// reached with the human's Access login, or else the local Workshop this harness is paired with.

import type { RpcPromise, RpcStub } from "capnweb";
import type { AuthenticatedApi, PublicApi } from "@gadgets/workshop-shared/api";
import { originOf, readAccessCredential, readHarnessPairing } from "./credentials.ts";
import { connectSession, connectWithAccess } from "./workshop.ts";

/** An open, authenticated session. `target` is the key tried workspaces are remembered under. */
export type TargetSession = {
  target: string;
  api: RpcStub<PublicApi>;
  user: RpcStub<AuthenticatedApi> | RpcPromise<AuthenticatedApi>;
};

/** Opens a session to `to`, or to the paired local Workshop when `to` is not given. */
export async function openTarget(to: string | undefined): Promise<TargetSession & Disposable> {
  if (to) {
    const credential = await readAccessCredential(to);
    if (!credential) throw new Error(`Not logged in to ${to}; run: gadgets login ${to}`);
    const api = await connectWithAccess(to, credential.token);
    return session(originOf(to), api, api.authenticateFromCfAccess());
  }
  const pairing = await readHarnessPairing();
  if (!pairing) {
    throw new Error("No Workshop to act in: pass --to <workshop-url>, or pair with the local Workshop "
      + "(\"Connect local agent harness\").");
  }
  const api = connectSession(pairing.apiUrl);
  return session(pairing.apiUrl, api, api.authenticate(pairing.sessionToken));
}

function session(target: string, api: RpcStub<PublicApi>, user: TargetSession["user"]): TargetSession & Disposable {
  return {
    target, api, user,
    [Symbol.dispose]() {
      user[Symbol.dispose]();
      api[Symbol.dispose]();
    },
  };
}
