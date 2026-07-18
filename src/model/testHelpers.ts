import type { Plan, Point } from './types'
import { emptyPlan, WALL_THICKNESS } from './types'

interface PlanBuilder {
  point: (x: number, y: number) => Point
  wall: (a: Point, b: Point) => void
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
      plan.walls[id] = { id, startPointId: a.id, endPointId: b.id, thickness: WALL_THICKNESS }
    },
  }
  build(builder)
  return plan
}
