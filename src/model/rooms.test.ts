import { describe, expect, it } from 'vitest'
import { commitWall } from './operations'
import { detectRooms, roomAt } from './rooms'
import { buildPlan } from './testHelpers'

describe('detectRooms after planar insertion (ADR 0002)', () => {
  it('detects both rooms when a divider is drawn between two wall bodies', () => {
    const square = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
    })
    expect(detectRooms(square)).toHaveLength(1)
    const [bottom, , top] = Object.keys(square.walls)
    const [plan] = commitWall(
      square,
      { x: 200, y: 0, kind: 'wall', wallId: bottom },
      { x: 200, y: 400, kind: 'wall', wallId: top },
    )
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(2)
    for (const room of rooms) expect(room.areaCm2).toBe(200 * 400)
  })
})

describe('detectRooms', () => {
  it('finds no room in an empty plan or an open chain', () => {
    expect(detectRooms(buildPlan(() => {}))).toEqual([])
    const chain = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 300)
      b.wall(p1, p2)
      b.wall(p2, p3)
    })
    expect(detectRooms(chain)).toEqual([])
  })

  it('detects a single rectangular room with its area and centroid', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaCm2).toBe(400 * 300)
    expect(rooms[0].centroid).toEqual({ x: 200, y: 150 })
  })

  it('detects two rooms split by an inner wall', () => {
    // 600×300 outer rectangle with a vertical wall at x=250
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const m1 = b.point(250, 0)
      const c = b.point(600, 0)
      const d = b.point(600, 300)
      const m2 = b.point(250, 300)
      const e = b.point(0, 300)
      b.wall(a, m1)
      b.wall(m1, c)
      b.wall(c, d)
      b.wall(d, m2)
      b.wall(m2, e)
      b.wall(e, a)
      b.wall(m1, m2)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(2)
    const areas = rooms.map((r) => r.areaCm2).sort((x, y) => x - y)
    expect(areas).toEqual([250 * 300, 350 * 300])
  })

  it('ignores a dangling wall inside a room', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      const spur = b.point(200, 150)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      b.wall(a, spur)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaCm2).toBe(400 * 300)
  })

  it('detects rooms in disconnected components', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(100, 0)
      const d = b.point(100, 100)
      const e = b.point(0, 100)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      const f = b.point(500, 0)
      const g = b.point(700, 0)
      const h = b.point(700, 200)
      const i = b.point(500, 200)
      b.wall(f, g)
      b.wall(g, h)
      b.wall(h, i)
      b.wall(i, f)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(2)
    const areas = rooms.map((r) => r.areaCm2).sort((x, y) => x - y)
    expect(areas).toEqual([100 * 100, 200 * 200])
  })

  it('detects a concave (L-shaped) room', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 200)
      const p4 = b.point(200, 200)
      const p5 = b.point(200, 400)
      const p6 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p5)
      b.wall(p5, p6)
      b.wall(p6, p1)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaCm2).toBe(400 * 200 + 200 * 200)
  })
})

describe('roomAt', () => {
  it('returns the room containing a position, or null', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
    })
    const rooms = detectRooms(plan)
    expect(roomAt(rooms, 200, 150)).toBe(rooms[0])
    expect(roomAt(rooms, 900, 900)).toBeNull()
  })
})
