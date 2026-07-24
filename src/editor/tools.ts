import type { Cm } from '../model/types';
import { DOOR_WIDTH, WALL_THICKNESS, WINDOW_WIDTH } from '../model/types';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'ruler';

// CONTEXT.md: Tool defaults. Session-only editor state, never part of the plan.
export interface ToolDefaults {
  wallThickness: Cm;
  doorWidth: Cm;
  windowWidth: Cm;
  doorHinge: 'start' | 'end';
  doorSwing: 'in' | 'out';
}

export const initialToolDefaults = (): ToolDefaults => ({
  wallThickness: WALL_THICKNESS,
  doorWidth: DOOR_WIDTH,
  windowWidth: WINDOW_WIDTH,
  doorHinge: 'start',
  doorSwing: 'in',
});
