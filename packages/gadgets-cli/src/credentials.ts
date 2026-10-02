// Credentials the CLI keeps between runs, in files only the current user can read. Two kinds, kept
// apart because they grant different things:
//
// - Access tokens, one per Workshop origin, obtained by a human running `gadgets login`. They are
//   what make a push attributable: the Workshop resolves the pusher from the token's email claim.
// - The harness pairing: the local Workshop session a paired agent harness acts under. It only ever
//   names a local Workshop; pushing anywhere else still needs an Access token a human obtained.

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** An Access token for one Workshop origin. */
export type AccessCredential = {
  token: string;
  /** The identity the token was issued for, as reported at login; informational only. */
  email: string | null;
  savedAt: string;
};

/** The local Workshop session a paired harness acts under. */
export type HarnessPairing = {
  /** WebSocket URL of the local Workshop's `/api`. */
  apiUrl: string;
  /** Session token in the Workshop's `<user>:<secret>` form. */
  sessionToken: string;
  /** Who the session belongs to, as `whoami()` reported when pairing. */
  identity: { id: string; name: string };
  pairedAt: string;
};

type Store = {
  access: Record<string, AccessCredential>;
  harness: HarnessPairing | null;
};

/** Where credentials live: `$GADGETS_CONFIG_DIR`, else `~/.config/gadgets`. */
export function configDir(): string {
  return process.env.GADGETS_CONFIG_DIR ?? join(homedir(), ".config", "gadgets");
}

/** Normalizes a Workshop URL to the origin credentials are keyed by. */
export function originOf(url: string): string {
  return new URL(url).origin;
}

/** Returns the stored Access credential for `origin`, if any. */
export async function readAccessCredential(origin: string): Promise<AccessCredential | null> {
  return (await readStore()).access[originOf(origin)] ?? null;
}

/** Stores (or replaces) the Access credential for `origin`. */
export async function saveAccessCredential(origin: string, credential: AccessCredential)
    : Promise<void> {
  const store = await readStore();
  store.access[originOf(origin)] = credential;
  await writeStore(store);
}

/** Returns the harness pairing, if a harness has been paired. */
export async function readHarnessPairing(): Promise<HarnessPairing | null> {
  return (await readStore()).harness;
}

/** Stores the harness pairing, replacing any earlier one. */
export async function saveHarnessPairing(pairing: HarnessPairing | null): Promise<void> {
  const store = await readStore();
  store.harness = pairing;
  await writeStore(store);
}

async function readStore(): Promise<Store> {
  let raw: string;
  try {
    raw = await readFile(storePath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { access: {}, harness: null };
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<Store>;
  return { access: parsed.access ?? {}, harness: parsed.harness ?? null };
}

// Written to a temporary file and renamed, so a concurrent reader never sees half a file, with
// owner-only permissions because the contents are bearer credentials.
async function writeStore(store: Store): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temporary = `${storePath()}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, storePath());
}

function storePath(): string {
  return join(configDir(), "credentials.json");
}
