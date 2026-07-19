import { describe, expect, it } from 'vitest'
import { commitWall, deleteWall, setPoints } from './operations'
import {
  clampToRoom,
  detectRooms,
  interiorSide,
  reconcileRoomLabels,
  roomAt,
  roomContains,
  wallMeasures,
} from './rooms'
import type { Plan } from './types'
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

  it('detects a single rectangular room with its area and anchor', () => {
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
    expect(rooms[0].anchor).toEqual({ x: 200, y: 150 })
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

describe('nested rooms (an island punches a hole in its containing room)', () => {
  // 400×400 outer room with a disconnected 150×100 island at (100,100)
  const nestedPlan = () => {
    let ids = { islandTopWall: '', islandWallIds: [] as string[], islandPointIds: [] as string[] }
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 400)
      const e = b.point(0, 400)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      const i1 = b.point(100, 100)
      const i2 = b.point(250, 100)
      const i3 = b.point(250, 200)
      const i4 = b.point(100, 200)
      const top = b.wall(i1, i2)
      const walls = [top, b.wall(i2, i3), b.wall(i3, i4), b.wall(i4, i1)]
      ids = {
        islandTopWall: top.id,
        islandWallIds: walls.map((w) => w.id),
        islandPointIds: [i1, i2, i3, i4].map((p) => p.id),
      }
    })
    return { plan, ...ids }
  }

  const byArea = (plan: Plan) => {
    const rooms = detectRooms(plan)
    rooms.sort((a, b) => a.areaCm2 - b.areaCm2)
    return { inner: rooms[0], outer: rooms[1], rooms }
  }

  it('detects both rooms and excludes the island footprint from the outer area', () => {
    const { plan } = nestedPlan()
    const { inner, outer, rooms } = byArea(plan)
    expect(rooms).toHaveLength(2)
    expect(inner.areaCm2).toBe(140 * 90)
    // outer interior faces 390×390, minus the island out to its exterior
    // faces (160×110): walls included in the hole
    expect(outer.areaCm2).toBe(390 * 390 - 160 * 110)
    expect(outer.holes).toHaveLength(1)
    expect(inner.holes).toHaveLength(0)
  })

  it('resolves a point inside the island to the inner room only', () => {
    const { plan } = nestedPlan()
    const { inner, outer, rooms } = byArea(plan)
    expect(roomAt(rooms, 175, 150)).toBe(inner)
    expect(roomAt(rooms, 320, 300)).toBe(outer)
    expect(roomContains(outer, 175, 150)).toBe(false)
  })

  it('anchors the outer block at the centroid of the holed region', () => {
    const { plan } = nestedPlan()
    const { outer } = byArea(plan)
    expect(outer.anchor.x).toBeCloseTo(202.59, 1)
    expect(outer.anchor.y).toBeCloseTo(205.17, 1)
  })

  it('falls back to the pole of inaccessibility when the centroid lands in the island', () => {
    // centered island: the naive centroid (200,200) sits inside the hole
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 400)
      const e = b.point(0, 400)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      const i1 = b.point(150, 150)
      const i2 = b.point(250, 150)
      const i3 = b.point(250, 250)
      const i4 = b.point(150, 250)
      b.wall(i1, i2)
      b.wall(i2, i3)
      b.wall(i3, i4)
      b.wall(i4, i1)
    })
    const { outer } = byArea(plan)
    expect(roomContains(outer, outer.anchor.x, outer.anchor.y)).toBe(true)
    expect(Math.hypot(outer.anchor.x - 200, outer.anchor.y - 200)).toBeGreaterThan(50)
  })

  it('treats an island wall as a party wall between the two rooms', () => {
    const { plan, islandTopWall } = nestedPlan()
    const rooms = detectRooms(plan)
    const wall = plan.walls[islandTopWall]
    expect(interiorSide(rooms, wall)).toBeNull()
    // hors-tout across the mitered exterior faces: 150 + 2×5
    expect(wallMeasures(plan, rooms, wall)).toEqual({ kind: 'plain', length: 160, thickness: 10 })
  })

  it('clamps a label drag out of the island', () => {
    const { plan } = nestedPlan()
    const { outer } = byArea(plan)
    const clamped = clampToRoom({ x: 175, y: 180 }, outer)
    expect(clamped.y).toBeGreaterThan(200)
    expect(roomContains(outer, clamped.x, clamped.y)).toBe(true)
    expect(clampToRoom({ x: 320, y: 300 }, outer)).toEqual({ x: 320, y: 300 })
  })

  it('keeps an island label with the inner room and pins the outer label to the outer anchor', () => {
    const { plan: bare } = nestedPlan()
    const plan: Plan = {
      ...bare,
      roomLabels: {
        li: { id: 'li', name: 'Inner', x: 175, y: 150 },
        lo: { id: 'lo', name: 'Outer', x: 320, y: 300 },
      },
    }
    const next = reconcileRoomLabels(plan, plan)
    // both labels survive: they live in different rooms
    expect(next.roomLabels.li).toMatchObject({ name: 'Inner', x: 175, y: 150 })
    expect(next.roomLabels.lo).toMatchObject({ name: 'Outer', x: 203, y: 205 })
  })

  it('reverts a custom placement swallowed by a newly drawn island', () => {
    const { plan: bare, islandWallIds, islandPointIds } = nestedPlan()
    const after: Plan = {
      ...bare,
      roomLabels: { l: { id: 'l', name: 'Kitchen', x: 175, y: 150, placed: true } },
    }
    const before: Plan = {
      ...after,
      points: Object.fromEntries(Object.entries(after.points).filter(([id]) => !islandPointIds.includes(id))),
      walls: Object.fromEntries(Object.entries(after.walls).filter(([id]) => !islandWallIds.includes(id))),
    }
    const next = reconcileRoomLabels(before, after)
    expect(next.roomLabels.l).toEqual({ id: 'l', name: 'Kitchen', x: 203, y: 205 })
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

  it('returns the same plan when every label already sits at its centroid', () => {
    const { plan } = labeledSquare(200, 200)
    expect(reconcileRoomLabels(plan, plan)).toBe(plan)
  })

  it('pins a default label to the live centroid when the room deforms', () => {
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

  // Two stacked rooms sharing a wall; returns the plan plus the ids needed
  // to drag the shared wall.
  const stackedRooms = () => {
    let ids = { shared: ['', ''], top: '', bottom: '' }
    const plan = buildPlan((b) => {
      const tl = b.point(250, -90)
      const tr = b.point(450, -90)
      const ml = b.point(250, 60)
      const mr = b.point(450, 60)
      const bl = b.point(250, 300)
      const br = b.point(450, 300)
      b.wall(tl, tr)
      b.wall(tl, ml)
      b.wall(tr, mr)
      b.wall(ml, mr) // the shared wall
      b.wall(ml, bl)
      b.wall(mr, br)
      b.wall(bl, br)
      ids = {
        shared: [ml.id, mr.id],
        top: b.label('AAA', 350, -15).id,
        bottom: b.label('BBB', 350, 180).id,
      }
    })
    return { plan, ...ids }
  }

  it('keeps each label with its room when a shared wall sweeps past a label', () => {
    const { plan, shared, top, bottom } = stackedRooms()
    // drag the shared wall down past BBB's position: the room sizes invert
    const after = setPoints(plan, { [shared[0]]: { x: 250, y: 250 }, [shared[1]]: { x: 450, y: 250 } })
    const next = reconcileRoomLabels(plan, after)
    expect(next.roomLabels[top]).toMatchObject({ name: 'AAA', x: 350, y: 80 })
    expect(next.roomLabels[bottom]).toMatchObject({ name: 'BBB', x: 350, y: 275 })
  })

  it('keeps a label whose room loop changed but still contains it (position fallback)', () => {
    const { plan, label } = labeledSquare(200, 200)
    // draw a dangling wall from the left wall inward: planar insertion splits
    // the boundary wall, so the room loop gains a point
    const left = Object.values(plan.walls).find(
      (w) => plan.points[w.startPointId].x === 0 && plan.points[w.endPointId].x === 0,
    )!
    const [after] = commitWall(
      plan,
      { x: 0, y: 200, kind: 'wall', wallId: left.id },
      { x: 100, y: 200, kind: 'free' },
    )
    const next = reconcileRoomLabels(plan, after)
    expect(next.roomLabels[label]).toMatchObject({ name: 'Kitchen' })
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

describe('reconcileRoomLabels — placement state', () => {
  it('reverts a custom placement to default when the room deforms away from it', () => {
    let ids = { right: ['', ''], label: '' }
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
      ids = { right: [p2.id, p3.id], label: b.label('Kitchen', 350, 200, true).id }
    })
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } })
    const next = reconcileRoomLabels(plan, after)
    expect(next.roomLabels[ids.label]).toEqual({ id: ids.label, name: 'Kitchen', x: 150, y: 200 })
  })

  it('keeps a custom placement that is still inside the room', () => {
    let ids = { right: ['', ''], label: '' }
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      b.wall(p1, p2)
      b.wall(p2, p3)
      b.wall(p3, p4)
      b.wall(p4, p1)
      ids = { right: [p2.id, p3.id], label: b.label('Kitchen', 150, 200, true).id }
    })
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } })
    expect(reconcileRoomLabels(plan, after)).toBe(after)
  })
})
