// Domain model per spec §2 — shared-point planar graph, integer centimeters.
import { nanoid } from 'nanoid';

export type Cm = number;

export interface Point {
  id: string;
  x: Cm;
  y: Cm;
}

// `t` is a ratio of the wall's length, not cm: the label holds its relative
// position when the wall stretches (ADR 0001). Absent = midpoint, upper side.
interface DimPlacement {
  t: number;
  side: 1 | -1;
}

export interface Wall {
  id: string;
  startPointId: string;
  endPointId: string;
  thickness: Cm;
  dimPlacement?: DimPlacement;
}

interface BaseOpening {
  id: string;
  wallId: string;
  // from the wall's start point to the opening's center, not its edge
  offset: Cm;
  width: Cm;
}

export interface Door extends BaseOpening {
  type: 'door';
  hingeSide: 'start' | 'end';
  swing: 'in' | 'out';
}

interface Window extends BaseOpening {
  type: 'window';
}

export type Opening = Door | Window;

// CONTEXT.md: Room label. `placed` absent = renders at the live centroid,
// (x, y) is only the association anchor; `placed: true` = (x, y) renders.
export interface RoomLabel {
  id: string;
  name: string;
  x: Cm;
  y: Cm;
  placed?: true;
}

// A hand-placed measurement (CONTEXT.md: Ruler). Free coordinates, not shared
// Points; `t` slides the value along A→B (ratio [0,1], default 0.5).
export interface Ruler {
  id: string;
  a: { x: Cm; y: Cm };
  b: { x: Cm; y: Cm };
  t: number;
}

// A preset name, not a cm value: the sheet size is resolved at render,
// keeping the model semantic and the S/M/L presets tunable.
export type TextSize = 'S' | 'M' | 'L';

// Free-text annotation (CONTEXT.md: Text). Always-visible content with free
// coordinates (not shared Points); `(x, y)` is the top-left anchor.
export interface TextNote {
  id: string;
  x: Cm;
  y: Cm;
  content: string;
  size: TextSize;
}

export interface Plan {
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  roomLabels: Record<string, RoomLabel>;
  rulers: Record<string, Ruler>;
  texts: Record<string, TextNote>;
}

/** A reading of the Plan alone, computed once per Plan (ADR 0029). Keyed on
 *  identity, and what comes back is shared: no reader writes to it. */
export function oncePerPlan<T>(read: (plan: Plan) => T): (plan: Plan) => T {
  const readings = new WeakMap<Plan, T>();
  return (plan) => {
    // `has`, not a falsy check: a reading may legitimately be null or 0.
    if (!readings.has(plan)) readings.set(plan, read(plan));
    return readings.get(plan)!;
  };
}

export const newId = () => nanoid(10);

export const WALL_THICKNESS: Cm = 10;
export const WALL_THICKNESS_MAX: Cm = 100;
export const GRID: Cm = 10;
export const DOOR_WIDTH: Cm = 90;
export const WINDOW_WIDTH: Cm = 120;

export const defaultOpeningWidth = (type: Opening['type']): Cm =>
  type === 'door' ? DOOR_WIDTH : WINDOW_WIDTH;

export function emptyPlan(): Plan {
  return { points: {}, walls: {}, openings: {}, roomLabels: {}, rulers: {}, texts: {} };
}

export function isPlanEmpty(plan: Plan): boolean {
  return (
    Object.keys(plan.points).length === 0 &&
    Object.keys(plan.walls).length === 0 &&
    Object.keys(plan.openings).length === 0 &&
    Object.keys(plan.roomLabels).length === 0 &&
    Object.keys(plan.rulers).length === 0 &&
    Object.keys(plan.texts).length === 0
  );
}
