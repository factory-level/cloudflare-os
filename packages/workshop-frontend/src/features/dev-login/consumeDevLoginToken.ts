// Receiving end of `gadgets dev-login`: the CLI signs in over RPC and opens
// `<app>/#gadgets-dev-token=<token>`. Store the token where the login page would and strip it from
// the address bar, before anything reads `authToken`.
//
// Loopback hosts only, so a crafted link can't quietly sign someone into another account on a
// deployed Workshop.

const DEV_TOKEN_PARAM = 'gadgets-dev-token'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Takes a dev-login token from the URL fragment, if there is one. Returns whether it did. */
export function consumeDevLoginToken(): boolean {
  if (!LOOPBACK_HOSTS.has(window.location.hostname)) return false
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const token = fragment.get(DEV_TOKEN_PARAM)
  if (!token) return false

  localStorage.setItem('authToken', token)
  fragment.delete(DEV_TOKEN_PARAM)
  const rest = fragment.toString()
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}${rest ? `#${rest}` : ''}`)
  return true
}
