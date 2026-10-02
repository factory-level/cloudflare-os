// Mounts the local-harness launcher beside the app, in its own React root. Loaded only by the dev
// server started through vite.harness.config.ts, and only outside Access mode, so it never ships
// in a production build. The app's stylesheet (and so Kumo's tokens) is already on the page.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LocalHarnessLauncher } from './LocalHarnessLauncher'

if (import.meta.env.DEV && import.meta.env.VITE_CF_ACCESS_MODE !== 'true') {
  const container = document.createElement('div')
  container.id = 'local-harness-root'
  document.body.append(container)
  createRoot(container).render(<StrictMode><LocalHarnessLauncher /></StrictMode>)
}
