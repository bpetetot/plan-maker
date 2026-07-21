/** Boolean per-device UI preference (CONTEXT.md). The default stores nothing,
 *  rather than today's value: a device follows the default if it ever changes. */
export function booleanPreference(
  key: string,
  offSentinel: string,
): { load: () => boolean; save: (on: boolean) => void } {
  return {
    load() {
      try {
        return localStorage.getItem(key) !== offSentinel;
      } catch {
        return true;
      }
    },
    save(on) {
      try {
        if (on) localStorage.removeItem(key);
        else localStorage.setItem(key, offSentinel);
      } catch {
        // localStorage can throw (private mode, quota) — degrade silently
      }
    },
  };
}
