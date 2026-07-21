// Group move realigns on the grid (spec §5): the reference — wall point nearest
// the grab, fixed at pointer-down — lands on an intersection, group rigid.
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.temporal.getState().clear()
})

// Off-grid horizontal wall, ends at different offsets (103,96)/(306,96) so the
// tests can tell which endpoint was referenced.
function offGridWall(): Plan {
  return {
    points: {
      a: { id: 'a', x: 103, y: 96 },
      b: { id: 'b', x: 306, y: 96 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    },
    openings: {},
    roomLabels: {},
  }
}

const plan = () => usePlanStore.getState().plan

async function setup(initial: Plan = offGridWall()) {
  usePlanStore.setState({ plan: initial, planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = await render(<Editor />)
  const svg = container.querySelector('svg')!
  const grabZones = () => svg.querySelectorAll('line[stroke="transparent"]')
  return { svg, grabZones }
}

describe('dragging an off-grid wall body', () => {
  it('lands the reference endpoint on the grid, keeping length and angle', async () => {
    const { svg, grabZones } = await setup()
    // grab next to a (103,96), move 50 cm right
    await pointer(grabZones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 110, 96) })
    await pointer(svg, 'pointermove', clientAt(svg, 160, 96))
    await pointer(svg, 'pointerup')
    // a + raw delta = (153,96) → nearest intersection (150,100): delta (47,4)
    expect(plan().points.a).toMatchObject({ x: 150, y: 100 })
    expect(plan().points.b).toMatchObject({ x: 353, y: 100 })
  })

  it('keeps the same reference for the whole drag, even past the other endpoint', async () => {
    const { svg, grabZones } = await setup()
    await pointer(grabZones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 110, 96) })
    // pointer now far nearer b (306,96) than a — reference stays a
    await pointer(svg, 'pointermove', clientAt(svg, 290, 96))
    await pointer(svg, 'pointerup')
    // referencing b would have landed a on (287,100) instead
    expect(plan().points.a).toMatchObject({ x: 280, y: 100 })
    expect(plan().points.b).toMatchObject({ x: 483, y: 100 })
  })

  it('rounds to whole centimeters with Alt held, without moving the reference', async () => {
    const { svg, grabZones } = await setup()
    await pointer(grabZones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 110, 96) })
    await pointer(svg, 'pointermove', { ...clientAt(svg, 290, 96), altKey: true })
    // free mode: the raw 180 cm displacement, offsets preserved
    expect(plan().points.a).toMatchObject({ x: 283, y: 96 })
    expect(plan().points.b).toMatchObject({ x: 486, y: 96 })
    // Alt released: realigns off the pointer-down reference, not the endpoint
    // nearest the current position
    await pointer(svg, 'pointermove', clientAt(svg, 290, 96))
    await pointer(svg, 'pointerup')
    expect(plan().points.a).toMatchObject({ x: 280, y: 100 })
  })
})

// The moved wall lands its reference within snap tolerance of c (283,102),
// which a group move must ignore.
function wallNearAPoint(): Plan {
  return {
    points: {
      a: { id: 'a', x: 103, y: 96 },
      b: { id: 'b', x: 306, y: 96 },
      c: { id: 'c', x: 283, y: 102 },
      d: { id: 'd', x: 283, y: 500 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
      w2: { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 },
    },
    openings: {},
    roomLabels: {},
  }
}

describe('a group move snaps to the grid only', () => {
  it('ignores an existing point sitting next to the landing position', async () => {
    const { svg, grabZones } = await setup(wallNearAPoint())
    await pointer(grabZones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 110, 96) })
    await pointer(svg, 'pointermove', clientAt(svg, 290, 96))
    await pointer(svg, 'pointerup')
    // the grid intersection, not c (283,102)
    expect(plan().points.a).toMatchObject({ x: 280, y: 100 })
    expect(plan().points.c).toMatchObject({ x: 283, y: 102 })
  })
})

function walledOpenings(): Plan {
  return {
    points: {
      a: { id: 'a', x: 103, y: 96 },
      b: { id: 'b', x: 603, y: 96 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    },
    openings: {
      o1: { id: 'o1', wallId: 'w1', type: 'window', offset: 100, width: 120 },
      o2: { id: 'o2', wallId: 'w1', type: 'window', offset: 300, width: 120 },
    },
    roomLabels: {},
  }
}

describe('a multi-selection grabbed by an opening', () => {
  it('references the nearest wall point of the selection, not the clicked element', async () => {
    const { svg, grabZones } = await setup(walledOpenings())
    const opening = svg.querySelector('rect[width="120"][fill="transparent"]')!
    // grabbed opening has no point of its own, so the reference is the wall's
    // endpoint a (103,96), nearest the grab
    await pointer(grabZones()[0], 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 350, 96) })
    await pointer(opening, 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 203, 96) })
    await pointer(opening, 'pointerdown', { button: 0, ...clientAt(svg, 203, 96) })
    await pointer(svg, 'pointermove', clientAt(svg, 253, 96))
    await pointer(svg, 'pointerup')
    // a + raw delta = (153,96) → (150,100): delta (47,4)
    expect(plan().points.a).toMatchObject({ x: 150, y: 100 })
    expect(plan().points.b).toMatchObject({ x: 650, y: 100 })
  })
})

describe('a selection with no wall point', () => {
  it('drags without error and changes nothing', async () => {
    const { svg } = await setup(walledOpenings())
    const openings = svg.querySelectorAll('rect[width="120"][fill="transparent"]')
    expect(openings).toHaveLength(2)
    await pointer(openings[0], 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 203, 96) })
    await pointer(openings[1], 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 403, 96) })
    const before = plan()
    await pointer(openings[0], 'pointerdown', { button: 0, ...clientAt(svg, 203, 96) })
    await pointer(svg, 'pointermove', clientAt(svg, 260, 140))
    await pointer(svg, 'pointerup')
    expect(plan()).toEqual(before)
  })
})
