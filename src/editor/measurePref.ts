// Measure (see CONTEXT.md): a number the plan states about itself — wall
// dimensions and room areas. Shown by default; hiding them is a per-device
// preference, like the Grid.
//
// The Grid and Snap preferences have a single reader, the editor's own state,
// so storage is free to be their only memory. This one has two readers: the
// editor draws with it and the export prints with it (ADR 0008). Storage
// cannot arbitrate between them — it does nothing, silently, when unavailable
// (private mode), which would leave the export printing the very measures the
// screen is hiding. So the session holds the value and storage only makes it
// outlive a reload.
import { booleanPreference } from './preference'

const pref = booleanPreference('plan-maker:measures', 'hidden')

let visible = pref.load()

export const loadMeasuresVisible = (): boolean => visible

export function saveMeasuresVisible(next: boolean): void {
  visible = next
  pref.save(next)
}
