// A boolean per-device UI preference kept in localStorage — the shape shared
// by the Grid, Snap and Measure toggles (CONTEXT.md). Two rules, held here
// once instead of restated at each call site:
//
//   - the default stores nothing, so a device that never touched the toggle
//     keeps following the default rather than freezing today's value;
//   - an unavailable storage (private mode…) degrades silently — the choice
//     just won't survive a reload.
//
// The Theme sits out: it is tri-state and mirrored by the anti-flash inline
// script in index.html.
export function booleanPreference(
  key: string,
  offSentinel: string,
): { load: () => boolean; save: (on: boolean) => void } {
  return {
    load() {
      try {
        return localStorage.getItem(key) !== offSentinel
      } catch {
        return true
      }
    },
    save(on) {
      try {
        if (on) localStorage.removeItem(key)
        else localStorage.setItem(key, offSentinel)
      } catch {
        // storage unavailable — the choice just won't survive a reload
      }
    },
  }
}
