// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

function renderDims(plan: Plan, opening: Opening) {
  const { container } = render(
    <svg>
      <PlacementDims plan={plan} opening={opening} />
    </svg>,
  )
  return container
}

describe('PlacementDims', () => {
  it('shows one dimension per side, from each wall end to the near edge of the opening', () => {
    const { plan, opening } = planWith(100, 80)
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['60 cm', '2,60 m'])
  })

  it('hides the side whose segment is 0 cm, measuring from the effective (clamped) offset', () => {
    // stored offset 0 clamps to half the width: the opening sits flush at the
    // wall start, so only the far-side placement dimension remains
    const { plan, opening } = planWith(0, 80)
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['3,20 m'])
  })

  it('sits on the wall dimension line: default side, at the middle of each segment', () => {
    const { plan, opening } = planWith(100, 80)
    const container = renderDims(plan, opening)
    const groups = Array.from(container.querySelectorAll('g[transform]')).map((g) =>
      g.getAttribute('transform'),
    )
    // thickness 10 → offset 18 above the wall, like DimLabel's default
    expect(groups).toEqual(['translate(30,-18) rotate(0)', 'translate(270,-18) rotate(0)'])
  })

  it('follows a custom dimPlacement side', () => {
    const { plan, opening } = planWith(100, 80)
    plan.walls.w.dimPlacement = { t: 0.5, side: 1 }
    const container = renderDims(plan, opening)
    const group = container.querySelector('g[transform]')!
    expect(group.getAttribute('transform')).toBe('translate(30,18) rotate(0)')
  })

  it('measures from the face it runs along when the wall ends at junctions', () => {
    // 4×4 m square room; window (80) centered on the bottom wall. Like any
    // dimension, each side measures what it runs along: the exterior face
    // reaches the miter at -5, the interior face starts at +5.
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    const opening: Opening = { id: 'o', wallId: bottom.id, type: 'window', offset: 200, width: 80 }
    plan.openings.o = opening
    // default side for a horizontal wall: upper — outside the room
    let texts = Array.from(renderDims(plan, opening).querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['1,65 m', '1,65 m'])
    cleanup()
    // dragged inside the room: both sides measure to the interior faces
    bottom.dimPlacement = { t: 0.5, side: 1 }
    texts = Array.from(renderDims(plan, opening).querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['1,55 m', '1,55 m'])
  })

  it('draws a broken line with a tick at each end, dropped when the segment is too short', () => {
    // left segment 10 cm: too short for its text — text only, no line
    const { plan, opening } = planWith(55, 90)
    const container = renderDims(plan, opening)
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['10 cm', '3,00 m'])
    // only the right segment draws lines: 2 line pieces + 2 ticks
    expect(container.querySelectorAll('line')).toHaveLength(4)
  })
})

// A horizontal wall from (100,100) to (500,100) — dimension "4,00 m".
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
  it('shows them on hover and hides the hovered wall dimension, both ways', () => {
    usePlanStore.setState({ plan: editorPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByLabelText('Door'))
    // ghost door (width 90) centered at wall middle: 155 cm on each side
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    expect(screen.queryByText('4,00 m')).toBeNull()
    expect(screen.getAllByText('1,55 m')).toHaveLength(2)
    // leaving the wall restores the wall dimension and drops the placement dimensions
    fireEvent.pointerMove(svg, clientAt(svg, 300, 400))
    expect(screen.getByText('4,00 m')).toBeTruthy()
    expect(screen.queryByText('1,55 m')).toBeNull()
  })
})

describe('placement dimensions while moving an opening', () => {
  it('shows them during the drag, hides only that wall dimension, restores on release', () => {
    const plan = editorPlan()
    plan.walls.w2 = { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 }
    plan.points.c = { id: 'c', x: 100, y: 300 }
    plan.points.d = { id: 'd', x: 400, y: 300 }
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    usePlanStore.setState({ plan })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    // the opening's invisible hit target: its span (120) × 3.2 wall thicknesses
    const hit = container.querySelector('rect[width="120"][height="32"]')!
    fireEvent.pointerDown(hit, { button: 0, ...clientAt(svg, 250, 100) })
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    // opening centered on the wall: 140 cm on each side
    expect(screen.getAllByText('1,40 m')).toHaveLength(2)
    expect(screen.queryByText('4,00 m')).toBeNull()
    expect(screen.getByText('3,00 m')).toBeTruthy() // the other wall keeps its dimension
    fireEvent.pointerUp(svg)
    expect(screen.queryByText('1,40 m')).toBeNull()
    expect(screen.getByText('4,00 m')).toBeTruthy()
  })

  it('does not show them on a plain click — selecting is not moving', () => {
    const plan = editorPlan()
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 }
    usePlanStore.setState({ plan })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const hit = container.querySelector('rect[width="120"][height="32"]')!
    fireEvent.pointerDown(hit, { button: 0, ...clientAt(svg, 150, 100) })
    expect(screen.getByText('4,00 m')).toBeTruthy() // wall dimension never blinks
    fireEvent.pointerUp(svg)
    expect(screen.getByText('4,00 m')).toBeTruthy()
  })
})
