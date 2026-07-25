import { useEffect } from 'react';
import { usePreferences } from '../preferences/preferences';
import { applyResolvedTheme, darkQuery, resolveTheme } from './theme';

/** Stamps the resolved theme on the document, and follows the system while the
 *  preference is `system`. Mounted once — the value itself lives in the store. */
export function useThemeEffect(): void {
  const preference = usePreferences((s) => s.theme);

  useEffect(() => {
    applyResolvedTheme(resolveTheme(preference, darkQuery().matches));
    if (preference !== 'system') return;
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => applyResolvedTheme(e.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);
}
