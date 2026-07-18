import { describe, expect, it } from 'vitest'
import { faceLength, faceSpan, wallOutline } from './faces'
import { buildPlan, squareRoomPlan } from './testHelpers'

describe('faceLength', () => {
  it('measures a free-standing wall at its axis length on both sides', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(faceLength(plan, wall, 1)).toBe(400)
    expect(faceLength(plan, wall, -1)).toBe(400)
  })

  it('measures 3,90 m inside and 4,10 m outside a 4,00 m square-room wall', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    // interior of the room is below the bottom wall in screen coords: side +1
    expect(faceLength(plan, bottom, 1)).toBe(390)
    expect(faceLength(plan, bottom, -1)).toBe(410)
  })

  it('shortens both faces of a wall butting into a crossing wall (T-junction)', () => {
    // horizontal wall split at (200,0) by planar insertion, stub going down
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
    // both stub faces stop at the crossing wall's near face: 300 - 5
    expect(faceLength(plan, stub, 1)).toBe(295)
    expect(faceLength(plan, stub, -1)).toBe(295)
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
    // side -1 (above, y<0): nothing joins there — the face crosses the T
    expect(faceLength(plan, left, -1)).toBe(200)
    // side +1 (below): the stub's face cuts it back by half the stub thickness
    expect(faceLength(plan, left, 1)).toBe(195)
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

  it('caps a free-standing wall square at its Points', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(wallOutline(plan, wall)).toEqual([
      { x: 0, y: 5 },
      { x: 400, y: 5 },
      { x: 400, y: -5 },
      { x: 0, y: -5 },
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
})
