import { useState } from 'react'
import { Button, Dialog } from '@cloudflare/kumo'
import { PlugsConnectedIcon, XIcon } from '@phosphor-icons/react'
import { getBackendHost } from '../../connectHandoff'
import { HarnessPairingPanel } from './HarnessPairingPanel'

/**
 * The local-mode entry point for connecting an agent harness. It lives outside the app's own tree
 * (see mount.tsx) so this feature adds files without editing upstream ones; that is also why it
 * reads the session from storage when opened rather than from the auth context.
 */
export const LocalHarnessLauncher = () => {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const handleOpen = () => {
    setSessionToken(localStorage.getItem('authToken'))
    setAttempt(previous => previous + 1)
    setOpen(true)
  }

  return (
    <>
      <div className="fixed bottom-4 left-4 z-[900]">
        <Button variant="secondary" size="sm" icon={PlugsConnectedIcon} onClick={handleOpen}>
          Connect local agent harness
        </Button>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog className="!z-[1000] flex !w-[min(560px,calc(100vw-32px))] flex-col gap-4 p-6" size="lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-kumo-default">Connect local agent harness</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-kumo-subtle">
                Pair Claude Code with this local Workshop.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={props => <Button {...props} variant="ghost" size="sm" shape="square" icon={XIcon} aria-label="Close" />}
            />
          </div>
          {/* Keyed per opening: each attempt gets a fresh one-time code and starts waiting anew. */}
          <HarnessPairingPanel key={attempt} backendHost={getBackendHost()} sessionToken={sessionToken} />
        </Dialog>
      </Dialog.Root>
    </>
  )
}
