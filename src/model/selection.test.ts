import { describe, expect, it } from 'vitest'
import { deleteElements, elementsInRect, isSelected, refKey, toggleRef, translateElements } from './selection'
import { buildPlan } from './testHelpers'
import type { ElementRef } from './selection'

const wallRef = (id: string): ElementRef => ({ type: 'wall', id })
const openingRef = (id: string): ElementRef => ({ type: 'opening', id })

describe('toggleRef', () => {
  it('adds a ref that is not in the selection', () => {
    const sel = toggleRef([wallRef('w1')], openingRef('o1'))
    expect(sel).toHaveLength(2)
    expect(isSelected(sel, openingRef('o1'))).toBe(true)
  })

  it('removes a ref already in the selection, matching on type and id', () => {
    const sel = toggleRef([wallRef('x'), openingRef('x')], wallRef('x'))
    expect(sel).toEqual([openingRef('x')])
  })
})

describe('elementsInRect', () => {
  it('selects a wall only when both endpoints are inside (containment)', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(200, 0)
      const d = b.point(200, 500)
      b.wall(a, c) // fully inside
      b.wall(c, d) // one endpoint outside
    })
    const [inside, crossing] = Object.values(plan.walls)
    const refs = elementsInRect(plan, { x: -10, y: -10 }, { x: 300, y: 100 })
    expect(isSelected(refs, wallRef(inside.id))).toBe(true)
    expect(isSelected(refs, wallRef(crossing.id))).toBe(false)
  })

  it('normalizes the corners (any drag direction)', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0))
    })
    const wall = Object.values(plan.walls)[0]
    const refs = elementsInRect(plan, { x: 150, y: 50 }, { x: -50, y: -50 })
    expect(isSelected(refs, wallRef(wall.id))).toBe(true)
  })

  it('selects an opening whose span is inside even when its wall is not', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(1000, 0))
      b.opening(wall, 'door', 500, 90)
    })
    const wall = Object.values(plan.walls)[0]
    const opening = Object.values(plan.openings)[0]
    // rect covers the middle of the wall: opening span [455, 545] fits, wall does not
    const refs = elementsInRect(plan, { x: 400, y: -50 }, { x: 600, y: 50 })
    expect(isSelected(refs, openingRef(opening.id))).toBe(true)
    expect(isSelected(refs, wallRef(wall.id))).toBe(false)
  })

  it('leaves out an opening whose span sticks out of the rect', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(1000, 0))
      b.opening(wall, 'window', 500, 120)
    })
    const opening = Object.values(plan.openings)[0]
    // span is [440, 560]; the rect stops at 550
    const refs = elementsInRect(plan, { x: 400, y: -50 }, { x: 550, y: 50 })
    expect(isSelected(refs, openingRef(opening.id))).toBe(false)
  })

  it('never captures room labels (they are not selectable)', () => {
    const plan = buildPlan((b) => {
      b.label('Kitchen', 50, 50)
    })
    const refs = elementsInRect(plan, { x: 0, y: 0 }, { x: 100, y: 100 })
    expect(refs).toEqual([])
  })
})

describe('deleteElements', () => {
  it('deletes walls with their openings and orphan points, plus openings', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const w1 = b.wall(a, c)
      const w2 = b.wall(c, d)
      b.opening(w1, 'door', 200)
      b.opening(w2, 'window', 150)
    })
    const [w1, w2] = Object.values(plan.walls)
    const [, onW2] = Object.values(plan.openings)

    const next = deleteElements(plan, [wallRef(w1.id), openingRef(onW2.id)])

    expect(next.walls[w1.id]).toBeUndefined()
    expect(next.walls[w2.id]).toBeDefined()
    expect(Object.keys(next.openings)).toHaveLength(0)
    // a was only used by w1 → gone; c is still used by w2
    expect(next.points[w1.startPointId]).toBeUndefined()
    expect(next.points[w2.startPointId]).toBeDefined()
  })

  it('tolerates an opening ref whose wall is deleted in the same call', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0))
      b.opening(wall, 'door', 200)
    })
    const wall = Object.values(plan.walls)[0]
    const opening = Object.values(plan.openings)[0]
    const next = deleteElements(plan, [wallRef(wall.id), openingRef(opening.id)])
    expect(Object.keys(next.walls)).toHaveLength(0)
    expect(Object.keys(next.openings)).toHaveLength(0)
  })
})

describe('translateElements', () => {
  it('translates each shared point once', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      b.wall(a, c)
      b.wall(c, d)
    })
    const [w1, w2] = Object.values(plan.walls)
    const next = translateElements(plan, [wallRef(w1.id), wallRef(w2.id)], 50, -20)
    expect(next.points[w1.startPointId]).toMatchObject({ x: 50, y: -20 })
    expect(next.points[w1.endPointId]).toMatchObject({ x: 450, y: -20 })
    expect(next.points[w2.endPointId]).toMatchObject({ x: 450, y: 280 })
  })

  it('stretches an unselected neighbor: the shared point moves, its far point stays', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      b.wall(a, c)
      b.wall(c, d) // neighbor, not selected
    })
    const [w1, w2] = Object.values(plan.walls)
    const next = translateElements(plan, [wallRef(w1.id)], 100, 0)
    expect(next.points[w2.startPointId]).toMatchObject({ x: 500, y: 0 })
    expect(next.points[w2.endPointId]).toMatchObject({ x: 400, y: 300 })
  })

  it('leaves a selected opening in place when its wall is not selected', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0))
      b.opening(wall, 'door', 200)
    })
    const wall = Object.values(plan.walls)[0]
    const opening = Object.values(plan.openings)[0]
    const next = translateElements(plan, [openingRef(opening.id)], 100, 100)
    expect(next.openings[opening.id].offset).toBe(200)
    expect(next.points[wall.startPointId]).toMatchObject({ x: 0, y: 0 })
  })

  it('ignores refs to elements that no longer exist', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0))
    })
    const next = translateElements(plan, [wallRef('gone'), openingRef('gone')], 10, 10)
    expect(next).toBe(plan)
  })

  it('returns the same plan for a zero translation', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0))
    })
    const wall = Object.values(plan.walls)[0]
    expect(translateElements(plan, [wallRef(wall.id)], 0, 0)).toBe(plan)
  })
})

describe('refKey', () => {
  it('distinguishes same id across types', () => {
    expect(refKey(wallRef('x'))).not.toBe(refKey(openingRef('x')))
  })
})

describe('deleteElements — room label cascade', () => {
  // two 3×3 m rooms side by side sharing a divider, one label in each
  const twoLabeledRooms = () => {
    let ids = { leftWalls: [] as string[], divider: '', leftLabel: '', rightLabel: '' }
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const m1 = b.point(300, 0)
      const c = b.point(600, 0)
      const d = b.point(600, 300)
      const m2 = b.point(300, 300)
      const e = b.point(0, 300)
      const w1 = b.wall(a, m1)
      b.wall(m1, c)
      b.wall(c, d)
      b.wall(d, m2)
      const w5 = b.wall(m2, e)
      const w6 = b.wall(e, a)
      const divider = b.wall(m1, m2)
      ids = {
        leftWalls: [w1.id, w5.id, w6.id, divider.id],
        divider: divider.id,
        leftLabel: b.label('Kitchen', 150, 150).id,
        rightLabel: b.label('Living room', 450, 150).id,
      }
    })
    return { plan, ...ids }
  }

  it('deletes the label of a room whose wall is deleted', () => {
    const { plan, leftWalls, rightLabel } = twoLabeledRooms()
    // deleting one boundary wall opens the left loop: its label goes too
    const next = deleteElements(plan, [wallRef(leftWalls[0])])
    expect(Object.keys(next.roomLabels)).toEqual([rightLabel])
  })

  it('keeps both labels when deleting the divider merges the rooms', () => {
    const { plan, divider, leftLabel, rightLabel } = twoLabeledRooms()
    const next = deleteElements(plan, [wallRef(divider)])
    expect(Object.keys(next.roomLabels).sort()).toEqual([leftLabel, rightLabel].sort())
  })

  it('deletes every label when the whole plan is deleted', () => {
    const { plan } = twoLabeledRooms()
    const refs = Object.keys(plan.walls).map(wallRef)
    expect(deleteElements(plan, refs).roomLabels).toEqual({})
  })
})

describe('translateElements — room label rigid move', () => {
  const labeledSquare = () => {
    let ids = { walls: [] as string[], label: '' }
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const p3 = b.point(400, 400)
      const p4 = b.point(0, 400)
      const walls = [b.wall(p1, p2), b.wall(p2, p3), b.wall(p3, p4), b.wall(p4, p1)]
      ids = { walls: walls.map((w) => w.id), label: b.label('Kitchen', 350, 120).id }
    })
    return { plan, ...ids }
  }

  it('moves the label with the room when every boundary wall is selected', () => {
    const { plan, walls, label } = labeledSquare()
    const next = translateElements(plan, walls.map(wallRef), 50, -30)
    expect(next.roomLabels[label]).toMatchObject({ x: 400, y: 90 })
  })

  it('leaves the label in place when the room only deforms (partial selection)', () => {
    const { plan, walls, label } = labeledSquare()
    const next = translateElements(plan, [wallRef(walls[0])], 50, -30)
    expect(next.roomLabels[label]).toMatchObject({ x: 350, y: 120 })
  })

  it('does not move the label of an unselected room', () => {
    let ids = { leftWalls: [] as string[], rightLabel: '' }
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(300, 0)
      const d = b.point(300, 300)
      const e = b.point(0, 300)
      const f = b.point(500, 0)
      const g = b.point(800, 0)
      const h = b.point(800, 300)
      const i = b.point(500, 300)
      const left = [b.wall(a, c), b.wall(c, d), b.wall(d, e), b.wall(e, a)]
      b.wall(f, g)
      b.wall(g, h)
      b.wall(h, i)
      b.wall(i, f)
      b.label('Kitchen', 150, 150)
      ids = { leftWalls: left.map((w) => w.id), rightLabel: b.label('Living room', 650, 150).id }
    })
    const next = translateElements(plan, ids.leftWalls.map(wallRef), 20, 20)
    expect(next.roomLabels[ids.rightLabel]).toMatchObject({ x: 650, y: 150 })
  })
})
