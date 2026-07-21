// CONTEXT.md: Snap. ADR 0007. Per-device, not per-plan.
import { booleanPreference } from './preference'

const pref = booleanPreference('plan-maker:snap', 'off')

export const loadSnapEnabled = pref.load
export const saveSnapEnabled = pref.save
