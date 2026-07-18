// Domain model per spec §2 — shared-vertex planar graph, integer centimeters.

export type Cm = number // integer centimeters

export interface Point {
  id: string
  x: Cm
  y: Cm
}

export interface Wall {
  id: string
  startPointId: string
  endPointId: string
  thickness: Cm // default 10
}

export interface BaseOpening {
  id: string
  wallId: string
  // absolute distance in cm from the wall's start point to the opening's center
  offset: Cm
  width: Cm
}

export interface Door extends BaseOpening {
  type: 'door'
  hingeSide: 'start' | 'end'
  swing: 'in' | 'out'
}

export interface Window extends BaseOpening {
  type: 'window'
}

export type Opening = Door | Window

export interface RoomLabel {
  id: string
  name: string
  x: Cm
  y: Cm
}

export interface Plan {
  points: Record<string, Point>
  walls: Record<string, Wall>
  openings: Record<string, Opening>
  roomLabels: Record<string, RoomLabel>
}

export const WALL_THICKNESS: Cm = 10
export const GRID: Cm = 10
export const DOOR_WIDTH: Cm = 90
export const WINDOW_WIDTH: Cm = 120
export const OPENING_WIDTHS: Cm[] = [60, 70, 80, 90, 100, 120, 140, 160]

export function emptyPlan(): Plan {
  return { points: {}, walls: {}, openings: {}, roomLabels: {} }
}
