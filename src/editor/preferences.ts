// Per-device display preferences with a shortcut (CONTEXT.md: Preference).
// Session holds the value, not storage: a read-back would print measures the screen hides (ADR 0008).
import { create } from 'zustand';
import { loadGridVisible, saveGridVisible } from './grid';
import { loadMeasuresVisible, saveMeasuresVisible } from './measurePref';

interface Preferences {
  grid: boolean;
  measures: boolean;
}

export const usePreferences = create<Preferences>(() => ({
  grid: loadGridVisible(),
  measures: loadMeasuresVisible(),
}));

export function toggleGrid(): void {
  const grid = !usePreferences.getState().grid;
  usePreferences.setState({ grid });
  saveGridVisible(grid);
}

export function toggleMeasures(): void {
  const measures = !usePreferences.getState().measures;
  usePreferences.setState({ measures });
  saveMeasuresVisible(measures);
}

/** The measure preference for a non-React reader — the PNG export (ADR 0008). */
export const measuresVisible = (): boolean => usePreferences.getState().measures;

/** Re-read storage, as a fresh load does: the singleton otherwise reads once per page load. */
export function reloadPreferences(): void {
  usePreferences.setState({ grid: loadGridVisible(), measures: loadMeasuresVisible() });
}
