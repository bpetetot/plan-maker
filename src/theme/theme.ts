// CONTEXT.md: Theme — per-device preference, never part of the plan.

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

// Also read by the anti-flash inline script in index.html — keep in sync.
const STORAGE_KEY = 'plan-maker:theme'

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** Resolve then invert, not cycle the three values: one press in three would change nothing visible. */
export function toggledTheme(preference: ThemePreference, systemDark: boolean): ThemePreference {
  return resolveTheme(preference, systemDark) === 'dark' ? 'light' : 'dark'
}

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage throws in private mode: fall through to the default.
  }
  return 'system'
}

// Also set by the inline script in index.html — keep in sync.
const META_THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#2563eb',
  dark: '#1e1e1e',
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_THEME_COLOR[theme])
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // localStorage throws in private mode: the choice won't survive a reload.
  }
}
