// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { consumeDevLoginToken } from './consumeDevLoginToken'

afterEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('consumeDevLoginToken', () => {
  it('stores the token and strips it from the address bar', () => {
    window.history.replaceState(null, '', '/workspaces?x=1#gadgets-dev-token=admin%3Aa%2Bb%3D')
    expect(consumeDevLoginToken()).toBe(true)
    expect(localStorage.getItem('authToken')).toBe('admin:a+b=')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/workspaces?x=1')
  })

  it('leaves other fragments alone', () => {
    window.history.replaceState(null, '', '/#section')
    expect(consumeDevLoginToken()).toBe(false)
    expect(localStorage.getItem('authToken')).toBeNull()
    expect(window.location.hash).toBe('#section')
  })
})
