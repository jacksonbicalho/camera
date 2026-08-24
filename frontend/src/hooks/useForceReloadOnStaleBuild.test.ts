import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useForceReloadOnStaleBuild } from './useForceReloadOnStaleBuild'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
}))

function mockAbout(responses: Array<{ ok: boolean; commit?: string }>) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)]
      call++
      if (!r.ok) return new Response('unauthorized', { status: 401 })
      return new Response(JSON.stringify({ commit: r.commit }), { status: 200 })
    }),
  )
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

const flushMicro = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

afterEach(() => {
  // cleanup() desmonta o hook, disparando o cleanup do useEffect
  // (document.removeEventListener) — sem isso, o listener de
  // 'visibilitychange' de um teste vaza pro próximo (renderHook não
  // desmonta sozinho), acumulando listeners e disparando o reload mais de
  // uma vez.
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CA2: recarrega quando o commit de /api/about diverge do capturado no mount', () => {
  it('commit igual ao reabrir (visibilitychange): não recarrega', async () => {
    mockAbout([
      { ok: true, commit: 'abc123' },
      { ok: true, commit: 'abc123' },
    ])
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })

    renderHook(() => useForceReloadOnStaleBuild())
    await flushMicro()

    setVisibility('visible')
    await flushMicro()

    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('commit diverge ao reabrir (visibilitychange): recarrega', async () => {
    mockAbout([
      { ok: true, commit: 'abc123' },
      { ok: true, commit: 'def456' },
    ])
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })

    renderHook(() => useForceReloadOnStaleBuild())
    await flushMicro()

    setVisibility('visible')
    await flushMicro()

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('página fica hidden (não visible): não checa nem recarrega', async () => {
    mockAbout([
      { ok: true, commit: 'abc123' },
      { ok: true, commit: 'def456' },
    ])
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })

    renderHook(() => useForceReloadOnStaleBuild())
    await flushMicro()

    setVisibility('hidden')
    await flushMicro()

    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('checagem no mount falha (401/sem sessão): não recarrega, e uma checagem posterior bem-sucedida só estabelece o baseline (sem reload espúrio)', async () => {
    mockAbout([{ ok: false }, { ok: true, commit: 'abc123' }, { ok: true, commit: 'abc123' }])
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })

    renderHook(() => useForceReloadOnStaleBuild())
    await flushMicro()

    setVisibility('visible')
    await flushMicro()
    expect(reloadSpy).not.toHaveBeenCalled()

    setVisibility('hidden')
    setVisibility('visible')
    await flushMicro()
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
