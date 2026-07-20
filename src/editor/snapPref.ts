// Snap is on by default and can be turned off for the whole editor (see
// CONTEXT.md: Snap, and ADR 0007). A per-device preference.
import { booleanPreference } from './preference'

const pref = booleanPreference('plan-maker:snap', 'off')

export const loadSnapEnabled = pref.load
export const saveSnapEnabled = pref.save
