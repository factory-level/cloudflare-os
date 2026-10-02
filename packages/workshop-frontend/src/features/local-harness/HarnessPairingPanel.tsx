import { useState } from 'react'
import { Badge, Button, Loader, Text } from '@cloudflare/kumo'
import { CheckIcon, CopyIcon, PlugsConnectedIcon } from '@phosphor-icons/react'
import { copyToClipboard } from '../../clipboard'
import { newPairingCode, pairingCommand } from './harnessPairing'
import { useHarnessPairing } from './useHarnessPairing'

type HarnessPairingPanelProps = {
  backendHost: string
  sessionToken: string | null
}

/** One pairing attempt: a fresh code, the command to run, and the harness's progress. */
export const HarnessPairingPanel = ({ backendHost, sessionToken }: HarnessPairingPanelProps) => {
  const [code] = useState(() => newPairingCode())
  const [copied, setCopied] = useState(false)
  const { state, onConnect } = useHarnessPairing(code, backendHost, sessionToken)
  const command = pairingCommand(code)

  const handleCopy = async () => {
    setCopied(await copyToClipboard(command))
  }

  return (
    <div className="flex flex-col gap-4">
      <Text variant="secondary">
        Your agent harness runs on your own subscription, in its own process. Pairing lets it act in
        this local Workshop as you: list, test and install skills, and push them to a deployment you
        have logged in to with <code>gadgets login</code>.
      </Text>

      <div className="flex flex-col gap-2">
        <Text bold>1. From the repository root, run</Text>
        <div className="flex items-start gap-2 rounded-lg border border-kumo-line bg-kumo-elevated p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-kumo-default">{command}</code>
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={copied ? CheckIcon : CopyIcon}
            aria-label={copied ? 'Copied' : 'Copy command'}
            onClick={handleCopy}
          />
        </div>
        <Text variant="secondary" size="sm">Then start (or restart) Claude Code there. The code works once.</Text>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <Text bold>2. Confirm the harness</Text>
        {state.status === 'waiting' && (
          <div className="flex items-center gap-2">
            <Loader size="sm" />
            <Text variant="secondary">Waiting for a harness started with code {code}…</Text>
          </div>
        )}
        {(state.status === 'found' || state.status === 'pairing' || state.status === 'error') && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PlugsConnectedIcon size={18} aria-hidden />
                <Text><strong>{state.harness}</strong> wants to act as you in this Workshop.</Text>
              </div>
              <Button variant="primary" size="sm" loading={state.status === 'pairing'} onClick={onConnect}>
                Connect
              </Button>
            </div>
            {state.status === 'error' && <Text variant="error" size="sm">{state.message}</Text>}
          </div>
        )}
        {state.status === 'paired' && (
          <div className="flex items-center gap-2">
            <Badge variant="success">Connected</Badge>
            <Text>
              <strong>{state.paired.harness}</strong> is paired as {state.paired.identity.name}.
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}
