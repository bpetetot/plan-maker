// CONTEXT.md: Preference — the per-device choices, in one table (ADR 0026).
// The session holds the value, not storage: a read-back would print measures
// the screen hides (ADR 0008).
import { create } from 'zustand';
import type { ThemePreference } from '../theme/theme';

interface Preferences {
  grid: boolean;
  measures: boolean;
  theme: ThemePreference;
  /** CONTEXT.md: Debug mode (ADR 0036). */
  debug: boolean;
}

type Name = keyof Preferences;
type Toggleable = { [K in Name]: Preferences[K] extends boolean ? K : never }[Name];

interface Entry<T> {
  key: string;
  fallback: T;
  decode: (raw: string | null) => T;
  encode: (value: T) => string;
}

// The sentinel is the non-default value, so `encode` never sees the fallback:
// `persist` removes the key for it instead.
const boolEntry = (key: string, sentinel: string, fallback = true): Entry<boolean> => ({
  key,
  fallback,
  decode: (raw) => (raw === sentinel ? !fallback : fallback),
  encode: () => sentinel,
});

// Keys and sentinels are frozen: a rename silently resets every existing device.
const TABLE: { [K in Name]: Entry<Preferences[K]> } = {
  grid: boolEntry('plan-maker:grid', 'shown', false),
  measures: boolEntry('plan-maker:measures', 'hidden'),
  theme: {
    // Also read by the anti-flash inline script in index.html — keep in sync.
    key: 'plan-maker:theme',
    fallback: 'system',
    decode: (raw) => (raw === 'light' || raw === 'dark' ? raw : 'system'),
    encode: (value) => value,
  },
  debug: boolEntry('plan-maker:debug', 'on', false),
};

function load<K extends Name>(name: K): Preferences[K] {
  const entry = TABLE[name];
  try {
    return entry.decode(localStorage.getItem(entry.key));
  } catch {
    return entry.fallback;
  }
}

// The default stores nothing, rather than today's value: a device follows the
// default if it ever changes.
function persist<K extends Name>(name: K, value: Preferences[K]): void {
  const entry = TABLE[name];
  try {
    if (value === entry.fallback) localStorage.removeItem(entry.key);
    else localStorage.setItem(entry.key, entry.encode(value));
  } catch {
    // localStorage can throw (private mode, quota) — degrade silently
  }
}

// Listed, not walked: walking the table loses the per-key type and needs a cast,
// where this way a preference missing from the list is a compile error.
const loadAll = (): Preferences => ({
  grid: load('grid'),
  measures: load('measures'),
  theme: load('theme'),
  debug: load('debug'),
});

export const usePreferences = create<Preferences>(loadAll);

/** A preference for a non-React reader — the PNG export, the theme toggle. */
export function getPreference<K extends Name>(name: K): Preferences[K] {
  return usePreferences.getState()[name];
}

/** A no-op when the value is already held, so it never re-saves: entering the
 *  Ruler tool reveals measures on every switch, not only the first (ADR 0017). */
export function setPreference<K extends Name>(name: K, value: Preferences[K]): void {
  if (getPreference(name) === value) return;
  usePreferences.setState({ [name]: value } as Pick<Preferences, K>);
  persist(name, value);
}

export function togglePreference(name: Toggleable): void {
  setPreference(name, !getPreference(name));
}

/** Re-read storage, as a fresh load does: the singleton otherwise reads once per page load. */
export function reloadPreferences(): void {
  usePreferences.setState(loadAll());
}
