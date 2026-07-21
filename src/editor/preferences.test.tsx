// The per-device display preferences, held as session state so the shortcut,
// the toolbar button and the PNG export all read one value (CONTEXT.md:
// Preference).
import { beforeEach, describe, expect, it } from 'vitest'
import { loadGridVisible } from './grid'
import { loadMeasuresVisible } from './measurePref'
import { measuresVisible, toggleGrid, toggleMeasures, usePreferences } from './preferences'

beforeEach(() => {
  localStorage.clear()
  usePreferences.setState({ grid: true, measures: true })
})

describe('toggling', () => {
  it('flips the grid and persists it', () => {
    toggleGrid()
    expect(usePreferences.getState().grid).toBe(false)
    expect(loadGridVisible()).toBe(false)
  })

  it('flips the measures and persists them', () => {
    toggleMeasures()
    expect(usePreferences.getState().measures).toBe(false)
    expect(loadMeasuresVisible()).toBe(false)
  })

  it('flips back', () => {
    toggleGrid()
    toggleGrid()
    expect(usePreferences.getState().grid).toBe(true)
    expect(loadGridVisible()).toBe(true)
  })
})

// ADR 0008: the editor draws with the measure preference and the export prints
// with it, so the two may never disagree. Storage does nothing, silently, when
// it is unavailable — which is why the session holds the value and storage only
// makes it outlive a reload.
describe('the export reader', () => {
  it('follows the session, not storage', () => {
    toggleMeasures()
    expect(measuresVisible()).toBe(false)
  })

  it('still reports the session value when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('quota')
    }
    try {
      toggleMeasures()
      expect(measuresVisible()).toBe(false)
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
