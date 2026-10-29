import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updater = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn()
}))
const ipc = new EventEmitter()
const updateEvents = new EventEmitter()

vi.mock('electron', () => ({
  ipcMain: ipc,
  BrowserWindow: { fromWebContents: () => null },
  Menu: { sendActionToFirstResponder: vi.fn() }
}))
vi.mock('electron-updater', () => ({
  autoUpdater: Object.assign(updateEvents, updater)
}))
vi.mock('main_renderer/config', () => ({ isOsx: false }))
vi.mock('main_renderer/commands', () => ({
  COMMANDS: { MT_HIDE: 'mt.hide', MT_HIDE_OTHERS: 'mt.hide-others' }
}))

describe('In-app updates are disabled', () => {
  beforeEach(async() => {
    vi.resetModules()
    vi.clearAllMocks()
    ipc.removeAllListeners()
    updateEvents.removeAllListeners()
    await import('main_renderer/menu/actions/marktext')
  })

  it('does not check for updates when the legacy IPC is sent', () => {
    ipc.emit('mt::check-for-update', { sender: {} })

    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('does not download when a legacy confirmation is sent', () => {
    ipc.emit('mt::NEED_UPDATE', {}, { needUpdate: true })

    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('does not install when an update-downloaded event arrives', async() => {
    updateEvents.emit('update-downloaded', {})
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
})
