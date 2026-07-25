// CONTEXT.md: Theme — per-device preference, never part of the plan. Its value
// is an entry in the preference table (ADR 0026); what it looks like is here.
import { getPreference, setPreference } from '../preferences/preferences';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** Resolve then invert, not cycle the three values: one press in three would change nothing visible. */
export function toggledTheme(preference: ThemePreference, systemDark: boolean): ThemePreference {
  return resolveTheme(preference, systemDark) === 'dark' ? 'light' : 'dark';
}

export function toggleTheme(): void {
  setPreference('theme', toggledTheme(getPreference('theme'), darkQuery().matches));
}

// Also set by the inline script in index.html — keep in sync.
const META_THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#2563eb',
  dark: '#1e1e1e',
};

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_THEME_COLOR[theme]);
}
