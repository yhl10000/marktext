/**
 * Geometry of the two stacked side bar sections: the "opened files" list on
 * top and the project tree below it. Both the splitter that divides them and
 * the store that remembers the position read these numbers, so the layout
 * rules live here instead of being restated per component.
 */

/** localStorage key that remembers the opened-files list height. */
export const OPENED_FILES_HEIGHT_KEY = 'side-bar-opened-files-height'

/** Height the list had before it became draggable — the pre-splitter look. */
export const DEFAULT_OPENED_FILES_HEIGHT = 112

/** Height of one opened-file row. Must match `.opened-file` in treeOpenedTab.vue. */
export const OPENED_FILES_ROW_HEIGHT = 28

/** Rows the list shows before it starts scrolling. */
export const MIN_VISIBLE_ROWS = 4

export const MIN_OPENED_FILES_HEIGHT = MIN_VISIBLE_ROWS * OPENED_FILES_ROW_HEIGHT

export const OPENED_FILES_TITLE_HEIGHT = 30

export const RESIZE_HANDLE_HEIGHT = 6

/** Room the project tree keeps so it never collapses to nothing. */
export const PROJECT_TREE_RESERVE_PX = 150

export const normalizeOpenedFilesHeight = (height: unknown): number => {
  // `localStorage.getItem` answers null for a missing key and `Number(null)`
  // is 0, so the empty case has to be caught before the numeric conversion.
  if (height === null || height === undefined || height === '') return DEFAULT_OPENED_FILES_HEIGHT
  const numeric = Number(height)
  if (!Number.isFinite(numeric)) return DEFAULT_OPENED_FILES_HEIGHT
  return Math.max(0, Math.round(numeric))
}

/**
 * Room the list may take before the project tree gets squeezed.
 * `listTop` is the offset of the list's top edge inside the section container.
 */
export const computeViewportLimit = (viewHeight: number, listTop: number): number =>
  Math.max(0, Math.round(viewHeight - listTop - RESIZE_HANDLE_HEIGHT - PROJECT_TREE_RESERVE_PX))

/**
 * Height the list is actually drawn at. The requested height is what the user
 * picked; the viewport limit keeps room for the project tree regardless of row count.
 */
export const computeRenderedHeight = (
  requestedHeight: number,
  viewportLimit: number
): number =>
  Math.max(
    MIN_OPENED_FILES_HEIGHT,
    Math.min(normalizeOpenedFilesHeight(requestedHeight), viewportLimit)
  )
