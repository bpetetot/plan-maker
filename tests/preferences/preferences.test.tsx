// CONTEXT.md: Preference — one session value behind shortcut, toolbar, export.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPreference,
  reloadPreferences,
  setPreference,
  togglePreference,
  usePreferences,
} from '../../src/preferences/preferences';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});

describe('the storage discipline', () => {
  // The Grid is the one off by default, and it carries the snapping with it
  // (ADR 0035).
  it('starts every preference at its default when nothing is stored', () => {
    expect(usePreferences.getState()).toEqual({
      grid: false,
      measures: true,
      theme: 'system',
    });
  });

  it('stores nothing for the default, so an untouched device follows it', () => {
    togglePreference('grid');
    togglePreference('grid');
    expect(localStorage.getItem('plan-maker:grid')).toBeNull();
    expect(getPreference('grid')).toBe(false);
  });

  it('reads a corrupted stored value as the default', () => {
    localStorage.setItem('plan-maker:measures', 'garbage');
    localStorage.setItem('plan-maker:theme', 'blue');
    reloadPreferences();
    expect(getPreference('measures')).toBe(true);
    expect(getPreference('theme')).toBe('system');
  });

  it('keeps preferences on distinct keys independent', () => {
    togglePreference('grid');
    reloadPreferences();
    expect(getPreference('grid')).toBe(true);
    expect(getPreference('measures')).toBe(true);
  });

  it('degrades silently when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    try {
      expect(() => togglePreference('measures')).not.toThrow();
      expect(getPreference('measures')).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  // Entering the Ruler tool reveals measures on every switch (ADR 0017); only
  // the first one is a change to persist.
  it('writes nothing when the value set is the one already held', () => {
    const setItem = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (...args: [string, string]) {
      writes++;
      setItem.apply(this, args);
    };
    try {
      setPreference('measures', false);
      setPreference('measures', false);
      expect(writes).toBe(1);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});

// Keys and sentinels are frozen: a rename silently resets every existing device.
describe('the table', () => {
  // The sentinel is the non-default value, so the two polarities store the
  // opposite words.
  it.each([
    ['grid', 'plan-maker:grid', 'shown', false],
    ['measures', 'plan-maker:measures', 'hidden', true],
  ] as const)('keeps %s on %s / %s', (name, key, sentinel, fallback) => {
    togglePreference(name);
    expect(localStorage.getItem(key)).toBe(sentinel);
    expect(getPreference(name)).toBe(!fallback);
    togglePreference(name);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps the theme on plan-maker:theme, storing only an explicit choice', () => {
    setPreference('theme', 'dark');
    expect(localStorage.getItem('plan-maker:theme')).toBe('dark');
    setPreference('theme', 'system');
    expect(localStorage.getItem('plan-maker:theme')).toBeNull();
  });
});

describe('reloading', () => {
  it('re-reads every preference from storage, as a fresh load does', () => {
    togglePreference('grid');
    togglePreference('measures');
    setPreference('theme', 'light');
    usePreferences.setState({ grid: false, measures: true, theme: 'system' });
    reloadPreferences();
    expect(getPreference('grid')).toBe(true);
    expect(getPreference('measures')).toBe(false);
    expect(getPreference('theme')).toBe('light');
  });
});

// ADR 0008: editor and export may never disagree. Session, not storage —
// storage fails silently when unavailable.
describe('the non-React reader', () => {
  it('follows the session, not storage', () => {
    togglePreference('measures');
    expect(getPreference('measures')).toBe(false);
  });

  it('still reports the session value when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    try {
      togglePreference('measures');
      expect(getPreference('measures')).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
