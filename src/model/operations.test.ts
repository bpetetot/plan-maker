import { describe, expect, it } from 'vitest'
import {
  addRoomLabel,
  addWall,
  clampOpeningOffset,
  commitPoint,
  commitWall,
  deleteOpening,
  deleteRoomLabel,
  deleteWall,
  ensurePoint,
  mergeCoincidentPoints,
  movePoint,
  moveRoomLabel,
  moveOpening,
  placeOpening,
  planarize,
  renameRoomLabel,
  setDimPlacement,
  setOpeningWidth,
  setPoints,
  setWallThickness,
  splitWall,
  toggleHingeSide,
  toggleSwing,
} from './operations'
import { openingRail } from './openings'
import { buildPlan, squareRoomPlan } from './testHelpers'
import { DOOR_WIDTH } from './types'

const rectPlan = () =>
  buildPlan((b) => {
    const p1 = b.point(0, 0)
    const p2 = b.point(400, 0)
    b.wall(p1, p2)
  })

describe('ensurePoint', () => {
  it('reuses an existing point when the snap carries a pointId', () => {
    const plan = rectPlan()
    const existingId = Object.keys(plan.points)[0]
    const [next, id] = ensurePoint(plan, { x: 0, y: 0, kind: 'point', pointId: existingId })
    expect(id).toBe(existingId)
    expect(next).toBe(plan)
  })

  it('creates a new rounded integer point otherwise', () => {
    const plan = rectPlan()
    const [next, id] = ensurePoint(plan, { x: 10.4, y: 19.6, kind: 'free' })
    expect(next.points[id]).toMatchObject({ x: 10, y: 20 })
  })
})

describe('splitWall', () => {
  it('splits a wall into two halves sharing the split point', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const mid = b.point(150, 0)
      b.wall(p1, p2)
      void mid
    })
    const [p1, p2, mid] = Object.keys(plan.points)
    const wallId = Object.keys(plan.walls)[0]
    const next = splitWall(plan, wallId, mid)
    expect(Object.keys(next.walls)).toHaveLength(2)
    expect(next.walls[wallId]).toMatchObject({ startPointId: p1, endPointId: mid, thickness: 10 })
    const other = Object.values(next.walls).find((w) => w.id !== wallId)!
    expect(other).toMatchObject({ startPointId: mid, endPointId: p2, thickness: 10 })
  })

  it('is a no-op when the point is one of the wall ends', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const endId = plan.walls[wallId].endPointId
    expect(splitWall(plan, wallId, endId)).toBe(plan)
  })

  it('reassigns each opening to the half containing its center', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const mid = b.point(200, 0)
      const wall = b.wall(p1, p2)
      b.opening(wall, 'door', 60) // center on the start side
      b.opening(wall, 'window', 320) // center on the end side
      void mid
    })
    const mid = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const [doorId, windowId] = Object.keys(plan.openings)
    const next = splitWall(plan, wallId, mid)
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 60 })
    // end-side opening rebased on the new half: 320 − 200 = 120
    const endHalf = Object.values(next.walls).find((w) => w.id !== wallId)!
    expect(next.openings[windowId]).toMatchObject({ wallId: endHalf.id, offset: 120 })
  })

  it('deletes an opening straddling the cut', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const cut = b.point(210, 0)
      const wall = b.wall(p1, p2)
      b.opening(wall, 'door', 200) // interval 155..245 contains the cut
      void cut
    })
    const cut = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const next = splitWall(plan, wallId, cut)
    expect(Object.keys(next.openings)).toHaveLength(0)
  })

  it('keeps an opening the cut barely clears, however tight the half', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const cut = b.point(96, 0)
      const wall = b.wall(p1, p2)
      b.opening(wall, 'door', 50) // interval 5..95, one centimetre clear of the cut
      void cut
    })
    const cut = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const doorId = Object.keys(plan.openings)[0]
    // its rail on the 96 cm half runs -5..96, still wider than the door
    expect(splitWall(plan, wallId, cut).openings[doorId]).toMatchObject({ offset: 50 })
  })

  it('deletes an opening the cut would force to shift, instead of moving it', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const cut = b.point(100, 0)
      const wall = b.wall(p1, p2)
      // interval -15..75: clear of the cut, but hanging past the start half's
      // overhang at -5 — clamping would silently move it to 40
      b.opening(wall, 'door', 30)
      void cut
    })
    const cut = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const next = splitWall(plan, wallId, cut)
    expect(Object.keys(next.openings)).toHaveLength(0)
  })

  it('keeps an opening that exactly fits its half at its stored offset', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const cut = b.point(100, 0)
      const wall = b.wall(p1, p2)
      b.opening(wall, 'door', 50) // interval 5..95, inside the half's rail of -5..100
      void cut
    })
    const cut = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const doorId = Object.keys(plan.openings)[0]
    const next = splitWall(plan, wallId, cut)
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 50 })
  })

  it('drops the dimension placement on both halves', () => {
    let plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const mid = b.point(200, 0)
      b.wall(p1, p2)
      void mid
    })
    const mid = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    plan = setDimPlacement(plan, wallId, 0.3, -1)
    const next = splitWall(plan, wallId, mid)
    for (const wall of Object.values(next.walls)) expect(wall.dimPlacement).toBeUndefined()
  })
})

describe('commitPoint', () => {
  it('splits the host wall when the point lands on its body', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const [next, id] = commitPoint(plan, { x: 150, y: 0, kind: 'wall', wallId })
    expect(next.points[id]).toMatchObject({ x: 150, y: 0 })
    expect(Object.keys(next.walls)).toHaveLength(2)
    const touching = Object.values(next.walls).filter((w) => w.startPointId === id || w.endPointId === id)
    expect(touching).toHaveLength(2)
  })

  it('reuses a nearby existing point instead of splitting at a duplicate', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const endId = plan.walls[wallId].endPointId
    const [next, id] = commitPoint(plan, { x: 400, y: 0, kind: 'wall', wallId })
    expect(id).toBe(endId)
    expect(next.walls).toEqual(plan.walls)
  })

  it('reuses a coincident existing point on a grid snap instead of duplicating it', () => {
    const plan = rectPlan()
    const endId = plan.walls[Object.keys(plan.walls)[0]].endPointId // (400, 0)
    const [next, id] = commitPoint(plan, { x: 400, y: 0, kind: 'grid' })
    expect(id).toBe(endId)
    expect(next).toBe(plan)
  })

  it('reuses a coincident existing point on axis and free snaps too', () => {
    const plan = rectPlan()
    const endId = plan.walls[Object.keys(plan.walls)[0]].endPointId // (400, 0)
    expect(commitPoint(plan, { x: 400, y: 0, kind: 'axis', axisFrom: { x: 0, y: 0 } })[1]).toBe(endId)
    // 400.4/0.4: within the 1 cm junction tolerance of the existing point
    expect(commitPoint(plan, { x: 400.4, y: 0.4, kind: 'free' })[1]).toBe(endId)
  })

  it('still splits the host when reusing a point that is not one of its ends', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      // (200, 1): a hair off the wall's body
      const stray = b.point(200, 1)
      const top = b.point(200, 300)
      b.wall(p1, p2)
      b.wall(stray, top)
    })
    const strayId = Object.keys(plan.points)[2]
    const wallId = Object.keys(plan.walls)[0]
    const [next, id] = commitPoint(plan, { x: 200, y: 0, kind: 'wall', wallId })
    expect(id).toBe(strayId)
    expect(Object.keys(next.walls)).toHaveLength(3)
    const touching = Object.values(next.walls).filter((w) => w.startPointId === id || w.endPointId === id)
    expect(touching).toHaveLength(3)
  })
})

describe('commitWall', () => {
  it('splits the host wall when an end lands on its body (T junction)', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const [next, endId] = commitWall(
      plan,
      { x: 200, y: 300, kind: 'grid' },
      { x: 200, y: 0, kind: 'wall', wallId },
    )
    expect(Object.keys(next.walls)).toHaveLength(3)
    expect(Object.keys(next.points)).toHaveLength(4)
    const junction = next.points[endId]
    expect(junction).toMatchObject({ x: 200, y: 0 })
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === endId || w.endPointId === endId,
    )
    expect(touching).toHaveLength(3)
  })

  it('splits both walls at a crossing (X junction), including the new wall', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(200, -100)
      const p2 = b.point(200, 100)
      b.wall(p1, p2)
    })
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' })
    expect(Object.keys(next.walls)).toHaveLength(4)
    expect(Object.keys(next.points)).toHaveLength(5)
    const junction = Object.values(next.points).find((p) => p.x === 200 && p.y === 0)!
    expect(junction).toBeDefined()
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === junction.id || w.endPointId === junction.id,
    )
    expect(touching).toHaveLength(4)
  })

  it('gives every drawn segment the requested thickness, leaving crossed walls alone', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(200, -100)
      const p2 = b.point(200, 100)
      b.wall(p1, p2)
    })
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' }, 20)
    const drawn = Object.values(next.walls).filter(
      (w) => next.points[w.startPointId].y === 0 && next.points[w.endPointId].y === 0,
    )
    expect(drawn).toHaveLength(2)
    for (const w of drawn) expect(w.thickness).toBe(20)
    const crossed = Object.values(next.walls).filter((w) => !drawn.includes(w))
    expect(crossed).toHaveLength(2)
    for (const w of crossed) expect(w.thickness).toBe(10)
  })

  it('splits the new wall at an existing point lying on its path', () => {
    const plan = buildPlan((b) => {
      const foot = b.point(200, 0)
      const top = b.point(200, 300)
      b.wall(foot, top)
    })
    const footId = Object.keys(plan.points)[0]
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' })
    expect(Object.keys(next.walls)).toHaveLength(3)
    expect(Object.keys(next.points)).toHaveLength(4)
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === footId || w.endPointId === footId,
    )
    expect(touching).toHaveLength(3)
  })
})

describe('addWall', () => {
  it('adds a wall with default thickness', () => {
    const plan = rectPlan()
    const [p1, p2] = Object.keys(plan.points)
    const withPoint = ensurePoint(plan, { x: 400, y: 300, kind: 'free' })
    const next = addWall(withPoint[0], p2, withPoint[1])
    expect(Object.keys(next.walls)).toHaveLength(2)
    const added = Object.values(next.walls).find((w) => w.startPointId === p2)!
    expect(added.thickness).toBe(10)
    expect(added.endPointId).toBe(withPoint[1])
    expect(p1).toBeTruthy()
  })

  it('adds a wall with the requested thickness', () => {
    const plan = rectPlan()
    const [, p2] = Object.keys(plan.points)
    const [withPoint, p3] = ensurePoint(plan, { x: 400, y: 300, kind: 'free' })
    const next = addWall(withPoint, p2, p3, 25)
    const added = Object.values(next.walls).find((w) => w.startPointId === p2)!
    expect(added.thickness).toBe(25)
  })

  it('rejects self-loops and duplicate walls (either direction)', () => {
    const plan = rectPlan()
    const [p1, p2] = Object.keys(plan.points)
    expect(addWall(plan, p1, p1)).toBe(plan)
    expect(addWall(plan, p1, p2)).toBe(plan)
    expect(addWall(plan, p2, p1)).toBe(plan)
  })
})

describe('mergeCoincidentPoints', () => {
  it('merges coincident points, rewiring walls to the first-seen survivor', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const twin = b.point(400, 0)
      const p4 = b.point(400, 300)
      b.wall(p1, p2)
      b.wall(twin, p4)
    })
    const [p1, p2, twin, p4] = Object.keys(plan.points)
    const [w1, w2] = Object.keys(plan.walls)
    const next = mergeCoincidentPoints(plan)
    expect(Object.keys(next.points).sort()).toEqual([p1, p2, p4].sort())
    expect(next.points[twin]).toBeUndefined()
    expect(next.walls[w1]).toMatchObject({ startPointId: p1, endPointId: p2 })
    expect(next.walls[w2]).toMatchObject({ startPointId: p2, endPointId: p4 })
  })

  it('prefers a stationary survivor over a moved point', () => {
    const plan = buildPlan((b) => {
      const dragged = b.point(400, 0)
      const still = b.point(400, 0)
      b.wall(b.point(0, 0), dragged)
      b.wall(still, b.point(400, 300))
    })
    const [dragged, still] = Object.keys(plan.points)
    const next = mergeCoincidentPoints(plan, new Set([dragged]))
    expect(next.points[still]).toBeDefined()
    expect(next.points[dragged]).toBeUndefined()
  })

  it('deletes a wall whose two ends merge, along with its openings', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(1, 0) // within the 1 cm junction tolerance of p1
      const shrunk = b.wall(p1, p2)
      b.wall(p2, b.point(300, 0))
      b.opening(shrunk, 'door', 0)
    })
    const next = mergeCoincidentPoints(plan)
    expect(next.walls[Object.keys(plan.walls)[0]]).toBeUndefined()
    expect(Object.keys(next.openings)).toHaveLength(0)
  })

  it('dedupes twin walls, transposing the removed twin openings onto the survivor', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const twin = b.point(400, 0)
      b.wall(p1, p2)
      const reversedTwin = b.wall(twin, p1) // same span, opposite direction
      b.opening(reversedTwin, 'door', 100)
    })
    const [w1, w2] = Object.keys(plan.walls)
    const doorId = Object.keys(plan.openings)[0]
    const next = mergeCoincidentPoints(plan)
    expect(next.walls[w2]).toBeUndefined()
    // 100 from the twin's start = 300 from the survivor's end; hinge and swing
    // are wall-relative, so the reversed frame flips both
    expect(next.openings[doorId]).toMatchObject({
      wallId: w1,
      offset: 300,
      hingeSide: 'end',
      swing: 'out',
    })
  })

  it('returns the same plan when no points coincide', () => {
    const plan = squareRoomPlan()
    expect(mergeCoincidentPoints(plan)).toBe(plan)
  })
})

describe('planarize', () => {
  it('splits a wall under a point lying on its body (T junction)', () => {
    // w1 spans (0,0)→(400,0); the free end of w2 sits on its body at (150,0)
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const t = b.point(150, 0)
      const below = b.point(150, 200)
      b.wall(p1, p2)
      b.wall(t, below)
    })
    const [p1, p2, t] = Object.keys(plan.points)
    const w1 = Object.keys(plan.walls)[0]
    const next = planarize(plan)
    expect(Object.keys(next.walls)).toHaveLength(3)
    expect(next.walls[w1]).toMatchObject({ startPointId: p1, endPointId: t })
    const endHalf = Object.values(next.walls).find((w) => w.startPointId === t && w.endPointId === p2)
    expect(endHalf).toBeDefined()
  })

  it('splits both walls at a crossing (X junction)', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(200, -100)
      const p4 = b.point(200, 100)
      b.wall(p1, p2)
      b.wall(p3, p4)
    })
    const next = planarize(plan)
    expect(Object.keys(next.walls)).toHaveLength(4)
    const cross = Object.values(next.points).find((p) => p.x === 200 && p.y === 0)!
    expect(cross).toBeDefined()
    const atCross = Object.values(next.walls).filter(
      (w) => w.startPointId === cross.id || w.endPointId === cross.id,
    )
    expect(atCross).toHaveLength(4)
  })

  it('resolves every crossing of a wall spanning two others', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, -100)
      const p2 = b.point(0, 100)
      const p3 = b.point(300, -100)
      const p4 = b.point(300, 100)
      const p5 = b.point(-100, 0)
      const p6 = b.point(400, 0)
      b.wall(p1, p2)
      b.wall(p3, p4)
      b.wall(p5, p6)
    })
    const next = planarize(plan)
    // each vertical wall splits in two, the long wall in three
    expect(Object.keys(next.walls)).toHaveLength(7)
  })

  it('returns the same plan when the invariant already holds', () => {
    const plan = squareRoomPlan()
    expect(planarize(plan)).toBe(plan)
  })

  it('collapses a wall dropped along another into shared pieces, never twins', () => {
    // w2 (100,0)→(300,0) lies on w1's body: the T splits carve w1 at both
    // ends of w2, and the middle piece would span the same pair as w2
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(100, 0)
      const p4 = b.point(300, 0)
      b.wall(p1, p2)
      b.wall(p3, p4)
    })
    const next = planarize(plan)
    expect(Object.keys(next.walls)).toHaveLength(3)
    const pairs = Object.values(next.walls).map((w) => [w.startPointId, w.endPointId].sort().join('-'))
    expect(new Set(pairs).size).toBe(3)
  })
})

describe('movePoint / setPoints', () => {
  it('moves a shared point (all attached walls follow implicitly)', () => {
    const plan = rectPlan()
    const id = Object.keys(plan.points)[0]
    const next = movePoint(plan, id, 50.4, 60.5)
    expect(next.points[id]).toMatchObject({ x: 50, y: 61 })
  })

  it('setPoints updates several points at once', () => {
    const plan = rectPlan()
    const [a, b] = Object.keys(plan.points)
    const next = setPoints(plan, { [a]: { x: 1, y: 2 }, [b]: { x: 3, y: 4 } })
    expect(next.points[a]).toMatchObject({ x: 1, y: 2 })
    expect(next.points[b]).toMatchObject({ x: 3, y: 4 })
  })
})

describe('deleteWall', () => {
  it('deletes the wall, its openings, and now-orphan points', () => {
    let plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 300)
      b.wall(p1, p2)
      b.wall(p2, p3)
    })
    const wall = Object.values(plan.walls).find((w) => {
      return plan.points[w.startPointId].y === 0 && plan.points[w.endPointId].y === 0
    })!
    plan = placeOpening(plan, wall.id, 'door', 200)[0]
    expect(Object.keys(plan.openings)).toHaveLength(1)

    const next = deleteWall(plan, wall.id)
    expect(next.walls[wall.id]).toBeUndefined()
    expect(Object.keys(next.openings)).toHaveLength(0)
    // p1 became orphan, p2 still used by the second wall
    expect(Object.keys(next.points)).toHaveLength(2)
  })
})

describe('openings', () => {
  it('places a door with defaults at a clamped integer offset, returning its id', () => {
    const base = rectPlan()
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'door', 200.4)
    expect(id).not.toBeNull()
    const door = plan.openings[id!]
    expect(door).toMatchObject({ type: 'door', offset: 200, width: DOOR_WIDTH })
    if (door.type === 'door') {
      expect(door.hingeSide).toBe('start')
      expect(door.swing).toBe('in')
    }
  })

  it('places a door with the given width, hinge side and swing', () => {
    const base = rectPlan()
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'door', 200, {
      width: 80,
      hingeSide: 'end',
      swing: 'out',
    })
    expect(plan.openings[id!]).toMatchObject({ width: 80, hingeSide: 'end', swing: 'out' })
  })

  it('places a window with the given width, clamped to fit', () => {
    const base = rectPlan()
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'window', 390, { width: 60 })
    // free wall: the rail reaches the overhang at 405, so the window sits flush
    expect(plan.openings[id!]).toMatchObject({ type: 'window', width: 60, offset: 375 })
  })

  it('clamps the offset to the rail, flush against each end', () => {
    const plan = rectPlan()
    const wall = Object.values(plan.walls)[0]
    // rail -5 → 405: a 90 opening centres between 40 and 360
    expect(clampOpeningOffset(plan, wall, 10, 90)).toBe(40)
    expect(clampOpeningOffset(plan, wall, 395, 90)).toBe(360)
    expect(clampOpeningOffset(plan, wall, 200, 90)).toBe(200)
  })

  it('lands exactly on a rail end that is not a whole centimetre', () => {
    // a 45° corner miters the rail end to an irrational offset: rounding to
    // whole centimetres must not push the opening off its bound
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const corner = b.point(400, 0)
      b.wall(a, corner)
      b.wall(corner, b.point(700, 300))
    })
    const wall = Object.values(plan.walls)[0]
    const rail = openingRail(plan, wall, 200)
    expect(Number.isInteger(rail.to)).toBe(false)
    expect(clampOpeningOffset(plan, wall, 400, 90)).toBe(rail.to - 45)
  })

  it('refuses to place an opening on a wall narrower than it', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(60, 0)
      b.wall(p1, p2)
    })
    const wallId = Object.keys(plan.walls)[0]
    const [next, id] = placeOpening(plan, wallId, 'door', 30)
    expect(next).toBe(plan)
    expect(id).toBeNull()
  })

  it('moves an opening along its wall, clamped', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'window', 200)
    expect(moveOpening(plan, id!, 390).openings[id!].offset).toBe(345)
  })

  it('stops a move at the near edge of a neighbouring opening', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'window', 100, { width: 80 })
    // a door (90) at 300 occupies 255 → 345; the window can reach 215 at most
    ;[plan] = placeOpening(plan, wallId, 'door', 300, { width: 90 })
    expect(moveOpening(plan, id!, 400).openings[id!].offset).toBe(215)
  })

  it('places a new opening beside the one already under the pointer', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    ;[plan] = placeOpening(plan, wallId, 'door', 200, { width: 90 }) // 155 → 245
    const [next, id] = placeOpening(plan, wallId, 'window', 220, { width: 60 })
    // 220 sits past the door's centre, so the new window takes the far side
    expect(next.openings[id!].offset).toBe(275)
  })

  it('changes width, re-clamping the offset', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'door', 55)
    const next = setOpeningWidth(plan, id!, 160)
    expect(next.openings[id!].width).toBe(160)
    expect(next.openings[id!].offset).toBe(75)
  })

  it('slides an opening to make room for its new width, and refuses when it cannot', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'window', 100, { width: 60 }) // 70 → 130
    ;[plan] = placeOpening(plan, wallId, 'door', 200, { width: 90 }) // 155 → 245
    // rail for the window: -5 → 155. Widening to 120 slides it up against the
    // door, where it spans 35 → 155
    const wider = setOpeningWidth(plan, id!, 120)
    expect(wider.openings[id!]).toMatchObject({ width: 120, offset: 95 })
    // 200 cannot fit in a 160-wide rail at all
    expect(setOpeningWidth(plan, id!, 200)).toBe(plan)
  })

  it('toggles door hinge side and swing', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'door', 200)
    let next = toggleHingeSide(plan, id!)
    let door = next.openings[id!]
    expect(door.type === 'door' && door.hingeSide).toBe('end')
    next = toggleSwing(next, id!)
    door = next.openings[id!]
    expect(door.type === 'door' && door.swing).toBe('out')
  })

  it('deletes an opening', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    let id: string | null
    ;[plan, id] = placeOpening(plan, wallId, 'door', 200)
    expect(Object.keys(deleteOpening(plan, id!).openings)).toHaveLength(0)
  })
})

describe('setWallThickness', () => {
  it('sets the thickness of a wall', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    expect(setWallThickness(plan, wallId, 20).walls[wallId].thickness).toBe(20)
  })

  it('is a no-op for an unknown wall', () => {
    const plan = rectPlan()
    expect(setWallThickness(plan, 'nope', 20)).toBe(plan)
  })
})

describe('setDimPlacement', () => {
  it('stores the placement on the wall, rounded to 3 decimals', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    expect(setDimPlacement(plan, wallId, 0.75, -1).walls[wallId].dimPlacement).toEqual({
      t: 0.75,
      side: -1,
    })
    expect(setDimPlacement(plan, wallId, 1 / 3, 1).walls[wallId].dimPlacement).toEqual({
      t: 0.333,
      side: 1,
    })
  })

  it('clamps the placement to the travel the caller passes', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const travel = { min: 0.12, max: 0.88 }
    expect(setDimPlacement(plan, wallId, 1.4, 1, travel).walls[wallId].dimPlacement).toEqual({
      t: 0.88,
      side: 1,
    })
    expect(setDimPlacement(plan, wallId, -0.2, 1, travel).walls[wallId].dimPlacement).toEqual({
      t: 0.12,
      side: 1,
    })
  })

  it('clamps to [0, 1] when no travel is passed', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    expect(setDimPlacement(plan, wallId, 1.4, 1).walls[wallId].dimPlacement).toEqual({ t: 1, side: 1 })
  })

  it('pins the placement to the middle of an empty travel', () => {
    const plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    const travel = { min: 0.6, max: 0.4 }
    expect(setDimPlacement(plan, wallId, 0.9, 1, travel).walls[wallId].dimPlacement).toEqual({
      t: 0.5,
      side: 1,
    })
  })

  it('is a no-op for an unknown wall', () => {
    const plan = rectPlan()
    expect(setDimPlacement(plan, 'missing', 0.5, 1)).toBe(plan)
  })
})

describe('room labels', () => {
  it('adds, renames, moves, and deletes a label', () => {
    let plan = buildPlan(() => {})
    let id: string
    ;[plan, id] = addRoomLabel(plan, 'Kitchen', 100, 100)
    expect(plan.roomLabels[id]).toMatchObject({ name: 'Kitchen', x: 100, y: 100 })
    plan = renameRoomLabel(plan, id, 'Living room')
    expect(plan.roomLabels[id].name).toBe('Living room')
    plan = moveRoomLabel(plan, id, 150.6, 80.2)
    expect(plan.roomLabels[id]).toMatchObject({ x: 151, y: 80 })
    plan = deleteRoomLabel(plan, id)
    expect(Object.keys(plan.roomLabels)).toHaveLength(0)
  })
})

describe('room label placement state', () => {
  const roomWithLabel = () => {
    let labelId = ''
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
      labelId = b.label('Kitchen', 200, 200).id
    })
    return { plan, labelId }
  }

  it('addRoomLabel creates a default-placement label', () => {
    const { plan } = roomWithLabel()
    const [next, id] = addRoomLabel(plan, 'Office', 200, 200)
    expect(next.roomLabels[id].placed).toBeUndefined()
  })

  it('moveRoomLabel gives the label a custom placement', () => {
    const { plan, labelId } = roomWithLabel()
    const next = moveRoomLabel(plan, labelId, 350, 120)
    expect(next.roomLabels[labelId]).toMatchObject({ x: 350, y: 120, placed: true })
  })

  it('renameRoomLabel leaves the placement state alone', () => {
    const { plan, labelId } = roomWithLabel()
    const renamed = renameRoomLabel(plan, labelId, 'Office')
    expect(renamed.roomLabels[labelId].placed).toBeUndefined()
    const customThenRenamed = renameRoomLabel(moveRoomLabel(plan, labelId, 350, 120), labelId, 'Office')
    expect(customThenRenamed.roomLabels[labelId].placed).toBe(true)
  })
})
