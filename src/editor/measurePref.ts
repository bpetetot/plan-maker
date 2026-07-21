// CONTEXT.md: Measure. Storage only — the session value lives in
// `preferences.ts`, not here (ADR 0008).
import { booleanPreference } from './preference';

const pref = booleanPreference('plan-maker:measures', 'hidden');

export const loadMeasuresVisible = pref.load;
export const saveMeasuresVisible = pref.save;
