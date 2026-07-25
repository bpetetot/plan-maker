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
  it('starts every preference at its default when nothing is stored', () => {
    expect(usePreferences.getState()).toEqual({
      grid: true,
      measures: true,
      snap: true,
      theme: 'system',
    });
  });

  it('stores nothing for the default, so an untouched device follows it', () => {
    togglePreference('snap');
    togglePreference('snap');
    expect(localStorage.getItem('plan-maker:snap')).toBeNull();
    expect(getPreference('snap')).toBe(true);
  });

  it('reads a corrupted stored value as the default', () => {
    localStorage.setItem('plan-maker:grid', 'garbage');
    localStorage.setItem('plan-maker:theme', 'blue');
    reloadPreferences();
    expect(getPreference('grid')).toBe(true);
    expect(getPreference('theme')).toBe('system');
  });

  it('keeps preferences on distinct keys independent', () => {
    togglePreference('grid');
    reloadPreferences();
    expect(getPreference('grid')).toBe(false);
    expect(getPreference('measures')).toBe(true);
    expect(getPreference('snap')).toBe(true);
  });

  it('degrades silently when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    try {
      expect(() => togglePreference('grid')).not.toThrow();
      expect(getPreference('grid')).toBe(false);
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
  it.each([
    ['grid', 'plan-maker:grid', 'hidden'],
    ['measures', 'plan-maker:measures', 'hidden'],
    ['snap', 'plan-maker:snap', 'off'],
  ] as const)('keeps %s on %s / %s', (name, key, sentinel) => {
    togglePreference(name);
    expect(localStorage.getItem(key)).toBe(sentinel);
    expect(getPreference(name)).toBe(false);
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
    togglePreference('snap');
    setPreference('theme', 'light');
    usePreferences.setState({ grid: true, snap: true, theme: 'system' });
    reloadPreferences();
    expect(getPreference('grid')).toBe(false);
    expect(getPreference('snap')).toBe(false);
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
