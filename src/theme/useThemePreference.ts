import { useCallback, useEffect, useState } from 'react'
import type { ThemePreference } from './theme'
import {
  applyResolvedTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  toggledTheme,
} from './theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

// The theme preference, applied to the document as it changes. While the
// preference is 'system', OS theme changes are tracked live.
//
// `toggle` is the keyboard's way in. It reads the system query here rather than
// at the call site so that "the opposite of what is on screen" stays one
// notion, decided where the query already lives.
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void, () => void] {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadThemePreference)

  useEffect(() => {
    applyResolvedTheme(resolveTheme(preference, darkQuery().matches))
    if (preference !== 'system') return
    const query = darkQuery()
    const onChange = (e: MediaQueryListEvent) => applyResolvedTheme(e.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    saveThemePreference(next)
    setPreferenceState(next)
  }, [])

  // Goes through setPreference rather than a state updater: the save is a side
  // effect, and a side effect inside an updater runs twice under StrictMode.
  // Depending on `preference` is what keeps it honest instead.
  const toggle = useCallback(
    () => setPreference(toggledTheme(preference, darkQuery().matches)),
    [preference, setPreference],
  )

  return [preference, setPreference, toggle]
}
