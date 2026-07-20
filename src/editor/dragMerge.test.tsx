// @vitest-environment jsdom
// Coincident points merge at the end of a drag (ADR 0003): a point dropped
// onto another becomes one shared Point — the stationary point survives — so
// a loop closed by a drag is detected as a Room.
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

// Two walls whose free ends b (500,100) and c (500,200) do not touch yet.
function openCorner(): Plan {
  return {
    points: {
      a: { id: 'a', x: 100, y: 100 },
      b: { id: 'b', x: 500, y: 100 },
      c: { id: 'c', x: 500, y: 200 },
      e: { id: 'e', x: 500, y: 500 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
      w2: { id: 'w2', startPointId: 'c', endPointId: 'e', thickness: 10 },
    },
    openings: {},
    roomLabels: {},
  }
}

const plan = () => usePlanStore.getState().plan
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length

function setup() {
  usePlanStore.setState({ plan: openCorner(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = render(<Editor />)
  const svg = container.querySelector('svg')!
  return { svg }
}

function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, a.x, a.y) })
  fireEvent.pointerMove(svg, clientAt(svg, b.x, b.y))
  fireEvent.pointerUp(svg)
}

describe('point drag ending on another point', () => {
  it('merges the dragged point into the stationary one, in one history entry', () => {
    const { svg } = setup()
    // select w2 to reveal its point handles
    marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)
    // drag c (500,200) onto b (500,100)
    fireEvent.pointerDown(handles[0], { button: 0, ...clientAt(svg, 500, 200) })
    fireEvent.pointerMove(svg, clientAt(svg, 500, 100))
    fireEvent.pointerUp(svg)
    expect(plan().points.c).toBeUndefined()
    expect(plan().points.b).toMatchObject({ x: 500, y: 100 })
    expect(plan().walls.w2).toMatchObject({ startPointId: 'b', endPointId: 'e' })
    expect(undoDepth()).toBe(1)
  })
})

describe('group move ending point-on-point', () => {
  it('merges the moved wall end into the stationary point', () => {
    const { svg } = setup()
    // select w2 and move it up by 100: c lands on b
    marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[1]
    fireEvent.pointerDown(wallHit, { button: 0, ...clientAt(svg, 500, 350) })
    fireEvent.pointerMove(svg, clientAt(svg, 500, 250))
    fireEvent.pointerUp(svg)
    expect(plan().points.c).toBeUndefined()
    expect(plan().walls.w2).toMatchObject({ startPointId: 'b', endPointId: 'e' })
    expect(plan().points.e).toMatchObject({ x: 500, y: 400 })
    expect(undoDepth()).toBe(1)
  })

  it('restores the exact pre-drag plan on a single undo', () => {
    const { svg } = setup()
    marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const before = plan()
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[1]
    fireEvent.pointerDown(wallHit, { button: 0, ...clientAt(svg, 500, 350) })
    fireEvent.pointerMove(svg, clientAt(svg, 500, 250))
    fireEvent.pointerUp(svg)
    expect(plan().points.c).toBeUndefined()
    usePlanStore.temporal.getState().undo()
    expect(plan()).toEqual(before)
  })
})
