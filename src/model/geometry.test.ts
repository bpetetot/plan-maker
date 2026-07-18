import { describe, expect, it } from 'vitest'
import {
  clampToPolygon,
  distance,
  planBBox,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectOnWall,
  segmentIntersection,
  wallLength,
  wallSide,
} from './geometry'
import { buildPlan } from './testHelpers'

describe('segmentIntersection', () => {
  it('returns the crossing point of two properly crossing segments', () => {
    const p = segmentIntersection({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: -50 }, { x: 100, y: 50 })
    expect(p).toEqual({ x: 100, y: 0 })
  })

  it('returns null for parallel and collinear segments', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 10 }, { x: 200, y: 10 }),
    ).toBeNull()
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }),
    ).toBeNull()
  })

  it('returns null when the segments only touch at an endpoint', () => {
    // shared endpoint
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }),
    ).toBeNull()
    // T-touch: one segment ends on the other's interior
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }),
    ).toBeNull()
  })
})

describe('distance and wall length', () => {
  it('computes point-to-point distance', () => {
    expect(distance(0, 0, 3, 4)).toBe(5)
  })

  it('computes wall centerline length from its points', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(300, 400)
      b.wall(a, c)
    })
    const wall = Object.values(plan.walls)[0]
    expect(wallLength(plan, wall)).toBe(500)
  })
})

describe('projectOnWall', () => {
  it('projects a point onto the wall axis, clamped to its extent', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(100, 0)
      b.wall(a, c)
    })
    const wall = Object.values(plan.walls)[0]
    expect(projectOnWall(plan, wall, 40, 25)).toEqual({ t: 40, d: 25 })
    expect(projectOnWall(plan, wall, -30, 0).t).toBe(0)
    expect(projectOnWall(plan, wall, 130, 0).t).toBe(100)
  })
})

describe('wallSide', () => {
  it('reports which side of the wall axis a point is on', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(100, 0)
      b.wall(a, c)
    })
    const wall = Object.values(plan.walls)[0]
    // SVG y grows downward: the left normal of a +x wall points to +y
    expect(wallSide(plan, wall, 50, 30)).toBe(1)
    expect(wallSide(plan, wall, 50, -30)).toBe(-1)
    expect(wallSide(plan, wall, 50, 0)).toBe(1)
  })
})

describe('polygonArea (shoelace)', () => {
  it('computes the area of a rectangle', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]
    expect(Math.abs(polygonArea(poly))).toBe(400 * 300)
  })

  it('is signed by winding order', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const cw = [...ccw].reverse()
    expect(polygonArea(ccw)).toBe(-polygonArea(cw))
  })
})

describe('polygonCentroid', () => {
  it('returns the area centroid of a rectangle', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]
    expect(polygonCentroid(poly)).toEqual({ x: 200, y: 150 })
  })
})

describe('pointInPolygon', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ]

  it('detects inside and outside points', () => {
    expect(pointInPolygon({ x: 200, y: 150 }, poly)).toBe(true)
    expect(pointInPolygon({ x: 500, y: 150 }, poly)).toBe(false)
    expect(pointInPolygon({ x: -10, y: -10 }, poly)).toBe(false)
  })
})

describe('planBBox', () => {
  it('returns the bounding box of all points', () => {
    const plan = buildPlan((b) => {
      b.point(-50, 20)
      b.point(350, 470)
    })
    expect(planBBox(plan)).toEqual({ x: -50, y: 20, width: 400, height: 450 })
  })

  it('returns null for an empty plan', () => {
    const plan = buildPlan(() => {})
    expect(planBBox(plan)).toBeNull()
  })
})

describe('clampToPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('returns an interior point unchanged', () => {
    expect(clampToPolygon({ x: 50, y: 50 }, square)).toEqual({ x: 50, y: 50 })
  })

  it('clamps an outside point to the nearest edge, nudged inside', () => {
    const p = clampToPolygon({ x: 150, y: 50 }, square)
    expect(p).toEqual({ x: 99, y: 50 })
    expect(pointInPolygon(p, square)).toBe(true)
  })

  it('clamps past a corner onto the vertex region, still inside', () => {
    const p = clampToPolygon({ x: 150, y: -50 }, square)
    expect(p.x).toBeLessThanOrEqual(100)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(pointInPolygon(p, square)).toBe(true)
  })
})
