import { describe, expect, it } from 'vitest'
import { snapPoint } from './snap'
import { buildPlan } from './testHelpers'

const plan = buildPlan((b) => {
  const p1 = b.point(0, 0)
  const p2 = b.point(400, 0)
  b.wall(p1, p2)
})

describe('snapPoint', () => {
  it('snaps to a nearby existing point first', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15 })
    expect(s.kind).toBe('point')
    expect(s).toMatchObject({ x: 0, y: 0 })
    expect(s.pointId).toBeDefined()
  })

  it('skips excluded points', () => {
    const excluded = Object.keys(plan.points)[0]
    const s = snapPoint(plan, 8, 5, { tolerance: 15, exclude: new Set([excluded]) })
    expect(s.kind).not.toBe('point')
  })

  it('locks to 45° axes from the anchor, stepping length to the grid', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 5, anchor: { x: 0, y: 0 } })
    expect(s.kind).toBe('axis')
    expect(s.y).toBe(0)
    expect(s.x % 10).toBe(0)
    expect(s.axisFrom).toEqual({ x: 0, y: 0 })
  })

  it('falls back to the 10 cm grid', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5 })
    expect(s).toMatchObject({ x: 200, y: 120, kind: 'grid' })
  })

  it('free mode (Alt) only rounds to integers', () => {
    const s = snapPoint(plan, 203.4, 117.8, { tolerance: 15, free: true })
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' })
  })
})
