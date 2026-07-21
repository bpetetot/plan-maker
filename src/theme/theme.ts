// Theme (see CONTEXT.md): the editor's light or dark appearance. A per-device
// preference — never part of the plan, never exported.

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

// Also read by the anti-flash inline script in index.html — keep in sync.
const STORAGE_KEY = 'plan-maker:theme'

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/**
 * The preference that flips what is currently on screen.
 *
 * Resolving before inverting is what makes the shortcut honest: the preference
 * has three values but only two appearances, so cycling through all three would
 * spend one press in three changing nothing visible (from 'dark' to 'system' on
 * a dark system). Toggling the *resolved* theme always shows a change. It costs
 * 'system' its keyboard access — that is a set-once choice, and the menu keeps it.
 */
export function toggledTheme(preference: ThemePreference, systemDark: boolean): ThemePreference {
  return resolveTheme(preference, systemDark) === 'dark' ? 'light' : 'dark'
}

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // storage unavailable (private mode…) — fall through to the default
  }
  return 'system'
}

// Browser-bar colors per theme: accent blue in light (the historic value),
// sheet surface in dark. Also set by the inline script in index.html — keep in sync.
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
    // storage unavailable — the choice just won't survive a reload
  }
}
