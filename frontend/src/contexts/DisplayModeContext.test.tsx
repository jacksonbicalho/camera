import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DisplayModeProvider, useDisplayMode, useSetDisplayMode } from './DisplayModeContext'

const STORAGE_KEY = 'ui-display-mode'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DisplayModeProvider>{children}</DisplayModeProvider>
)

beforeEach(() => {
  localStorage.clear()
})

describe('DisplayModeContext', () => {
  it('defaults to icons-only', () => {
    const { result } = renderHook(() => useDisplayMode(), { wrapper })
    expect(result.current.sidebar).toBe('icons-only')
  })

  it('reads initial values from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebar: 'icons-text' }))
    const { result } = renderHook(() => useDisplayMode(), { wrapper })
    expect(result.current.sidebar).toBe('icons-text')
  })

  it('persists sidebar mode to localStorage', () => {
    const { result } = renderHook(() => ({ mode: useDisplayMode(), set: useSetDisplayMode() }), {
      wrapper,
    })
    act(() => {
      result.current.set('sidebar', 'icons-text')
    })
    expect(result.current.mode.sidebar).toBe('icons-text')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sidebar).toBe('icons-text')
  })
})
