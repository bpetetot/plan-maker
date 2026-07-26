// The stylesheet is load-bearing: without it the absolute overlays fall back
// into the flow, and Vitest locators check actionability against that layout.
import { afterEach } from 'vitest';
import { reloadPreferences } from '../src/preferences/preferences';
import { blur } from './kit';
import '../src/styles.css';

// Per-device preferences share one localStorage and one singleton store across
// every file in the browser worker: a test that shows the Grid (or hides
// Measures) otherwise leaks it into the next file, whose free-placement
// assertions then silently fail. Clear storage, then re-seed from the defaults.
afterEach(() => {
  // The held-key tracker is a singleton outliving the tree: a mid-hold test
  // leaks Space into the next.
  blur(window);
  localStorage.clear();
  reloadPreferences();
});
