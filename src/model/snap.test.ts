import { describe, expect, it } from 'vitest'
import { snapDelta, snapPoint } from './snap'
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

  it('carries the anchor offset on a diagonal from an off-grid anchor', () => {
    const anchor = { x: 3, y: 7 }
    const s = snapPoint(plan, anchor.x + 137, anchor.y + 131, { tolerance: 5, anchor })
    expect(s).toMatchObject({ x: 133, y: 137, kind: 'axis' })
    expect(s.x - anchor.x).toBe(s.y - anchor.y)
  })

  it('steps only the moving component on an orthogonal lock', () => {
    const anchor = { x: 3, y: 7 }
    const s = snapPoint(plan, anchor.x + 204, anchor.y + 6, { tolerance: 5, anchor })
    expect(s).toMatchObject({ x: 203, y: 7, kind: 'axis' })
  })

  it('steps the same way along negative axes', () => {
    const anchor = { x: 500, y: 500 }
    const diagonal = snapPoint(plan, anchor.x - 137, anchor.y - 131, { tolerance: 5, anchor })
    expect(diagonal).toMatchObject({ x: 370, y: 370, kind: 'axis' })
    const orthogonal = snapPoint(plan, anchor.x - 4, anchor.y - 204, { tolerance: 5, anchor })
    expect(orthogonal).toMatchObject({ x: 500, y: 300, kind: 'axis' })
  })

  it('keeps a minimum of one grid step on each component', () => {
    const s = snapPoint(plan, 5, 4, { tolerance: 5, anchor: { x: 0, y: 0 } })
    expect(s).toMatchObject({ x: 10, y: 10, kind: 'axis' })
  })

  it('falls back to the 10 cm grid', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5 })
    expect(s).toMatchObject({ x: 200, y: 120, kind: 'grid' })
  })

  it('a free move (Alt) only rounds to integers', () => {
    const s = snapPoint(plan, 203.4, 117.8, { tolerance: 15, free: true })
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' })
  })
})

describe('snapDelta', () => {
  it('steps the displacement to the 10 cm grid by default', () => {
    expect(snapDelta(147.2, -63.8)).toEqual({ dx: 150, dy: -60 })
  })

  it('a free move (Alt) only rounds to integer centimeters', () => {
    expect(snapDelta(147.2, -63.8, true)).toEqual({ dx: 147, dy: -64 })
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
    // cursor drifts 6 cm off the horizontal while reaching the wall: the snap
    // corrects to the axis ∩ wall point, not the cursor's raw projection
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
    // the horizontal axis from the anchor meets the wall at (400, 0), below
    // the wall's start — no junction possible there
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
    // horizontal axis from the anchor meets the near-parallel wall ~68 cm away
    // from the cursor — far beyond 2× tolerance, not what the eye is aiming at
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
    // anchor sits just in front of the wall, cursor points away from it: the
    // locked +x axis crosses the wall behind the anchor — not a valid target
    const s = snapPoint(target, 14, 1, { tolerance: 15, walls: true, anchor: { x: 2, y: 0 } })
    expect(s).toMatchObject({ x: 0, y: 1, kind: 'wall' })
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
