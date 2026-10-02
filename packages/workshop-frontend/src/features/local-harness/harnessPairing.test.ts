import { afterEach, describe, expect, it, vi } from 'vitest'
import { newPairingCode, pairHarness, pairingCommand, probeHarness } from './harnessPairing'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newPairingCode', () => {
  it('is ten characters from an alphabet without look-alikes', () => {
    const code = newPairingCode()
    expect(code).toMatch(/^[A-HJKMNP-TV-Z2-9]{10}$/)
  })

  it('differs between calls', () => {
    expect(newPairingCode()).not.toBe(newPairingCode())
  })
})

describe('pairingCommand', () => {
  it('starts the bridge with the code, from the repository root', () => {
    expect(pairingCommand('ABCDEFGHJK'))
      .toBe('claude mcp add gadgets -- node packages/gadgets-cli/src/bin.ts mcp --pair ABCDEFGHJK')
  })
})

describe('probeHarness', () => {
  it('treats an unreachable bridge as not there yet', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(probeHarness('ABCDEFGHJK')).resolves.toBeNull()
  })
})

describe('pairHarness', () => {
  it("surfaces the bridge's reason when it refuses", async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'only a Workshop on this machine can be paired' }), { status: 400 })))
    await expect(pairHarness('ABCDEFGHJK', 'ws://localhost:8787/api', 'dev:secret'))
      .rejects.toThrow('only a Workshop on this machine can be paired')
  })

  it('sends the session to the bridge for this code only', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      harness: 'claude-code', identity: { id: 'dev', name: 'dev' },
    })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(pairHarness('ABCDEFGHJK', 'ws://localhost:8787/api', 'dev:secret'))
      .resolves.toEqual({ harness: 'claude-code', identity: { id: 'dev', name: 'dev' } })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:47821/harness/ABCDEFGHJK/pair', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ apiUrl: 'ws://localhost:8787/api', sessionToken: 'dev:secret' }),
    }))
  })
})
