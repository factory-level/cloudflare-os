// Obtains a Cloudflare Access token for a Workshop origin, on behalf of the human at the keyboard.
//
// Against a real deployment that is `cloudflared access login`, which runs the identity provider's
// browser flow, so the token is exactly as trustworthy as the Access policy and IdP behind it. The
// demo's mock edge stands in for both, so it is asked directly for a token in the chosen identity's
// name; it still refuses identities its policy does not allow.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { originOf, saveAccessCredential } from "./credentials.ts";

const execFileAsync = promisify(execFile);

/** Path the demo's mock Access edge answers on, and nothing real does. */
export const MOCK_EDGE_INFO_PATH = "/cdn-cgi/gadgets-mock/info";
/** Path the mock edge issues tokens on. */
export const MOCK_EDGE_TOKEN_PATH = "/cdn-cgi/gadgets-mock/token";

/** Logs in to `url`, stores the token, and returns the identity it was issued for (if known). */
export async function loginToWorkshop(url: string, options: { email?: string })
    : Promise<{ origin: string; email: string | null }> {
  const origin = originOf(url);
  const token = await isMockEdge(origin)
      ? await mockEdgeToken(origin, requireEmail(options.email))
      : await cloudflaredToken(origin);
  const email = emailClaim(token);
  await saveAccessCredential(origin, { token, email, savedAt: new Date().toISOString() });
  return { origin, email };
}

/** Asks the mock edge at `origin` for a token in `email`'s name. */
export async function mockEdgeToken(origin: string, email: string): Promise<string> {
  const response = await fetch(new URL(MOCK_EDGE_TOKEN_PATH, origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(`${origin} refused to issue a token for ${email} ` +
        `(${response.status}): ${(await response.text()).trim()}`);
  }
  return ((await response.json()) as { token: string }).token;
}

/** Reads the `email` claim of an Access JWT without verifying it; for display only. */
export function emailClaim(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as
        { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

async function isMockEdge(origin: string): Promise<boolean> {
  try {
    const response = await fetch(new URL(MOCK_EDGE_INFO_PATH, origin));
    return response.ok && ((await response.json()) as { mock?: unknown }).mock === true;
  } catch {
    return false;
  }
}

// `access login` opens the browser and caches the token; `access token` prints the cached one.
async function cloudflaredToken(origin: string): Promise<string> {
  try {
    await execFileAsync("cloudflared", ["access", "login", origin], { timeout: 5 * 60_000 });
    const { stdout } = await execFileAsync("cloudflared", ["access", "token", `-app=${origin}`]);
    const token = stdout.trim();
    if (!token) throw new Error("cloudflared printed no token");
    return token;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("cloudflared is not installed; it is needed to log in to a deployed " +
          "Workshop through Cloudflare Access.", { cause: err });
    }
    throw err;
  }
}

function requireEmail(email: string | undefined): string {
  if (!email) throw new Error("This is the demo's mock Access edge: pass --email <identity>.");
  return email;
}
