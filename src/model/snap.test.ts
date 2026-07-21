import { describe, expect, it } from 'vitest'
import { realignDelta, snapPoint } from './snap'
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

  it('locks to 45° axes from the anchor, stepping the components to the grid', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 5, anchor: { x: 0, y: 0 } })
    expect(s.kind).toBe('axis')
    expect(s.y).toBe(0)
    expect(s.x % 10).toBe(0)
    expect(s.axisFrom).toEqual({ x: 0, y: 0 })
  })

  it('lands a diagonal on a grid intersection from an on-grid anchor', () => {
    const s = snapPoint(plan, 137, 131, { tolerance: 5, anchor: { x: 0, y: 0 } })
    expect(s).toMatchObject({ x: 130, y: 130, kind: 'axis' })
  })

  it('lands a diagonal on a grid line crossing from an off-grid anchor', () => {
    const anchor = { x: 3, y: 7 }
    const s = snapPoint(plan, anchor.x + 137, anchor.y + 131, { tolerance: 5, anchor })
    // crossing families interleave (t ≡ 7 aligns x, t ≡ 3 aligns y); nearest
    // wins — t = 133, aligning y
    expect(s).toMatchObject({ x: 136, y: 140, kind: 'axis' })
    expect(s.x - anchor.x).toBe(s.y - anchor.y)
  })

  it('lands on a real intersection when the anchor offsets are equal', () => {
    const anchor = { x: 3, y: 3 }
    const s = snapPoint(plan, anchor.x + 137, anchor.y + 131, { tolerance: 5, anchor })
    expect(s).toMatchObject({ x: 140, y: 140, kind: 'axis' })
  })

  it('aligns the moving component to the absolute grid on an orthogonal lock', () => {
    const anchor = { x: 3, y: 7 }
    const s = snapPoint(plan, anchor.x + 204, anchor.y + 6, { tolerance: 5, anchor })
    expect(s).toMatchObject({ x: 210, y: 7, kind: 'axis' })
  })

  it('crosses the same lines along negative axes', () => {
    const anchor = { x: 503, y: 507 }
    const diagonal = snapPoint(plan, anchor.x - 137, anchor.y - 131, { tolerance: 5, anchor })
    expect(diagonal).toMatchObject({ x: 370, y: 374, kind: 'axis' })
    const orthogonal = snapPoint(plan, anchor.x - 4, anchor.y - 204, { tolerance: 5, anchor })
    expect(orthogonal).toMatchObject({ x: 503, y: 300, kind: 'axis' })
  })

  it('steps by whole grid multiples from an on-grid anchor, negative axes included', () => {
    const anchor = { x: 500, y: 500 }
    const diagonal = snapPoint(plan, anchor.x - 137, anchor.y - 131, { tolerance: 5, anchor })
    expect(diagonal).toMatchObject({ x: 370, y: 370, kind: 'axis' })
    const orthogonal = snapPoint(plan, anchor.x - 4, anchor.y - 204, { tolerance: 5, anchor })
    expect(orthogonal).toMatchObject({ x: 500, y: 300, kind: 'axis' })
  })

  it('takes the first crossing beyond the anchor, never the anchor itself', () => {
    const onGrid = snapPoint(plan, 5, 4, { tolerance: 5, anchor: { x: 0, y: 0 } })
    expect(onGrid).toMatchObject({ x: 10, y: 10, kind: 'axis' })
    const anchor = { x: 3, y: 7 }
    const offGrid = snapPoint(plan, anchor.x + 2, anchor.y + 2, { tolerance: 5, anchor })
    expect(offGrid).toMatchObject({ x: 6, y: 10, kind: 'axis' })
  })

  it('falls back to the 10 cm grid', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5 })
    expect(s).toMatchObject({ x: 200, y: 120, kind: 'grid' })
  })

  it('a free move (Alt) only rounds to integers', () => {
    const s = snapPoint(plan, 203.4, 117.8, { tolerance: 15, free: true })
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' })
  })

  it('a free move keeps the existing-point rung', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, free: true })
    expect(s).toMatchObject({ x: 0, y: 0, kind: 'point' })
    expect(s.pointId).toBeDefined()
  })

  it('a free move drops the 45° axis rung', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 5, anchor: { x: 0, y: 0 }, free: true })
    expect(s).toMatchObject({ x: 200, y: 6, kind: 'free' })
  })

  it('a free move drops the grid rung', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5, free: true })
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' })
  })
})

describe('realignDelta', () => {
  it('lands the reference point on a grid intersection', () => {
    // ref off-grid by (3, -4); the delta absorbs it
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, false)).toEqual({ dx: 147, dy: -66 })
  })

  it('realigns an off-grid reference even for a near-zero displacement', () => {
    expect(realignDelta({ x: 103, y: 96 }, 1, -1, false)).toEqual({ dx: -3, dy: 4 })
  })

  it('keeps an on-grid reference on the grid', () => {
    expect(realignDelta({ x: 100, y: 100 }, 147.2, -63.8, false)).toEqual({ dx: 150, dy: -60 })
  })

  it('a free move (Alt) only rounds to integer centimeters', () => {
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, true)).toEqual({ dx: 147, dy: -64 })
  })

  it('falls back to whole-centimeter rounding without a reference point', () => {
    expect(realignDelta(null, 147.2, -63.8, false)).toEqual({ dx: 147, dy: -64 })
  })
})

describe('snapPoint on wall bodies', () => {
  it('snaps to the nearest wall body when the walls option is set', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15, walls: true })
    expect(s).toMatchObject({ x: 200, y: 0, kind: 'wall' })
    expect(s.wallId).toBe(Object.keys(plan.walls)[0])
  })

  it('is not a snap target without the walls option', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15 })
    expect(s.kind).toBe('grid')
  })

  it('loses to a nearby existing point', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, walls: true })
    expect(s.kind).toBe('point')
  })

  it('beats the 45° axis from the anchor', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15, walls: true, anchor: { x: 0, y: 0 } })
    expect(s.kind).toBe('wall')
  })

  it('lands on the locked axis ∩ wall intersection, keeping the drawn wall straight', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(400, -200)
      const p2 = b.point(400, 200)
      b.wall(p1, p2)
    })
    // cursor drifts 6 cm off the horizontal while reaching the wall
    const s = snapPoint(target, 395, 6, { tolerance: 15, walls: true, anchor: { x: 0, y: 0 } })
    expect(s).toMatchObject({ x: 400, y: 0, kind: 'wall' })
    expect(s.wallId).toBe(Object.keys(target.walls)[0])
    expect(s.axisFrom).toEqual({ x: 0, y: 0 })
  })

  it('falls back to the cursor projection when the axis meets the wall beyond its ends', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(400, 20)
      const p2 = b.point(400, 200)
      b.wall(p1, p2)
    })
    // horizontal axis meets the wall at (400, 0), below its start at y = 20
    const s = snapPoint(target, 395, 40, { tolerance: 15, walls: true, anchor: { x: 0, y: 0 } })
    expect(s).toMatchObject({ x: 400, y: 40, kind: 'wall' })
    expect(s.axisFrom).toBeUndefined()
  })

  it('falls back to the cursor projection when the axis meets the wall at a grazing angle', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(0, 100)
      const p2 = b.point(1000, 276) // ~10° off horizontal
      b.wall(p1, p2)
    })
    // axis meets the near-parallel wall ~68 cm from the cursor — past 2× tolerance
    const s = snapPoint(target, 500, 195, { tolerance: 15, walls: true, anchor: { x: 0, y: 200 } })
    expect(s).toMatchObject({ x: 501, y: 188, kind: 'wall' })
    expect(s.axisFrom).toBeUndefined()
  })

  it('never uses an intersection behind the anchor (the axis is a ray, not a line)', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(0, -100)
      const p2 = b.point(0, 100)
      b.wall(p1, p2)
    })
    // anchor at x = 2, cursor at x = 14: the +x axis crosses the wall behind it
    const s = snapPoint(target, 14, 1, { tolerance: 15, walls: true, anchor: { x: 2, y: 0 } })
    expect(s).toMatchObject({ x: 0, y: 1, kind: 'wall' })
    expect(s.axisFrom).toBeUndefined()
  })

  it('stays a snap target under a free move (Alt)', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15, walls: true, free: true })
    expect(s).toMatchObject({ x: 200, y: 0, kind: 'wall' })
    expect(s.wallId).toBe(Object.keys(plan.walls)[0])
  })

  it('loses to a nearby existing point under a free move too', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, walls: true, free: true })
    expect(s.kind).toBe('point')
  })

  it('uses the plain projection under a free move — no axis ∩ wall refinement', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(400, -200)
      const p2 = b.point(400, 200)
      b.wall(p1, p2)
    })
    // same cursor as the axis ∩ wall case above; the 6 cm drift is kept
    const s = snapPoint(target, 395, 6, {
      tolerance: 15,
      walls: true,
      anchor: { x: 0, y: 0 },
      free: true,
    })
    expect(s).toMatchObject({ x: 400, y: 6, kind: 'wall' })
    expect(s.axisFrom).toBeUndefined()
  })

  it('rounds the projection on a diagonal wall to integer centimeters', () => {
    const diagonal = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(300, 300)
      b.wall(p1, p2)
    })
    const s = snapPoint(diagonal, 150, 160, { tolerance: 15, walls: true })
    expect(s).toMatchObject({ x: 155, y: 155, kind: 'wall' })
  })
})
