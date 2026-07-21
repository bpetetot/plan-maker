import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyResolvedTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  toggledTheme,
} from './theme';

beforeEach(() => {
  localStorage.clear();
});

describe('resolveTheme', () => {
  it('follows the system when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system when the preference is explicit', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('toggledTheme', () => {
  it('flips an explicit preference', () => {
    expect(toggledTheme('light', false)).toBe('dark');
    expect(toggledTheme('dark', true)).toBe('light');
  });

  it('leaves system for the opposite of what the system resolves to', () => {
    expect(toggledTheme('system', true)).toBe('light');
    expect(toggledTheme('system', false)).toBe('dark');
  });

  it('always changes the resolved theme, whatever the starting point', () => {
    for (const preference of ['system', 'light', 'dark'] as const) {
      for (const systemDark of [true, false]) {
        const before = resolveTheme(preference, systemDark);
        const after = resolveTheme(toggledTheme(preference, systemDark), systemDark);
        expect(after).not.toBe(before);
      }
    }
  });
});

describe('theme preference persistence', () => {
  it('defaults to system when nothing is stored', () => {
    expect(loadThemePreference()).toBe('system');
  });

  it('round-trips a saved preference', () => {
    saveThemePreference('dark');
    expect(loadThemePreference()).toBe('dark');
  });

  it('falls back to system on a corrupted stored value', () => {
    localStorage.setItem('plan-maker:theme', 'blue');
    expect(loadThemePreference()).toBe('system');
  });
});

describe('applyResolvedTheme', () => {
  it('stamps the theme on the document root', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyResolvedTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps the PWA bar color in step with the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
    applyResolvedTheme('dark');
    expect(meta.getAttribute('content')).toBe('#1e1e1e');
    applyResolvedTheme('light');
    expect(meta.getAttribute('content')).toBe('#2563eb');
    meta.remove();
  });
});
