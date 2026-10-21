import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear()
    }
  })
  const w = globalThis as unknown as { window?: Record<string, unknown> }
  w.window ??= {}
  w.window.marktext = { env: { windowId: 1 } }
  w.window.electron = { ipcRenderer: { send: () => {}, on: () => {}, invoke: vi.fn() } }
})

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({ tocVisibility: true, SET_SINGLE_PREFERENCE: vi.fn() })
}))
vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn() }))

const heightKey = 'side-bar-opened-files-height'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('opened files height persistence', () => {
  it('defaults to 112 when no height is stored', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    expect(useLayoutStore().openedFilesHeight).toBe(112)
  })

  it('reads the stored height when the module loads', async() => {
    localStorage.setItem(heightKey, '240')
    const { useLayoutStore } = await import('@/store/layout')
    expect(useLayoutStore().openedFilesHeight).toBe(240)
  })

  it('updates the height, persists it and schedules a buffered update', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const { debouncedSendBufferedState } = await import('@/store/bufferedState')
    const layout = useLayoutStore()

    layout.SET_OPENED_FILES_HEIGHT(300)

    expect(layout.openedFilesHeight).toBe(300)
    expect(localStorage.getItem(heightKey)).toBe('300')
    expect(debouncedSendBufferedState).toHaveBeenCalledOnce()
  })

  it.each([
    { input: -50, expected: 0 },
    { input: 'not-a-number', expected: 112 },
    { input: '240', expected: 240 },
    { input: 240.6, expected: 241 }
  ])('normalizes $input to $expected before persisting', async({ input, expected }) => {
    const { useLayoutStore } = await import('@/store/layout')
    const layout = useLayoutStore()

    layout.SET_OPENED_FILES_HEIGHT(input)

    expect(layout.openedFilesHeight).toBe(expected)
    expect(localStorage.getItem(heightKey)).toBe(String(expected))
  })

  it('persists without scheduling a buffered update when requested', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const { debouncedSendBufferedState } = await import('@/store/bufferedState')
    const layout = useLayoutStore()

    layout.SET_OPENED_FILES_HEIGHT(300, { scheduleBufferUpdate: false })

    expect(layout.openedFilesHeight).toBe(300)
    expect(localStorage.getItem(heightKey)).toBe('300')
    expect(debouncedSendBufferedState).not.toHaveBeenCalled()
  })

  it('preserves large requested heights through storage and buffered round trips', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const layout = useLayoutStore()
    layout.SET_OPENED_FILES_HEIGHT(5000)
    const snapshot = layout.CREATE_BUFFERED_STATE()

    expect(snapshot).toMatchObject({ openedFilesHeight: 5000 })
    expect(localStorage.getItem(heightKey)).toBe('5000')

    vi.resetModules()
    setActivePinia(createPinia())
    const { useLayoutStore: useReloadedLayoutStore } = await import('@/store/layout')
    const reloadedLayout = useReloadedLayoutStore()
    expect(reloadedLayout.openedFilesHeight).toBe(5000)

    reloadedLayout.SET_OPENED_FILES_HEIGHT(112)
    reloadedLayout.RESTORE_BUFFERED_STATE(snapshot)
    expect(reloadedLayout.openedFilesHeight).toBe(5000)
  })

  it('restores a buffered height without scheduling another buffered update', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const { debouncedSendBufferedState } = await import('@/store/bufferedState')
    const layout = useLayoutStore()

    layout.RESTORE_BUFFERED_STATE({
      rightColumn: 'files',
      showSideBar: true,
      showTabBar: true,
      sideBarWidth: 280,
      openedFilesHeight: '360'
    })

    expect(layout.openedFilesHeight).toBe(360)
    expect(layout.CREATE_BUFFERED_STATE()).toMatchObject({ openedFilesHeight: 360 })
    expect(debouncedSendBufferedState).not.toHaveBeenCalled()
  })

  it('uses the default height when restoring a snapshot without the new field', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const layout = useLayoutStore()
    layout.SET_OPENED_FILES_HEIGHT(300)

    layout.RESTORE_BUFFERED_STATE({ sideBarWidth: 280 })

    expect(layout.openedFilesHeight).toBe(112)
  })

  it('leaves SET_LAYOUT behavior unchanged and does not apply or persist heights', async() => {
    const { useLayoutStore } = await import('@/store/layout')
    const { debouncedSendBufferedState } = await import('@/store/bufferedState')
    const layout = useLayoutStore()
    layout.SET_OPENED_FILES_HEIGHT(240, { scheduleBufferUpdate: false })

    layout.SET_LAYOUT({
      rightColumn: 'search',
      showSideBar: true,
      showTabBar: true,
      sideBarWidth: 320,
      openedFilesHeight: 5000
    })

    expect(layout.rightColumn).toBe('search')
    expect(layout.showSideBar).toBe(true)
    expect(layout.showTabBar).toBe(true)
    expect(layout.sideBarWidth).toBe(320)
    expect(layout.openedFilesHeight).toBe(240)
    expect(localStorage.getItem(heightKey)).toBe('240')
    expect(debouncedSendBufferedState).toHaveBeenCalledOnce()
  })
})
