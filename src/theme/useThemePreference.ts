import { useCallback, useEffect, useState } from 'react'
import type { ThemePreference } from './theme'
import { applyResolvedTheme, loadThemePreference, resolveTheme, saveThemePreference } from './theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

// The theme preference, applied to the document as it changes. While the
// preference is 'system', OS theme changes are tracked live.
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
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

  return [preference, setPreference]
}
