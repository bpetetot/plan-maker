import { describe, expect, it } from 'vitest'
import { commitWall, deleteWall, setPoints } from './operations'
import { detectRooms, interiorSide, reconcileRoomLabels, roomAt, wallMeasures } from './rooms'
import { buildPlan, squareRoomPlan } from './testHelpers'

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
    for (const room of rooms) expect(room.areaCm2).toBe(190 * 390)
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
    expect(rooms[0].areaCm2).toBe(390 * 290)
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
    expect(areas).toEqual([240 * 290, 340 * 290])
  })

  it('subtracts the footprint of a dangling wall from the room area', () => {
    // 400×300 room, stub from the middle of the bottom wall down to (200,100):
    // the floor wraps around the stub slab (10 wide, from the bottom wall's
    // inner face at y=5 to the stub tip at y=100 — free end stops at the Point)
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const m = b.point(200, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      const tip = b.point(200, 100)
      b.wall(a, m)
      b.wall(m, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      b.wall(m, tip)
    })
    const rooms = detectRooms(plan)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaCm2).toBe(390 * 290 - 10 * 95)
  })

  it('still detects a single room around a diagonal spur from a corner', () => {
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
    // the spur slab eats into the interior-face area (390×290) without
    // breaking detection; exact value depends on the diagonal footprint
    expect(rooms[0].areaCm2).toBeLessThan(390 * 290)
    expect(rooms[0].areaCm2).toBeGreaterThan(390 * 290 - 10 * 250 - 100)
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
    expect(areas).toEqual([90 * 90, 190 * 190])
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
    expect(rooms[0].areaCm2).toBe(390 * 190 + 190 * 200)
  })
})

describe('interiorSide', () => {
  it('gives the side of a perimeter wall facing its single room', () => {
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
    const [bottom, right, top, left] = Object.values(plan.walls)
    // interior of the room is below the bottom wall in screen coords: side +1
    // (the same convention faceLength uses)
    expect(interiorSide(rooms, bottom)).toBe(1)
    expect(interiorSide(rooms, right)).toBe(1)
    expect(interiorSide(rooms, top)).toBe(1)
    expect(interiorSide(rooms, left)).toBe(1)
  })

  it('returns null for a wall bordering no room', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(interiorSide(detectRooms(plan), wall)).toBeNull()
  })

  it('returns null for a party wall between two rooms', () => {
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
    const divider = Object.values(plan.walls)[6]
    expect(interiorSide(rooms, divider)).toBeNull()
  })

  it('returns null for a dangling wall inside a room (both sides face it)', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const m = b.point(200, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      const tip = b.point(200, 100)
      b.wall(a, m)
      b.wall(m, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      b.wall(m, tip)
    })
    const rooms = detectRooms(plan)
    const stub = Object.values(plan.walls)[5]
    expect(interiorSide(rooms, stub)).toBeNull()
  })
})

describe('wallMeasures', () => {
  it('gives interior, exterior and thickness for a wall bordering exactly one room', () => {
    // 4×4 m axis square, 10 cm walls: interior faces 3,90 m, exterior 4,10 m
    const plan = squareRoomPlan()
    const rooms = detectRooms(plan)
    for (const wall of Object.values(plan.walls)) {
      expect(wallMeasures(plan, rooms, wall)).toEqual({
        kind: 'oriented',
        interior: 390,
        exterior: 410,
        thickness: 10,
      })
    }
  })

  it('gives the hors-tout length of a standalone wall', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
    })
    const wall = Object.values(plan.walls)[0]
    // free ends overhang the Points by half the thickness: 400 + 2×5
    expect(wallMeasures(plan, detectRooms(plan), wall)).toEqual({
      kind: 'plain',
      length: 410,
      thickness: 10,
    })
  })

  it('gives the hors-tout length of a party wall between two rooms', () => {
    // 600×300 rectangle split by a vertical divider at x=250
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
    const divider = Object.values(plan.walls)[6]
    // both faces miter against the horizontal walls' inner faces: y=5 to y=295
    expect(wallMeasures(plan, detectRooms(plan), divider)).toEqual({
      kind: 'plain',
      length: 290,
      thickness: 10,
    })
  })

  it('gives the hors-tout length of a wall jutting into its own room', () => {
    // 400×300 room with a stub from the bottom wall's midpoint to (200,100)
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const m = b.point(200, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      const tip = b.point(200, 100)
      b.wall(a, m)
      b.wall(m, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      b.wall(m, tip)
    })
    const stub = Object.values(plan.walls)[5]
    // mitered at the bottom wall's inner face (y=5), overhang at the tip (y=105)
    expect(wallMeasures(plan, detectRooms(plan), stub)).toEqual({
      kind: 'plain',
      length: 100,
      thickness: 10,
    })
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

describe('reconcileRoomLabels', () => {
  // 4×4 m square room; returns the plan plus the ids needed to reshape it
  const labeledSquare = (labelX: number, labelY: number) => {
    let ids = { right: ['', ''], wall: '', label: '' }
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      const w = b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
      const label = b.label('Kitchen', labelX, labelY)
      ids = { right: [p2.id, p3.id], wall: w.id, label: label.id }
    })
    return { plan, ...ids }
  }

  it('leaves a label alone while a room still contains it', () => {
    const { plan, right } = labeledSquare(200, 200)
    const after = setPoints(plan, { [right[0]]: { x: 300, y: 0 }, [right[1]]: { x: 300, y: 400 } })
    expect(reconcileRoomLabels(plan, after)).toBe(after)
  })

  it('snaps a label to its room centroid when the room deforms away from it', () => {
    const { plan, right, label } = labeledSquare(350, 200)
    const after = setPoints(plan, { [right[0]]: { x: 300, y: 0 }, [right[1]]: { x: 300, y: 400 } })
    const next = reconcileRoomLabels(plan, after)
    expect(next.roomLabels[label]).toMatchObject({ name: 'Kitchen', x: 150, y: 200 })
  })

  it('deletes a label whose room is no longer detected', () => {
    const { plan, wall } = labeledSquare(200, 200)
    const after = deleteWall(plan, wall)
    expect(reconcileRoomLabels(plan, after).roomLabels).toEqual({})
  })

  it('drops orphan labels when reconciling a plan against itself', () => {
    let insideId = ''
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
      insideId = b.label('Kitchen', 200, 200).id
      b.label('Orphan', 900, 900)
    })
    const next = reconcileRoomLabels(plan, plan)
    expect(Object.keys(next.roomLabels)).toEqual([insideId])
  })
})
