import { describe, expect, it } from 'vitest'
import {
  addRoomLabel,
  addWall,
  clampOpeningOffset,
  deleteOpening,
  deleteRoomLabel,
  deleteWall,
  ensurePoint,
  movePoint,
  moveRoomLabel,
  moveOpening,
  placeOpening,
  renameRoomLabel,
  setOpeningWidth,
  setPoints,
  toggleHingeSide,
  toggleSwing,
} from './operations'
import { buildPlan } from './testHelpers'
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

  it('rejects self-loops and duplicate walls (either direction)', () => {
    const plan = rectPlan()
    const [p1, p2] = Object.keys(plan.points)
    expect(addWall(plan, p1, p1)).toBe(plan)
    expect(addWall(plan, p1, p2)).toBe(plan)
    expect(addWall(plan, p2, p1)).toBe(plan)
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
    plan = placeOpening(plan, wall.id, 'door', 200)
    expect(Object.keys(plan.openings)).toHaveLength(1)

    const next = deleteWall(plan, wall.id)
    expect(next.walls[wall.id]).toBeUndefined()
    expect(Object.keys(next.openings)).toHaveLength(0)
    // p1 became orphan, p2 still used by the second wall
    expect(Object.keys(next.points)).toHaveLength(2)
  })
})

describe('openings', () => {
  it('places a door with defaults at a clamped integer offset', () => {
    const base = rectPlan()
    const plan = placeOpening(base, Object.keys(base.walls)[0], 'door', 200.4)
    const door = Object.values(plan.openings)[0]
    expect(door).toMatchObject({ type: 'door', offset: 200, width: DOOR_WIDTH })
    if (door.type === 'door') {
      expect(door.hingeSide).toBe('start')
      expect(door.swing).toBe('in')
    }
  })

  it('clamps the offset so the opening fits inside the wall', () => {
    const plan = rectPlan()
    const wall = Object.values(plan.walls)[0]
    expect(clampOpeningOffset(plan, wall, 10, 90)).toBe(50)
    expect(clampOpeningOffset(plan, wall, 395, 90)).toBe(350)
    expect(clampOpeningOffset(plan, wall, 200, 90)).toBe(200)
  })

  it('refuses to place an opening on a too-short wall', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(80, 0)
      b.wall(p1, p2)
    })
    const wallId = Object.keys(plan.walls)[0]
    expect(placeOpening(plan, wallId, 'door', 40)).toBe(plan)
  })

  it('moves an opening along its wall, clamped', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    plan = placeOpening(plan, wallId, 'window', 200)
    const id = Object.keys(plan.openings)[0]
    expect(moveOpening(plan, id, 390).openings[id].offset).toBe(335)
  })

  it('changes width, re-clamping the offset', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    plan = placeOpening(plan, wallId, 'door', 55)
    const id = Object.keys(plan.openings)[0]
    const next = setOpeningWidth(plan, id, 160)
    expect(next.openings[id].width).toBe(160)
    expect(next.openings[id].offset).toBe(85)
  })

  it('toggles door hinge side and swing', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    plan = placeOpening(plan, wallId, 'door', 200)
    const id = Object.keys(plan.openings)[0]
    let next = toggleHingeSide(plan, id)
    let door = next.openings[id]
    expect(door.type === 'door' && door.hingeSide).toBe('end')
    next = toggleSwing(next, id)
    door = next.openings[id]
    expect(door.type === 'door' && door.swing).toBe('out')
  })

  it('deletes an opening', () => {
    let plan = rectPlan()
    const wallId = Object.keys(plan.walls)[0]
    plan = placeOpening(plan, wallId, 'door', 200)
    const id = Object.keys(plan.openings)[0]
    expect(Object.keys(deleteOpening(plan, id).openings)).toHaveLength(0)
  })
})

describe('room labels', () => {
  it('adds, renames, moves, and deletes a label', () => {
    let plan = buildPlan(() => {})
    plan = addRoomLabel(plan, 'Kitchen', 100, 100)
    const id = Object.keys(plan.roomLabels)[0]
    expect(plan.roomLabels[id]).toMatchObject({ name: 'Kitchen', x: 100, y: 100 })
    plan = renameRoomLabel(plan, id, 'Living room')
    expect(plan.roomLabels[id].name).toBe('Living room')
    plan = moveRoomLabel(plan, id, 150.6, 80.2)
    expect(plan.roomLabels[id]).toMatchObject({ x: 151, y: 80 })
    plan = deleteRoomLabel(plan, id)
    expect(Object.keys(plan.roomLabels)).toHaveLength(0)
  })
})
