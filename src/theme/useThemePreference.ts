import { useCallback, useEffect, useState } from 'react';
import type { ThemePreference } from './theme';
import {
  applyResolvedTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  toggledTheme,
} from './theme';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void, () => void] {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadThemePreference);

  useEffect(() => {
    applyResolvedTheme(resolveTheme(preference, darkQuery().matches));
    if (preference !== 'system') return;
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => applyResolvedTheme(e.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    saveThemePreference(next);
    setPreferenceState(next);
  }, []);

  // setPreference, not a state updater: the save inside an updater would run
  // twice under StrictMode.
  const toggle = useCallback(
    () => setPreference(toggledTheme(preference, darkQuery().matches)),
    [preference, setPreference],
  );

  return [preference, setPreference, toggle];
}
