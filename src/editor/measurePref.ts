// Measure (see CONTEXT.md): a number the plan states about itself — wall
// dimensions and room areas. Shown by default; hiding them is a per-device
// preference, like the Grid.
//
// Storage only. The session value the editor draws with and the export prints
// with lives in `preferences.ts`, which is also where the reason it cannot live
// here is written down (ADR 0008).
import { booleanPreference } from './preference'

const pref = booleanPreference('plan-maker:measures', 'hidden')

export const loadMeasuresVisible = pref.load
export const saveMeasuresVisible = pref.save
