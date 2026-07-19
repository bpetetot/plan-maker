import type { Cm } from '../model/types'
import { DOOR_WIDTH, WALL_THICKNESS, WINDOW_WIDTH } from '../model/types'

export type Tool = 'select' | 'wall' | 'door' | 'window'

// Tool defaults (CONTEXT.md): the per-tool parameters every newly placed
// element inherits. Pure per-session editor state — never part of the plan,
// reset to the built-in values on load.
export interface ToolDefaults {
  wallThickness: Cm
  doorWidth: Cm
  windowWidth: Cm
  doorHinge: 'start' | 'end'
  doorSwing: 'in' | 'out'
}

export const initialToolDefaults = (): ToolDefaults => ({
  wallThickness: WALL_THICKNESS,
  doorWidth: DOOR_WIDTH,
  windowWidth: WINDOW_WIDTH,
  doorHinge: 'start',
  doorSwing: 'in',
})
