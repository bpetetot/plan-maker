// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Room } from '../model/rooms'
import { detectRooms } from '../model/rooms'
import { squareRoomPlan } from '../model/testHelpers'
import { emptyPlan } from '../model/types'
import type { Opening, Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { PlacementDims } from './render'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

// A single horizontal wall from (0,0) to (400,0), thickness 10, carrying one
// window of the given center offset and width.
function planWith(offset: number, width: number): { plan: Plan; opening: Opening } {
  const opening: Opening = { id: 'o', wallId: 'w', type: 'window', offset, width }
  const plan: Plan = {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: { w: { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 } },
    openings: { o: opening },
    roomLabels: {},
  }
  return { plan, opening }
}

function renderDims(plan: Plan, opening: Opening, rooms: Room[] = [], pxPerCm = 1) {
  const { container } = render(
    <svg>
      <PlacementDims plan={plan} opening={opening} rooms={rooms} pxPerCm={pxPerCm} />
    </svg>,
  )
  return container
}

describe('PlacementDims', () => {
  it('shows one dimension per side, from each silhouette end to the near edge of the opening', () => {
    // free-standing wall: the silhouette overhangs each Point by 5
    const { plan, opening } = planWith(100, 80)
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['65 cm', '2,65 m'])
  })

  it('hides the side whose segment is 0 cm, measuring from the effective (clamped) offset', () => {
    // stored offset 0 clamps to half the width: the opening sits flush at the
    // wall start, where the interior face begins — only the far side remains
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    const opening: Opening = { id: 'o', wallId: bottom.id, type: 'window', offset: 0, width: 80 }
    plan.openings.o = opening
    const container = renderDims(plan, opening, detectRooms(plan))
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['3,15 m'])
  })

  it('centres a chip on each clearance, on the wall axis — never on a side', () => {
    const { plan, opening } = planWith(100, 80)
    const container = renderDims(plan, opening)
    const groups = Array.from(container.querySelectorAll('g[transform]')).map((g) =>
      g.getAttribute('transform'),
    )
    // segments run from the overhang (-5) to the opening edges (60 / 140); the
    // chips sit at their middles, on the axis itself (y = 0), not offset above
    expect(groups).toEqual(['translate(27.5,0) rotate(0) scale(1)', 'translate(272.5,0) rotate(0) scale(1)'])
    // filled accent chip, no dimension line and no ticks
    expect(container.querySelectorAll('line')).toHaveLength(0)
    expect(container.querySelector('rect')!.getAttribute('fill')).toBe('var(--accent)')
  })

  it('keeps its position when the wall dimension is dragged to the other side', () => {
    const { plan, opening } = planWith(100, 80)
    plan.walls.w.dimPlacement = { t: 0.5, side: 1 }
    const container = renderDims(plan, opening)
    const group = container.querySelector('g[transform]')!
    expect(group.getAttribute('transform')).toBe('translate(27.5,0) rotate(0) scale(1)')
  })

  it('reads the interior side when the wall borders exactly one room, and only the value', () => {
    // 4×4 m square room; window (80) centered on the bottom wall. Whatever
    // side the wall's Dimension sits on, the placement dimensions measure on
    // the interior side: from the interior face corners at +5/395.
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    const opening: Opening = { id: 'o', wallId: bottom.id, type: 'window', offset: 200, width: 80 }
    plan.openings.o = opening
    const rooms = detectRooms(plan)
    // default Dimension side for a horizontal wall: upper — outside the room
    let container = renderDims(plan, opening, rooms)
    let texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['1,55 m', '1,55 m'])
    // the side chose the value; the chip still sits on the axis
    expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe(
      'translate(82.5,0) rotate(0) scale(1)',
    )
    cleanup()
    // dragging the Dimension outside changes nothing for placement dims
    bottom.dimPlacement = { t: 0.5, side: -1 }
    container = renderDims(plan, opening, rooms)
    texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['1,55 m', '1,55 m'])
  })

  it('holds the same size on screen at every zoom, without moving its centre', () => {
    const { plan, opening } = planWith(100, 80)
    // zoomed out to half scale: the chip doubles in plan units to keep its
    // on-screen size, and its centre stays on the clearance (ADR 0005)
    const container = renderDims(plan, opening, [], 0.5)
    expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe(
      'translate(27.5,0) rotate(0) scale(2)',
    )
    const rect = container.querySelector('rect')!
    expect(rect.getAttribute('height')).toBe('16')
  })

  it('chains from the near edge of the closest neighbouring opening', () => {
    // window (80) at 100 with a neighbour (60) at 250: the end-side segment
    // runs between the two openings' facing edges (140 → 220), the start
    // side still reaches the silhouette end (-5)
    const { plan, opening } = planWith(100, 80)
    plan.openings.n = { id: 'n', wallId: 'w', type: 'window', offset: 250, width: 60 }
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['65 cm', '80 cm'])
  })

  it('hides a side reduced to nothing by an adjacent neighbouring opening', () => {
    // neighbour flush against the manipulated opening: the gap is 0 cm
    const { plan, opening } = planWith(100, 80)
    plan.openings.n = { id: 'n', wallId: 'w', type: 'window', offset: 180, width: 80 }
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['65 cm'])
  })

  it('overflows a clearance too short for its chip, rather than shrinking or shifting it', () => {
    // left clearance 20 cm, narrower than the chip that measures it
    const { plan, opening } = planWith(60, 90)
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['20 cm', '3,00 m'])
    const [short, long] = Array.from(container.querySelectorAll('rect'))
    // same height and the same per-character width rule on both: nothing shrank
    expect(Number(short.getAttribute('width'))).toBeGreaterThan(20)
    expect(short.getAttribute('height')).toBe(long.getAttribute('height'))
    // and the short chip stayed centred on its clearance (-5 → 15)
    expect(short.parentElement!.getAttribute('transform')).toBe('translate(5,0) rotate(0) scale(1)')
  })
})

// A horizontal wall from (100,100) to (500,100) — dimension "4,10 m"
// (hors-tout: 400 axis + 10 thickness, both ends free).
const editorPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
})

describe('placement dimensions while placing an opening', () => {
  it('shows them on hover while the wall keeps its own dimension, both ways', () => {
    usePlanStore.setState({ plan: editorPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByLabelText('Door'))
    // ghost door (width 90) centered at wall middle: 160 cm on each side,
    // from the opening edge to the silhouette overhang
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    expect(screen.getByText('4,10 m')).toBeTruthy() // the two registers coexist
    expect(screen.getAllByText('1,60 m')).toHaveLength(2)
    // leaving the wall drops the placement dimensions
    fireEvent.pointerMove(svg, clientAt(svg, 300, 400))
    expect(screen.getByText('4,10 m')).toBeTruthy()
    expect(screen.queryByText('1,60 m')).toBeNull()
  })
})

describe('placement dimensions while moving an opening', () => {
  it('shows them during the drag without touching any wall dimension', () => {
    const plan = editorPlan()
    plan.walls.w2 = { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 }
    plan.points.c = { id: 'c', x: 100, y: 300 }
    plan.points.d = { id: 'd', x: 400, y: 300 }
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    usePlanStore.setState({ plan })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    // the opening's grab zone: the only transparent rect spanning its width
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!
    fireEvent.pointerDown(grab, { button: 0, ...clientAt(svg, 250, 100) })
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    // opening centered on the wall: 145 cm on each side (to the overhangs)
    expect(screen.getAllByText('1,45 m')).toHaveLength(2)
    expect(screen.getByText('4,10 m')).toBeTruthy()
    expect(screen.getByText('3,10 m')).toBeTruthy()
  })

  it('continues past the release, because the drag leaves the opening selected', () => {
    const plan = editorPlan()
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    usePlanStore.setState({ plan })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!
    fireEvent.pointerDown(grab, { button: 0, ...clientAt(svg, 250, 100) })
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    fireEvent.pointerUp(svg)
    // no transition: the same chips simply keep existing
    expect(screen.getAllByText('1,45 m')).toHaveLength(2)
  })
})

describe('placement dimensions on the selection', () => {
  // two windows (120) on the same wall, at 150 and 300
  const twoOpeningsPlan = (): Plan => {
    const plan = editorPlan()
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    plan.openings.o2 = { id: 'o2', wallId: 'w1', type: 'window', offset: 300, width: 120 }
    return plan
  }

  it('shows them on a plain click — a selected opening keeps its chips', () => {
    usePlanStore.setState({ plan: editorPlan() })
    const plan = usePlanStore.getState().plan
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    usePlanStore.setState({ plan: { ...plan } })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!
    fireEvent.pointerDown(grab, { button: 0, ...clientAt(svg, 150, 100) })
    fireEvent.pointerUp(svg)
    // from the silhouette overhang (-5) to each edge: 95 cm and 1,95 m
    expect(screen.getByText('95 cm')).toBeTruthy()
    expect(screen.getByText('1,95 m')).toBeTruthy()
    expect(screen.getByText('4,10 m')).toBeTruthy() // and the wall dimension stays
  })

  it('shows them for every opening of a multi-selection, with no cardinality threshold', () => {
    usePlanStore.setState({ plan: twoOpeningsPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const [g1, g2] = Array.from(container.querySelectorAll('rect[width="120"][fill="transparent"]'))
    fireEvent.pointerDown(g1, { button: 0, ...clientAt(svg, 150, 100) })
    fireEvent.pointerUp(svg)
    fireEvent.pointerDown(g2, { button: 0, shiftKey: true, ...clientAt(svg, 300, 100) })
    fireEvent.pointerUp(svg)
    // o1 (edges 90/210): 95 cm to the overhang, then 30 cm to o2 (edges
    // 240/360) — o2 chains from the same 30 cm gap, then 45 cm to its overhang
    expect(screen.getByText('95 cm')).toBeTruthy()
    expect(screen.getAllByText('30 cm')).toHaveLength(2)
    expect(screen.getByText('45 cm')).toBeTruthy()
  })

  it('stays silent for the openings a selected wall carries', () => {
    usePlanStore.setState({ plan: twoOpeningsPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    // click the wall away from both openings
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 480, 100) })
    fireEvent.pointerUp(svg)
    expect(screen.getByText('4,10 m')).toBeTruthy()
    expect(screen.queryByText('95 cm')).toBeNull()
    expect(screen.queryByText('90 cm')).toBeNull()
  })
})
