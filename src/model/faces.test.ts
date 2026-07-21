import { describe, expect, it } from 'vitest'
import { faceLength, faceSpan, fullThicknessSpan, junctionPatches, wallOutline } from './faces'
import { buildPlan, squareRoomPlan } from './testHelpers'

describe('faceLength', () => {
  it('measures a free-standing wall at its hors-tout extent on both sides', () => {
    // 410 = 400 axis + half a thickness overhanging each free end
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(faceLength(plan, wall, 1)).toBe(410)
    expect(faceLength(plan, wall, -1)).toBe(410)
  })

  it('measures 3,90 m inside and 4,10 m outside a 4,00 m square-room wall', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    // interior of the room is below the bottom wall in screen coords: side +1
    expect(faceLength(plan, bottom, 1)).toBe(390)
    expect(faceLength(plan, bottom, -1)).toBe(410)
  })

  it('shortens both faces of a wall butting into a crossing wall (T-junction)', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const p = b.point(200, 0)
      const c = b.point(400, 0)
      const tip = b.point(200, 300)
      b.wall(a, p)
      b.wall(p, c)
      b.wall(p, tip)
    })
    const stub = Object.values(plan.walls)[2]
    // 300 = tip overhang (+5) minus stop at the crossing wall's near face (-5)
    expect(faceLength(plan, stub, 1)).toBe(300)
    expect(faceLength(plan, stub, -1)).toBe(300)
  })

  it('lets faces run straight through a collinear split point', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const p = b.point(200, 0)
      const c = b.point(400, 0)
      const tip = b.point(200, 300)
      b.wall(a, p)
      b.wall(p, c)
      b.wall(p, tip)
    })
    const left = Object.values(plan.walls)[0]
    // 205 = 200 + free-end overhang; above the split nothing joins, the face
    // stops at the Point (collinear fallback)
    expect(faceLength(plan, left, -1)).toBe(205)
    // side +1: the stub's face cuts it back by half the stub thickness
    expect(faceLength(plan, left, 1)).toBe(200)
  })
})

describe('wallOutline', () => {
  it('degrades to the Point for a zero-length wall instead of throwing', () => {
    // a wall can collapse mid-drag when its endpoint is dropped on the other
    const plan = buildPlan((b) => {
      b.wall(b.point(100, 100), b.point(100, 100))
    })
    const wall = Object.values(plan.walls)[0]
    expect(wallOutline(plan, wall)).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ])
    expect(faceLength(plan, wall, 1)).toBe(0)
  })

  it('caps a free-standing wall square, half a thickness past its Points', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(wallOutline(plan, wall)).toEqual([
      { x: -5, y: 5 },
      { x: 405, y: 5 },
      { x: 405, y: -5 },
      { x: -5, y: -5 },
    ])
  })
})

describe('faceSpan', () => {
  it('gives the axis parameters the face runs between', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    expect(faceSpan(plan, bottom, 1)).toEqual({ from: 5, to: 395 })
    expect(faceSpan(plan, bottom, -1)).toEqual({ from: -5, to: 405 })
  })

  it('overhangs both free ends of a standalone wall', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(faceSpan(plan, wall, 1)).toEqual({ from: -5, to: 405 })
  })
})

describe('fullThicknessSpan', () => {
  it('keeps the shorter of the two faces at each end', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    // interior 5→395, exterior -5→405: the interior corners win on both ends
    expect(fullThicknessSpan(plan, bottom)).toEqual({ from: 5, to: 395 })
  })

  it('reaches the overhang at a free end, where both faces stop together', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(fullThicknessSpan(plan, wall)).toEqual({ from: -5, to: 405 })
  })

  it('takes the exterior corner at a reflex corner, where it is the shorter one', () => {
    // L: corner (400,0) convex for the vertical's +1 side, reflex for -1
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 400)
      b.wall(a, c)
      b.wall(c, d)
    })
    const vertical = Object.values(plan.walls)[1]
    expect(faceSpan(plan, vertical, 1)).toEqual({ from: 5, to: 405 })
    expect(faceSpan(plan, vertical, -1)).toEqual({ from: -5, to: 405 })
    expect(fullThicknessSpan(plan, vertical)).toEqual({ from: 5, to: 405 })
  })
})

describe('junctionPatches', () => {
  it('returns nothing for a free-standing wall', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    expect(junctionPatches(plan)).toEqual([])
  })

  it('fills the central gap of a T-junction with all incident face corners', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const p = b.point(200, 0)
      const c = b.point(400, 0)
      const tip = b.point(200, 300)
      b.wall(a, p)
      b.wall(p, c)
      b.wall(p, tip)
    })
    const patches = junctionPatches(plan)
    expect(patches).toHaveLength(1)
    // 3 wall ends × 2 faces: stub faces x 195/205, crossing wall's far face y -5
    expect(patches[0].corners).toHaveLength(6)
    const keys = new Set(patches[0].corners.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`))
    expect(keys).toEqual(new Set(['195,5', '205,5', '200,-5']))
  })

  it('emits one patch per shared corner of a closed room', () => {
    expect(junctionPatches(squareRoomPlan())).toHaveLength(4)
  })
})
