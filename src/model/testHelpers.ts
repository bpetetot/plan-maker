import type { Opening, Plan, Point, RoomLabel, Wall } from './types'
import { defaultOpeningWidth, emptyPlan, WALL_THICKNESS } from './types'

interface PlanBuilder {
  point: (x: number, y: number) => Point
  wall: (a: Point, b: Point) => Wall
  opening: (wall: Wall, type: Opening['type'], offset: number, width?: number) => Opening
  label: (name: string, x: number, y: number) => RoomLabel
}

let counter = 0

// Deterministic plan construction for tests, without going through snapping.
export function buildPlan(build: (b: PlanBuilder) => void): Plan {
  const plan = emptyPlan()
  const builder: PlanBuilder = {
    point(x, y) {
      const p = { id: `p${++counter}`, x, y }
      plan.points[p.id] = p
      return p
    },
    wall(a, b) {
      const id = `w${++counter}`
      const wall: Wall = { id, startPointId: a.id, endPointId: b.id, thickness: WALL_THICKNESS }
      plan.walls[id] = wall
      return wall
    },
    opening(wall, type, offset, width = defaultOpeningWidth(type)) {
      const id = `o${++counter}`
      const opening: Opening =
        type === 'door'
          ? { id, wallId: wall.id, type, offset, width, hingeSide: 'start', swing: 'in' }
          : { id, wallId: wall.id, type, offset, width }
      plan.openings[id] = opening
      return opening
    },
    label(name, x, y) {
      const id = `l${++counter}`
      const label: RoomLabel = { id, name, x, y }
      plan.roomLabels[id] = label
      return label
    },
  }
  build(builder)
  return plan
}
