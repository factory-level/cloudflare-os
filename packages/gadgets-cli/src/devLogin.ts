// `gadgets dev-login`: sign in to a local dev Workshop without typing a password into the UI.
//
// Logs in over Cap'n Web the way the login page does, creating the account first if it doesn't
// exist, then hands the session token to the browser in a one-time link. The frontend's
// `features/dev-login` reads the token from the link's fragment, stores it where the login page
// would, and strips it from the address bar. Both ends refuse anything but a loopback host.

import { spawn } from "node:child_process";
import type { PublicApi } from "@gadgets/workshop-shared/api";
import { hashPassword } from "./passwordHash.ts";
import { apiUrlFor, connectSession } from "./workshop.ts";

/** The fragment key the frontend looks for. */
export const DEV_TOKEN_PARAM = "gadgets-dev-token";

export const DEFAULT_DEV_API = "http://localhost:8787";
export const DEFAULT_DEV_USER = "admin";
/** Same default as upstream's `VITE_DEV_AUTO_LOGIN`. */
export const DEFAULT_DEV_PASSWORD = "devpassword";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `url` parsed, if its host is loopback; dev-login never sends a password or token elsewhere. */
export function requireLoopback(url: string, flag: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${flag} is not a URL: ${url}`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${flag} must be a local Workshop (localhost, 127.0.0.1 or [::1]), not ${parsed.host}.`);
  }
  return parsed;
}

/** The username as the backend stores it (`normalizeUsername` in workshop-backend's user.ts). */
export function normalizeUsername(username: string): string {
  const normalized = username.toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid username "${username}": use letters, digits and _, starting with a letter.`);
  }
  return normalized;
}

export type SignIn = { token: string; username: string; created: boolean };

/**
 * Signs `username` in, creating the account if it has none. Logs in first, so an existing account
 * still works when signups are disabled.
 */
export async function signIn(api: Pick<PublicApi, "login" | "createAccount">,
    username: string, password: string): Promise<SignIn> {
  const name = normalizeUsername(username);
  // The browser salts with the name as typed; hashing the stored form keeps the two in step as
  // long as the login page is given the lowercase name.
  const passwordHash = await hashPassword(name, password);

  const loggedIn = await api.login(name, passwordHash);
  if (loggedIn) return { token: loggedIn, username: name, created: false };

  const created = await api.createAccount(name, name, passwordHash);
  if (created) return { token: created, username: name, created: true };

  throw new Error(`User "${name}" exists with a different password; pass --password or GADGETS_DEV_PASSWORD.`);
}

/** The link that signs the browser at `appOrigin` in with `token`. */
export function devLoginLink(appOrigin: string, token: string): string {
  const url = new URL("/", appOrigin);
  url.hash = `${DEV_TOKEN_PARAM}=${encodeURIComponent(token)}`;
  return url.toString();
}

export type DevLoginOptions = { api: string; app?: string; username: string; password: string };

/** Signs in to the local Workshop at `api` and returns the token and the browser link. */
export async function devLogin(options: DevLoginOptions): Promise<SignIn & { link: string }> {
  const api = requireLoopback(options.api, "--api");
  const app = requireLoopback(options.app ?? options.api, "--app");
  using session = connectSession(apiUrlFor(api.origin));
  const result = await signIn(session, options.username, options.password);
  return { ...result, link: devLoginLink(app.origin, result.token) };
}

/** Opens `url` in the default browser without waiting for it. */
export function openInBrowser(url: string): void {
  const [command, args] = process.platform === "darwin" ? ["open", [url]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => console.error(`Could not open a browser; visit:\n  ${url}`));
  child.unref();
}
