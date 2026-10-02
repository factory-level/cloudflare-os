// The browser's half of pairing a local agent harness (e.g. Claude Code) with this dev Workshop.
// The bridge's half, and why the session is handed over this way, is
// packages/gadgets-cli/src/pairing.ts.

/** Loopback port a waiting `gadgets mcp` bridge listens on; must match the bridge's default. */
export const PAIRING_PORT = 47821

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 10

/** A harness that is running with the code and waiting to be paired. */
export type WaitingHarness = { harness: string; paired: boolean }

/** Who the harness now acts as. */
export type PairedHarness = { harness: string; identity: { id: string; name: string } }

/** A fresh one-time pairing code, unambiguous to read and type. */
export const newPairingCode = (randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))): string =>
  Array.from(randomBytes.subarray(0, CODE_LENGTH), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')

/** The command that registers the bridge with Claude Code, run from the repository root. */
export const pairingCommand = (code: string): string =>
  `claude mcp add gadgets -- node packages/gadgets-cli/src/bin.ts mcp --pair ${code}`

/** The `/api` WebSocket URL of the Workshop backend at `backendHost`. */
export const localApiUrl = (backendHost: string): string => `ws://${backendHost}/api`

/** The waiting harness started with `code`, or null if none is listening yet. */
export const probeHarness = async (code: string, signal?: AbortSignal): Promise<WaitingHarness | null> => {
  try {
    const response = await fetch(bridgeUrl(code), { signal })
    return response.ok ? await response.json() as WaitingHarness : null
  } catch (err) {
    if (signal?.aborted) throw err
    return null
  }
}

/** Hands this browser's Workshop session to the harness started with `code`. */
export const pairHarness = async (code: string, apiUrl: string, sessionToken: string): Promise<PairedHarness> => {
  const response = await fetch(`${bridgeUrl(code)}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiUrl, sessionToken }),
  })
  const body = await response.json() as PairedHarness | { error?: string }
  if (!response.ok || !('identity' in body)) {
    throw new Error(('error' in body && body.error) || `Pairing failed (${response.status})`)
  }
  return body
}

const bridgeUrl = (code: string): string => `http://127.0.0.1:${PAIRING_PORT}/harness/${encodeURIComponent(code)}`
