<template>
  <div
    ref="treeViewRef"
    class="tree-view"
    :class="hasProject ? 'has-project' : 'no-project'"
  >
    <div
      v-if="openedFilesInSidebar"
      ref="openedFilesSectionRef"
      class="opened-files"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          :size="12"
          @click.stop="toggleOpenedFiles()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleOpenedFiles()"
        >{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <icon-tooltip :content="t('sideBar.tree.saveAll')">
          <button
            type="button"
            class="plain-button"
            :aria-label="t('sideBar.tree.saveAll')"
            @click.stop="saveAll(false)"
          >
            <svg
              class="icon"
              aria-hidden="true"
            >
              <use xlink:href="#icon-save-all" />
            </svg>
          </button>
        </icon-tooltip>
        <icon-tooltip :content="t('sideBar.tree.closeAll')">
          <button
            type="button"
            class="plain-button"
            :aria-label="t('sideBar.tree.closeAll')"
            @click.stop="saveAll(true)"
          >
            <svg
              class="icon"
              aria-hidden="true"
            >
              <use xlink:href="#icon-close-all" />
            </svg>
          </button>
        </icon-tooltip>
      </div>
      <div
        v-show="showOpenedFiles"
        class="opened-files-list"
        :style="hasProject ? { height: `${openedFilesRenderedHeight}px` } : undefined"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of tabs"
            :key="tab.id"
            :file="tab"
          />
        </transition-group>
      </div>
    </div>

    <div
      v-if="hasProject && openedFilesInSidebar && showOpenedFiles && tabCount > MIN_VISIBLE_ROWS"
      class="splitter"
      role="separator"
      aria-orientation="horizontal"
      tabindex="0"
      :aria-valuenow="openedFilesRenderedHeight"
      :aria-valuemin="MIN_OPENED_FILES_HEIGHT"
      :aria-valuemax="Number.isFinite(viewportLimit) ? viewportLimit : undefined"
      :aria-label="t('sideBar.tree.openedFiles')"
      @mousedown="handleSplitterMouseDown"
      @dblclick="resetOpenedFilesHeight"
      @keydown="handleSplitterKeydown"
    />

    <div
      v-if="projectTree"
      class="project-tree"
    >
      <div
        class="title"
        @contextmenu.prevent="handleRootContextMenu"
      >
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showDirectories }"
          :size="12"
          @click.stop="toggleDirectories()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleDirectories()"
        >{{
          projectTree.name
        }}</span>
      </div>
      <div
        v-show="showDirectories"
        ref="treeWrapper"
        class="tree-wrapper"
        tabindex="0"
        @mousedown="handleTreeMouseDown"
        @focusout="handleTreeFocusOut"
        @keydown="handleTreeKeydown"
      >
        <folder
          v-for="folder of projectTree.folders"
          :key="folder.id"
          :folder="folder"
          :depth="depth"
        />
        <input
          v-show="createCacheDirname === projectTree.pathname"
          ref="input"
          v-model="nameInputValue"
          placeholder="Enter .md file name"
          type="text"
          class="new-input"
          :style="{ 'margin-left': `${depth * 5 + 15}px` }"
          @keypress.enter="handleInputEnter"
        >
        <file
          v-for="file of projectTree.files"
          :key="file.id"
          :file="file"
          :depth="depth"
        />
        <div
          v-if="
            projectTree.files.length === 0 &&
              projectTree.folders.length === 0 &&
              createCacheDirname !== projectTree.pathname
          "
          class="empty-project"
        >
          <span>{{ t('sideBar.tree.emptyProject') }}</span>
          <div class="centered-group">
            <button
              class="button-primary"
              @click.stop="createFile"
            >
              {{ t('sideBar.tree.createFile') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      class="open-project"
    >
      <div class="centered-group">
        <el-button
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.tree.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import IconTooltip from '@/components/iconTooltip/index.vue'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import { PATH_SEPARATOR } from '@/config'
import { isMac } from '@/util'
import { computeRevealScrollTop } from '@/util/revealTreeRow'
import {
  DEFAULT_OPENED_FILES_HEIGHT,
  MIN_OPENED_FILES_HEIGHT,
  MIN_VISIBLE_ROWS,
  OPENED_FILES_TITLE_HEIGHT,
  computeRenderedHeight,
  computeViewportLimit
} from '@/util/sidebarLayout'
import {
  isEditableTarget,
  isInsideTreeScope,
  isNameInput,
  keepsSidebarSelection,
  shouldTrashSelection
} from './trashKey'
import { shouldRenameSelection } from './renameKey'
import { TREE_ROW_REGISTRY_KEY, toRowKey, type TreeRowRegistry } from './rowRegistry'
import type { TreeNode, TabDescriptor } from './types'

const { t } = useI18n()

const props = defineProps<{
  // Null until a project is opened.
  projectTree: TreeNode | null
  tabs?: TabDescriptor[]
}>()

const depth = 0
const hasProject = computed(() => !!props.projectTree)
const treeViewRef = ref<HTMLDivElement | null>(null)
const openedFilesSectionRef = ref<HTMLDivElement | null>(null)
const tabCount = computed(() => props.tabs?.length ?? 0)
// Switching views remounts the tree; persist section expansion across those
// remounts and app restarts (#2421).
const SHOW_DIRECTORIES_KEY = 'side-bar-show-directories'
const SHOW_OPENED_FILES_KEY = 'side-bar-show-opened-files'
const readSectionExpanded = (key: string): boolean => localStorage.getItem(key) !== 'false'
const showDirectories = ref(readSectionExpanded(SHOW_DIRECTORIES_KEY))
const showOpenedFiles = ref(readSectionExpanded(SHOW_OPENED_FILES_KEY))
const input = ref<HTMLInputElement | null>(null)
const treeWrapper = ref<HTMLDivElement | null>(null)

const rowRegistry: TreeRowRegistry = new Map()
provide(TREE_ROW_REGISTRY_KEY, rowRegistry)

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const preferencesStore = usePreferencesStore()

const { createCache } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { renameCache } = storeToRefs(projectStore)
const { nameInputValue } = storeToRefs(projectStore)
const { openedFilesInSidebar } = storeToRefs(preferencesStore)
const { openedFilesHeight } = storeToRefs(layoutStore)
// Keep the requested height independent so a smaller viewport cannot overwrite the user's choice.
const requestedOpenedFilesHeight = ref(openedFilesHeight.value)
const viewportLimit = ref(Infinity)
const openedFilesRenderedHeight = computed(() =>
  computeRenderedHeight(requestedOpenedFilesHeight.value, viewportLimit.value)
)

watch(openedFilesHeight, height => {
  requestedOpenedFilesHeight.value = height
})

const updateViewportLimit = (): void => {
  const view = treeViewRef.value
  const section = openedFilesSectionRef.value
  if (!view || !section) return
  const sectionTop = section.getBoundingClientRect().top - view.getBoundingClientRect().top
  viewportLimit.value = computeViewportLimit(view.clientHeight, sectionTop + OPENED_FILES_TITLE_HEIGHT)
}

watch(showOpenedFiles, () => nextTick(updateViewportLimit))
watch(openedFilesSectionRef, () => nextTick(updateViewportLimit))

let resizeObserver: ResizeObserver | undefined
let startY = 0
let startHeight = 0

const stopDragging = (): void => {
  document.removeEventListener('mousemove', handleSplitterMouseMove)
  document.removeEventListener('mouseup', handleSplitterMouseUp)
}

const handleSplitterMouseMove = (event: MouseEvent): void => {
  requestedOpenedFilesHeight.value = Math.max(
    MIN_OPENED_FILES_HEIGHT,
    startHeight + (event.clientY - startY)
  )
}

const handleSplitterMouseUp = (): void => {
  layoutStore.SET_OPENED_FILES_HEIGHT(requestedOpenedFilesHeight.value)
  stopDragging()
}

const handleSplitterMouseDown = (event: MouseEvent): void => {
  event.preventDefault()
  updateViewportLimit()
  startY = event.clientY
  startHeight = openedFilesRenderedHeight.value
  document.addEventListener('mousemove', handleSplitterMouseMove)
  document.addEventListener('mouseup', handleSplitterMouseUp)
}

const resetOpenedFilesHeight = (): void => {
  requestedOpenedFilesHeight.value = DEFAULT_OPENED_FILES_HEIGHT
  layoutStore.SET_OPENED_FILES_HEIGHT(DEFAULT_OPENED_FILES_HEIGHT)
}

const handleSplitterKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const offset = event.key === 'ArrowUp' ? -20 : 20
  requestedOpenedFilesHeight.value = Math.max(
    MIN_OPENED_FILES_HEIGHT,
    requestedOpenedFilesHeight.value + offset
  )
  layoutStore.SET_OPENED_FILES_HEIGHT(requestedOpenedFilesHeight.value)
}

// The create cache is empty when no input is shown.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFile = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'file')
}

const handleRootContextMenu = (event: MouseEvent): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  showContextMenu(event, !!clipboard.value)
}

const toggleOpenedFiles = (): void => {
  showOpenedFiles.value = !showOpenedFiles.value
  localStorage.setItem(SHOW_OPENED_FILES_KEY, String(showOpenedFiles.value))
}

const setShowDirectories = (value: boolean): void => {
  showDirectories.value = value
  localStorage.setItem(SHOW_DIRECTORIES_KEY, String(value))
}

const toggleDirectories = (): void => {
  setShowDirectories(!showDirectories.value)
}

const findRow = (pathname: string): HTMLElement | undefined => {
  const key = toRowKey(pathname)
  const row = rowRegistry.get(key)
  if (row) return row
  // Windows paths can differ in case.
  for (const [registered, element] of rowRegistry) {
    if (window.fileUtils.isSamePathSync(registered, key)) return element
  }
  return undefined
}

const scrollRowIntoView = (container: HTMLElement, row: HTMLElement): void => {
  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const scrollTop = computeRevealScrollTop({
    rowTopInContent: rowRect.top - containerRect.top + container.scrollTop,
    rowHeight: rowRect.height,
    viewportHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
    scrollTop: container.scrollTop
  })
  if (scrollTop !== null) container.scrollTop = scrollTop
}

// Reveals only: the caret, the tree selection and `activeItem` stay untouched.
// `force` (the "Show in Side Bar" command) ignores the preference.
const revealPath = async (
  pathname: string | null | undefined,
  { force = false }: { force?: boolean } = {}
): Promise<void> => {
  if (!pathname) return
  if (!force && !preferencesStore.autoRevealInSidebar) return
  if (!showDirectories.value) {
    if (!force) return
    setShowDirectories(true)
  }
  // Hidden views have no visible row to scroll into view.
  if (!layoutStore.showSideBar || layoutStore.rightColumn !== 'files') return
  if (!projectStore.REVEAL_PATH(pathname)) return

  await nextTick()
  const container = treeWrapper.value
  // Hidden views report a zero-size viewport.
  if (!container || container.offsetParent === null) return

  const row = findRow(pathname)
  if (row) scrollRowIntoView(container, row)
}

const handleRevealPath = (pathname: unknown): void => {
  revealPath(typeof pathname === 'string' ? pathname : null, { force: true })
}

const handleInputFocus = (): void => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(nameInputValue.value)
}

const focusTree = (): void => {
  treeWrapper.value?.focus()
}

// preventDefault stops the browser's default mousedown focus move (to <body>)
// from undoing the focus() call.
const handleTreeMouseDown = (event: MouseEvent): void => {
  if (isEditableTarget(event.target)) return
  if (event.button === 0) event.preventDefault()
  focusTree()
}

// An inline input closing (rename commit / Escape) drops focus to <body>.
const handleTreeFocusOut = (event: FocusEvent): void => {
  if (!isNameInput(event.target)) return
  nextTick(() => {
    if (document.activeElement === document.body) focusTree()
  })
}

const handleDocumentClick = (event: MouseEvent): void => {
  const { target } = event
  if (!target) return
  if (isNameInput(target)) return

  if (isInsideTreeScope(target) && !keepsSidebarSelection(target)) {
    projectStore.CHANGE_ACTIVE_ITEM({})
  }
  projectStore.COMMIT_NAME_INPUT()
}

const handleDocumentContextMenu = (event: MouseEvent): void => {
  const { target } = event
  if (isNameInput(target)) return

  // Right-clicking opens a native menu whose actions read the selection when
  // clicked, so a rename committed here could leave the menu targeting the old
  // path. Cancel the pending input instead (the pre-#3207 behavior); the
  // click-away path above still commits.
  projectStore.CLEAR_NAME_INPUT_STATE()
}

const handleTreeKeydown = (event: KeyboardEvent): void => {
  const { target, key, metaKey } = event
  const editableTarget = isEditableTarget(target)

  if (key === 'Escape') {
    projectStore.CLEAR_NAME_INPUT_STATE()
    projectStore.CHANGE_ACTIVE_ITEM({})
  }

  const isEditingName = !!renameCache.value || !!createCacheDirname.value
  const shouldRename = shouldRenameSelection({
    key,
    selection: activeItem.value,
    projectRootPath: props.projectTree?.pathname,
    pathSeparator: PATH_SEPARATOR,
    isEditingName,
    editableTarget
  })
  if (shouldRename) {
    event.preventDefault()
    event.stopPropagation()
    return bus.emit('SIDEBAR::rename')
  }

  const shouldTrash = shouldTrashSelection({
    key,
    metaKey,
    isMac,
    selection: activeItem.value,
    projectRootPath: props.projectTree?.pathname,
    pathSeparator: PATH_SEPARATOR,
    isEditingName,
    editableTarget
  })
  if (shouldTrash) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) bus.emit('SIDEBAR::remove')
  }
}

// The row can arrive after the tab does: opening a project delivers its
// contents incrementally, so every tree change is a new chance to reveal.
watch(
  () => [projectStore.treeVersion, editorStore.currentFile?.pathname] as const,
  ([, pathname]) => {
    revealPath(pathname)
  },
  { flush: 'post' }
)

// The tree stays mounted while the side bar is hidden, so a switch made then
// never scrolled; reveal again as soon as the file list is visible.
watch(
  () => layoutStore.showSideBar && layoutStore.rightColumn === 'files',
  (visible) => {
    if (visible) revealPath(editorStore.currentFile?.pathname)
  },
  { flush: 'post' }
)

onMounted(() => {
  updateViewportLimit()
  resizeObserver = new ResizeObserver(updateViewportLimit)
  if (treeViewRef.value) resizeObserver.observe(treeViewRef.value)
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  bus.on('SIDEBAR::focus-tree', focusTree)
  bus.on('SIDEBAR::reveal-path', handleRevealPath)
  // Capture phase: several click targets (project/collapse headings, editor
  // tabs) call `@click.stop`, which would otherwise keep the click-away commit
  // from running.
  document.addEventListener('click', handleDocumentClick, true)
  document.addEventListener('contextmenu', handleDocumentContextMenu)
  revealPath(editorStore.currentFile?.pathname)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  stopDragging()
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  bus.off('SIDEBAR::focus-tree', focusTree)
  bus.off('SIDEBAR::reveal-path', handleRevealPath)
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('contextmenu', handleDocumentContextMenu)
})
</script>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.icon-arrow {
  margin-right: 5px;
  transition: transform 0.25s ease-out;
  transform: rotate(90deg);
  color: var(--sideBarTextColor);
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
}

.opened-files .title {
  padding: 0 15px;
  display: flex;
  align-items: center;
}

.opened-files .title > span {
  flex: 1;
}

/* Clipped rather than `display: none` until the header is hovered or holds
   focus, so Tab can still reach the buttons and reveal them. */
.opened-files .title > button {
  color: var(--sideBarColor);
  margin-left: 8px;
  clip-path: inset(50%);
}
.opened-files div.title:hover > button,
.opened-files div.title:focus-within > button {
  clip-path: none;
}

.opened-files div.title > button:hover {
  color: var(--highlightThemeColor);
}
.opened-files {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.tree-view.has-project .opened-files {
  flex: 0 0 auto;
}

.tree-view.has-project .opened-files .opened-files-list {
  flex: 0 0 auto;
}

.tree-view.no-project .opened-files,
.tree-view.no-project .opened-files .opened-files-list {
  flex: 1 1 auto;
  min-height: 0;
}

.splitter {
  position: relative;
  height: 6px;
  cursor: row-resize;
  flex-shrink: 0;
  user-select: none;
}

/* Widens the grab area past the hairline without taking layout space. */
.splitter::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 0;
  right: 0;
  height: 16px;
}

.splitter::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--itemBgColor);
}

.splitter:hover::after,
.splitter:focus-visible::after {
  top: 1px;
  height: 3px;
  background: var(--highlightThemeColor);
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
}

.project-tree > .title {
  padding: 0 15px;
  display: flex;
  align-items: center;
}

.project-tree > .title > span {
  flex: 1;
  user-select: none;
}

.project-tree > .title > a {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: var(--sideBarIconColor);
  opacity: 0;
}

.project-tree > .title > a:hover {
  color: var(--highlightThemeColor);
}

.project-tree > .title > a.active {
  color: var(--highlightThemeColor);
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a {
  opacity: 1;
}
.open-project {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 12px;
}
/* With an opened-files section above it, that section takes the free space and
   pushes the button down. Without one, the button has to reach the bottom on
   its own. */
.open-project:only-child {
  margin-top: auto;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--focusColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}
.tree-wrapper:focus-visible {
  outline: none;
}
.tree-wrapper:focus-within :deep(.side-bar-file.active),
.tree-wrapper:focus-within :deep(.folder-name.active) {
  outline: 1px solid var(--focusColor);
  outline-offset: -1px;
}
.tree-wrapper:not(:focus-within) :deep(.side-bar-file.active),
.tree-wrapper:not(:focus-within) :deep(.folder-name.active) {
  background: color-mix(in srgb, var(--themeColor20) 55%, transparent);
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--sideBarTextColor);
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
