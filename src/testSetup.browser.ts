// The stylesheet is load-bearing: without it the absolute overlays fall back
// into the flow, and Vitest locators check actionability against that layout.
import { afterEach } from 'vitest';
import { reloadPreferences } from './preferences/preferences';
import { blur } from './editor/testKit';
import './styles.css';

// Per-device preferences share one localStorage and one singleton store across
// every file in the browser worker: a test that toggles Snap off (or Measures)
// otherwise leaks it into the next file, whose grid-snapping assertions then
// silently fail. Clear storage, then re-seed the store from those defaults.
afterEach(() => {
  // The held-key tracker is a singleton outliving the tree: a mid-hold test
  // leaks Alt into the next.
  blur(window);
  localStorage.clear();
  reloadPreferences();
});
