// The per-device display preferences that have a keyboard shortcut: what the
// sheet shows, as opposed to how the plan is drawn (CONTEXT.md: Preference).
//
// A store rather than editor state, for the reason `helpStore.ts` is one: the
// registry that binds G and M now sits in App, and the buttons that toggle the
// same values sit in the editor. Neither is a child of the other, so there is
// no state to lift — only a value both read.
//
// Storage is the memory, not the value. It does nothing, silently, when it is
// unavailable (private mode), so a preference that read back from it would let
// the PNG export print the very measures the screen is hiding (ADR 0008). The
// session holds the value; storage only makes it outlive a reload.
//
// Snap stays out: it is not about what is displayed but about how a drawn point
// lands, and Alt inverts it per-gesture — a different lifetime entirely.
import { create } from 'zustand'
import { loadGridVisible, saveGridVisible } from './grid'
import { loadMeasuresVisible, saveMeasuresVisible } from './measurePref'

interface Preferences {
  grid: boolean
  measures: boolean
}

export const usePreferences = create<Preferences>(() => ({
  grid: loadGridVisible(),
  measures: loadMeasuresVisible(),
}))

export function toggleGrid(): void {
  const grid = !usePreferences.getState().grid
  usePreferences.setState({ grid })
  saveGridVisible(grid)
}

export function toggleMeasures(): void {
  const measures = !usePreferences.getState().measures
  usePreferences.setState({ measures })
  saveMeasuresVisible(measures)
}

/** The measure preference for a non-React reader — the PNG export (ADR 0008). */
export const measuresVisible = (): boolean => usePreferences.getState().measures

/**
 * Re-read storage, as a fresh load does.
 *
 * The store is a module singleton, so it is read from storage exactly once per
 * page load — which is the behavior, not an accident: a preference is a device's
 * standing answer, not something to re-check mid-session. This is that first
 * read, named, so a test can put a session boundary in the middle of a file.
 */
export function reloadPreferences(): void {
  usePreferences.setState({ grid: loadGridVisible(), measures: loadMeasuresVisible() })
}
