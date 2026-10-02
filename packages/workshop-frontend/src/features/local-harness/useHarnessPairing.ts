import { useEffect, useState } from 'react'
import { localApiUrl, pairHarness, probeHarness, type PairedHarness } from './harnessPairing'

/** Where a pairing attempt stands. */
export type PairingState =
  | { status: 'waiting' }
  | { status: 'found'; harness: string }
  | { status: 'pairing'; harness: string }
  | { status: 'paired'; paired: PairedHarness }
  | { status: 'error'; harness: string; message: string }

const POLL_INTERVAL_MS = 1500

/**
 * Waits for a harness started with `code` to appear on the loopback pairing port, then pairs it on
 * `onConnect`. Pairing is never automatic: the person confirms the harness by name first.
 */
export const useHarnessPairing = (code: string, backendHost: string, sessionToken: string | null) => {
  const [state, setState] = useState<PairingState>({ status: 'waiting' })
  const waiting = state.status === 'waiting'

  useEffect(() => {
    if (!waiting) return
    const controller = new AbortController()
    const poll = async () => {
      const found = await probeHarness(code, controller.signal).catch(() => null)
      if (found && !found.paired && !controller.signal.aborted) {
        setState({ status: 'found', harness: found.harness })
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [code, waiting])

  const onConnect = async () => {
    if (state.status !== 'found' && state.status !== 'error') return
    const { harness } = state
    if (!sessionToken) {
      setState({ status: 'error', harness, message: 'Sign in to the Workshop first.' })
      return
    }
    setState({ status: 'pairing', harness })
    try {
      setState({ status: 'paired', paired: await pairHarness(code, localApiUrl(backendHost), sessionToken) })
    } catch (err) {
      setState({ status: 'error', harness, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { state, onConnect }
}
