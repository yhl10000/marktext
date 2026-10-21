import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, openProjectFolder } from './helpers'

const listSelector = '.side-bar .opened-files .opened-files-list'
const splitterSelector = '.tree-view > .splitter'
const fileNames = Array.from({ length: 16 }, (_, index) =>
  `f${String(index + 1).padStart(2, '0')}.md`
)

const height = (locator: Locator): Promise<number> =>
  locator.evaluate(element => element.getBoundingClientRect().height)

const requestedHeight = (page: Page): Promise<number> =>
  page.evaluate(() => Number(localStorage.getItem('side-bar-opened-files-height')))

const expectHeight = async(locator: Locator, expected: number, tolerance = 3): Promise<void> => {
  await expect.poll(async() => Math.abs(await height(locator) - expected))
    .toBeLessThanOrEqual(tolerance)
}

const openFiles = async(page: Page, names: readonly string[]): Promise<void> => {
  for (const name of names) {
    await page.locator(`.side-bar .tree-wrapper .side-bar-file[title$="${name}"]`).click()
    await expect(page.locator(`${listSelector} .opened-file[title$="${name}"]`)).toHaveCount(1)
  }
}

const dragSplitter = async(page: Page, distance: number): Promise<void> => {
  const splitter = page.locator(splitterSelector)
  await expect(splitter).toBeVisible()
  const box = await splitter.boundingBox()
  assert.ok(box)
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX, centerY + distance, { steps: 8 })
  await page.mouse.up()
}

test.describe('Sidebar opened files layout', () => {
  test.describe('With a project', () => {
    let app: ElectronApplication
    let page: Page
    let projectDir: string

    test.beforeAll(() => {
      projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-split-'))
      for (const name of fileNames) {
        fs.writeFileSync(path.join(projectDir, name), `# ${name}\n`, 'utf-8')
      }
    })

    test.beforeEach(async() => {
      const launched = await launchElectron([projectDir])
      app = launched.app
      page = launched.page
      await expect.poll(async() => {
        for (const candidate of app.windows()) {
          if (await candidate.locator('.tree-wrapper .side-bar-file').count()) {
            page = candidate
            return true
          }
        }
        return false
      }, { timeout: 15000 }).toBe(true)
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].setContentSize(1280, 720)
      })
      await expect(page.locator('.side-bar')).toBeVisible()
      await expect(page.locator('.tree-wrapper')).toBeVisible()
      await expect(page.locator('.tree-wrapper .side-bar-file')).toHaveCount(16)
    })

    test.afterEach(async() => {
      if (app) await app.close()
    })

    test.afterAll(() => {
      if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true })
    })

    test('the handle only appears with more than four open files', async() => {
      await openFiles(page, fileNames.slice(0, 4))
      const list = page.locator(listSelector)
      await expect(list.locator('.opened-file')).toHaveCount(4)
      await expect(page.locator(splitterSelector)).toHaveCount(0)
      await expectHeight(list, 112)

      await openFiles(page, fileNames.slice(4, 5))
      await expect(list.locator('.opened-file')).toHaveCount(5)
      await expect(page.locator(splitterSelector)).toBeVisible()
    })

    test('dragging the handle grows the list and the height is remembered', async() => {
      await openFiles(page, fileNames.slice(0, 5))
      const list = page.locator(listSelector)
      await expect(list.locator('.opened-file')).toHaveCount(5)
      await expectHeight(list, 112)

      await dragSplitter(page, 300)
      await expectHeight(list, 412, 12)
      await expect.poll(async() => Math.abs(await requestedHeight(page) - 412))
        .toBeLessThanOrEqual(4)
      const resizedHeight = await height(list)

      await page.locator('.side-bar .search-button').click()
      await expect(page.locator('.side-bar-search')).toBeVisible()
      await page.locator('.side-bar .back-button').click()
      await expect(page.locator('.tree-view')).toBeVisible()
      await expectHeight(list, resizedHeight)

      await page.waitForTimeout(2000)
      const reloaded = page.waitForEvent('domcontentloaded')
      await app.evaluate(({ BrowserWindow, ipcMain }) => {
        const win = BrowserWindow.getAllWindows()[0]
        ipcMain.emit('window-reload-by-id', win.id)
      })
      await reloaded
      await page.waitForFunction(() => !!document.querySelector('.side-bar'), null, { timeout: 15000 })
      await expect(page.locator('.side-bar')).toBeVisible()
      await page.waitForFunction(() =>
        !!document.querySelector('.side-bar .tree-wrapper, .side-bar .open-project')
      )
      if (await page.locator('.tree-wrapper').count() === 0) {
        const marker = path.join(projectDir, 'f01.md').replaceAll('\\', '\\\\')
        await openProjectFolder(app, page, projectDir, marker)
      }
      await expect(page.locator('.tree-wrapper')).toBeVisible()
      await openFiles(page, fileNames.slice(0, 5))
      await expect(list.locator('.opened-file')).toHaveCount(5)
      await expectHeight(list, 412, 4)
      await expect.poll(async() => Math.abs(await requestedHeight(page) - 412))
        .toBeLessThanOrEqual(4)
    })

    test('the handle has a grab area that is easy to hit', async() => {
      await openFiles(page, fileNames.slice(0, 5))
      await expect(page.locator(`${listSelector} .opened-file`)).toHaveCount(5)
      await expect(page.locator(splitterSelector)).toBeVisible()
      const grabHeight = await page.evaluate(() => {
        const element = document.querySelector('.tree-view > .splitter')
        if (!element) return 0
        return parseFloat(getComputedStyle(element, '::before').height)
      })
      expect(grabHeight).toBeGreaterThanOrEqual(12)
    })

    test('the project tree keeps its room when the window shrinks, and the list grows back', async() => {
      await openFiles(page, fileNames)
      const list = page.locator(listSelector)
      await expect(list.locator('.opened-file')).toHaveCount(16)
      await expectHeight(list, 112)
      await dragSplitter(page, 300)
      await expectHeight(list, 412, 12)
      const originalHeight = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getContentSize()[1]
      )

      await expect.poll(async() => Math.abs(await requestedHeight(page) - 412))
        .toBeLessThanOrEqual(4)
      const storedHeight = await requestedHeight(page)
      const tallHeight = await height(list)

      await app.evaluate(({ BrowserWindow }, contentHeight) => {
        const win = BrowserWindow.getAllWindows()[0]
        const [width] = win.getContentSize()
        win.setContentSize(width, contentHeight)
      }, 420)
      await expect.poll(() => height(list)).toBeLessThan(tallHeight)
      await expect.poll(() => height(page.locator('.side-bar .project-tree')))
        .toBeGreaterThan(100)
      await expect.poll(() => requestedHeight(page)).toBe(storedHeight)

      await app.evaluate(({ BrowserWindow }, contentHeight) => {
        const win = BrowserWindow.getAllWindows()[0]
        const [width] = win.getContentSize()
        win.setContentSize(width, contentHeight)
      }, originalHeight)
      await expectHeight(list, tallHeight, 12)
    })

    test('the handle is reachable from the keyboard', async() => {
      await openFiles(page, fileNames)
      const list = page.locator(listSelector)
      await expectHeight(list, 112)
      await dragSplitter(page, 40)
      await expectHeight(list, 152)
      const splitter = page.locator(splitterSelector)
      await splitter.focus()
      await expect(splitter).toBeFocused()

      await page.keyboard.press('ArrowDown')
      await expectHeight(list, 172)
      await expect.poll(() => requestedHeight(page)).toBe(172)
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await expectHeight(list, 132)
      await expect.poll(() => requestedHeight(page)).toBe(132)
    })
  })

  test.describe('Without a project', () => {
    let app: ElectronApplication
    let page: Page
    let noteDir: string

    test.beforeAll(async() => {
      noteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-noproject-'))
      const notePath = path.join(noteDir, 'note.md')
      fs.writeFileSync(notePath, '# Note\n', 'utf-8')
      const launched = await launchElectron([notePath], {
        preferences: { sideBarVisibility: true, openFilesInNewWindow: true }
      })
      app = launched.app
      page = launched.page
      await expect.poll(async() => {
        for (const candidate of app.windows()) {
          if (await candidate.locator('.side-bar .open-project').count() > 0) {
            page = candidate
            return true
          }
        }
        return false
      }, { timeout: 15000 }).toBe(true)
      await expect(page.locator('.side-bar .open-project')).toBeVisible()
    })

    test.afterAll(async() => {
      if (app) await app.close()
      if (noteDir) fs.rmSync(noteDir, { recursive: true, force: true })
    })

    test('without a project the Open Folder button sits at the bottom', async() => {
      await expect(page.locator('.tree-wrapper')).toHaveCount(0)
      await expect(page.locator(splitterSelector)).toHaveCount(0)
      const button = page.locator('.side-bar .open-project .el-button')
      await expect(button).toBeVisible()
      // The settings gear occupies the foot of the side bar, so the button
      // rests right above it rather than on the very last pixel.
      await expect.poll(async() => {
        const buttonBox = await button.boundingBox()
        const footerBox = await page.locator('.side-bar .sidebar-footer').boundingBox()
        return buttonBox && footerBox ? footerBox.y - buttonBox.y - buttonBox.height : Infinity
      }).toBeLessThanOrEqual(20)
      await expect.poll(() => height(page.locator(listSelector))).toBeGreaterThan(200)
    })
  })
})
