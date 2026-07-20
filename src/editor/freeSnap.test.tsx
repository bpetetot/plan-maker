// @vitest-environment jsdom
// A free move (Alt) filters the snap ladder instead of short-circuiting it
// (issue 13): the alignment targets — 45° axes, grid — are suspended, the
// connection ones — existing points, wall bodies — survive, so a freely drawn
// wall still joins the plan's topology.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

// A single horizontal wall to draw against.
function hostPlan(): Plan {
  return {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
    openings: {},
    roomLabels: {},
  }
}

const plan = () => usePlanStore.getState().plan

function setup() {
  usePlanStore.setState({ plan: hostPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = render(<Editor />)
  const svg = container.querySelector('svg')!
  fireEvent.keyDown(window, { key: '2' }) // Wall tool
  return { svg }
}

// Alt is tracked from key events, so hold it down before the gesture.
const holdAlt = () => fireEvent.keyDown(window, { key: 'Alt', altKey: true })

describe('drawing a wall during a free move', () => {
  it('anchors onto a wall body and splits it, while the free end stays off the grid', () => {
    const { svg } = setup()
    holdAlt()
    // start off-grid and off-axis, end on w1's body at x = 203
    fireEvent.pointerDown(svg, { button: 0, altKey: true, ...clientAt(svg, 203, 187) })
    fireEvent.pointerDown(svg, { button: 0, altKey: true, ...clientAt(svg, 203, 3) })

    const junction = Object.values(plan().points).find((p) => p.x === 203 && p.y === 0)
    expect(junction).toBeDefined()
    // w1 split in two at the junction, plus the wall just drawn
    expect(Object.keys(plan().walls)).toHaveLength(3)
    const atJunction = Object.values(plan().walls).filter(
      (w) => w.startPointId === junction!.id || w.endPointId === junction!.id,
    )
    expect(atJunction).toHaveLength(3)
    // the start, snapped by nothing, kept the raw cursor position
    expect(Object.values(plan().points).some((p) => p.x === 203 && p.y === 187)).toBe(true)
  })
})

describe('dragging a point during a free move', () => {
  it('still merges onto an existing point', () => {
    usePlanStore.setState({
      plan: {
        points: {
          a: { id: 'a', x: 0, y: 0 },
          b: { id: 'b', x: 400, y: 0 },
          c: { id: 'c', x: 200, y: 300 },
          d: { id: 'd', x: 400, y: 300 },
        },
        walls: {
          w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
          w2: { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 },
        },
        openings: {},
        roomLabels: {},
      },
      planEpoch: 0,
    })
    usePlanStore.temporal.getState().clear()
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!

    // select w2 to reveal its point handles, then drag d onto b with Alt held
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 150, 250) })
    fireEvent.pointerMove(svg, clientAt(svg, 450, 350))
    fireEvent.pointerUp(svg)
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)

    holdAlt()
    fireEvent.pointerDown(handles[1], { button: 0, altKey: true, ...clientAt(svg, 400, 300) })
    fireEvent.pointerMove(svg, { altKey: true, ...clientAt(svg, 397, 4) })
    fireEvent.pointerUp(svg)

    expect(plan().points.d).toBeUndefined()
    expect(plan().walls.w2).toMatchObject({ startPointId: 'c', endPointId: 'b' })
  })
})
