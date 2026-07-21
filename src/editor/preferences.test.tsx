// CONTEXT.md: Preference — one session value behind shortcut, toolbar, export.
import { beforeEach, describe, expect, it } from 'vitest';
import { loadGridVisible } from './grid';
import { loadMeasuresVisible } from './measurePref';
import { measuresVisible, toggleGrid, toggleMeasures, usePreferences } from './preferences';

beforeEach(() => {
  localStorage.clear();
  usePreferences.setState({ grid: true, measures: true });
});

describe('toggling', () => {
  it('flips the grid and persists it', () => {
    toggleGrid();
    expect(usePreferences.getState().grid).toBe(false);
    expect(loadGridVisible()).toBe(false);
  });

  it('flips the measures and persists them', () => {
    toggleMeasures();
    expect(usePreferences.getState().measures).toBe(false);
    expect(loadMeasuresVisible()).toBe(false);
  });

  it('flips back', () => {
    toggleGrid();
    toggleGrid();
    expect(usePreferences.getState().grid).toBe(true);
    expect(loadGridVisible()).toBe(true);
  });
});

// ADR 0008: editor and export may never disagree. Session, not storage —
// storage fails silently when unavailable.
describe('the export reader', () => {
  it('follows the session, not storage', () => {
    toggleMeasures();
    expect(measuresVisible()).toBe(false);
  });

  it('still reports the session value when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    try {
      toggleMeasures();
      expect(measuresVisible()).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
