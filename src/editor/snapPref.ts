// Snap is on by default and can be turned off for the whole editor (see
// CONTEXT.md: Snap, and ADR 0007). Same storage discipline as the grid and
// theme preferences: the default stores nothing, and an unavailable storage
// (private mode…) degrades silently.
const STORAGE_KEY = 'plan-maker:snap'

export function loadSnapEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSnapEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, 'off')
  } catch {
    // storage unavailable — the choice just won't survive a reload
  }
}
