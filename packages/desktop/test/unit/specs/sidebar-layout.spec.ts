import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPENED_FILES_HEIGHT,
  MIN_OPENED_FILES_HEIGHT,
  normalizeOpenedFilesHeight,
  computeViewportLimit,
  computeRenderedHeight
} from '@/util/sidebarLayout'

describe('normalizeOpenedFilesHeight', () => {
  it('keeps finite heights and rounds fractional heights', () => {
    expect(normalizeOpenedFilesHeight(240)).toBe(240)
    expect(normalizeOpenedFilesHeight(240.6)).toBe(241)
    expect(normalizeOpenedFilesHeight(240.4)).toBe(240)
    expect(normalizeOpenedFilesHeight(5000)).toBe(5000)
  })

  it('clamps negative heights to zero', () => {
    expect(normalizeOpenedFilesHeight(-50)).toBe(0)
  })

  it.each([undefined, null, '', NaN, Infinity, -Infinity, 'not-a-number'])(
    'uses the default height for %s',
    height => {
      expect(normalizeOpenedFilesHeight(height)).toBe(DEFAULT_OPENED_FILES_HEIGHT)
      expect(DEFAULT_OPENED_FILES_HEIGHT).toBe(112)
    }
  )

  it('accepts numeric strings', () => {
    expect(normalizeOpenedFilesHeight('240')).toBe(240)
  })
})

describe('computeViewportLimit', () => {
  it('reserves room for the resize handle and project tree below the list', () => {
    expect(computeViewportLimit(500, 30)).toBe(314)
  })

  it('rounds fractional viewport limits', () => {
    expect(computeViewportLimit(500.6, 30)).toBe(315)
  })

  it('never returns a negative limit when the viewport is smaller than the reserved space', () => {
    expect(computeViewportLimit(10, 30)).toBe(0)
  })
})

describe('computeRenderedHeight', () => {
  it('honours requested heights below the viewport limit', () => {
    expect(computeRenderedHeight(232, 1000)).toBe(232)
    expect(computeRenderedHeight(240.6, 1000)).toBe(241)
  })

  it('does not clamp a requested height of 412px to the 140px content of five rows', () => {
    expect(computeRenderedHeight(412, 1000)).toBe(412)
  })

  it('caps the height at the viewport limit', () => {
    expect(computeRenderedHeight(400, 200)).toBe(200)
  })

  it('keeps at least four rows even with tiny viewport limits or negative requests', () => {
    expect(computeRenderedHeight(400, 10)).toBe(MIN_OPENED_FILES_HEIGHT)
    expect(MIN_OPENED_FILES_HEIGHT).toBe(112)
    expect(computeRenderedHeight(-50, 1000)).toBe(112)
  })

  it('accepts an unmeasured viewport limit', () => {
    expect(computeRenderedHeight(240, Infinity)).toBe(240)
  })

  it('restores the requested height when the viewport grows again', () => {
    const requestedHeight = 400
    expect(computeRenderedHeight(requestedHeight, 200)).toBe(200)
    expect(computeRenderedHeight(requestedHeight, 1000)).toBe(400)
  })
})
