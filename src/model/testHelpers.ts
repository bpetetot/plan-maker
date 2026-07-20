import type { Opening, Plan, Point, RoomLabel, Wall } from './types'
import { defaultOpeningWidth, emptyPlan, WALL_THICKNESS } from './types'

export interface PlanBuilder {
  point: (x: number, y: number) => Point
  wall: (a: Point, b: Point) => Wall
  opening: (wall: Wall, type: Opening['type'], offset: number, width?: number) => Opening
  label: (name: string, x: number, y: number, placed?: true) => RoomLabel
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
    label(name, x, y, placed) {
      const id = `l${++counter}`
      const label: RoomLabel = placed ? { id, name, x, y, placed } : { id, name, x, y }
      plan.roomLabels[id] = label
      return label
    },
  }
  build(builder)
  return plan
}

// A closed 4×4 m room drawn axis-to-axis, walls 10 cm thick — the recurring
// face-measure scenario: interior faces run 3,90 m, exterior faces 4,10 m.
export function squareRoomPlan(): Plan {
  return buildPlan((b) => {
    const p1 = b.point(0, 0)
    const p2 = b.point(400, 0)
    const p3 = b.point(400, 400)
    const p4 = b.point(0, 400)
    b.wall(p1, p2)
    b.wall(p2, p3)
    b.wall(p3, p4)
    b.wall(p4, p1)
  })
}

// A closed 4×3 m room carrying a name — the scenario that tells a Measure
// (the area) apart from the Room name beside it.
export function namedRoomPlan(name = 'Kitchen'): Plan {
  return buildPlan((b) => {
    const p1 = b.point(0, 0)
    const p2 = b.point(400, 0)
    const p3 = b.point(400, 300)
    const p4 = b.point(0, 300)
    b.wall(p1, p2)
    b.wall(p2, p3)
    b.wall(p3, p4)
    b.wall(p4, p1)
    b.label(name, 200, 150)
  })
}
