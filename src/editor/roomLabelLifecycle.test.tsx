// @vitest-environment jsdom
// Room label lifecycle on wall gestures (CONTEXT.md: Room label) — an orphan
// label never exists: a wall drag that deforms the room away from its label
// snaps the label to the room's centroid at the end of the gesture, and a
// rigid group move carries a custom-placed label along.
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

// A closed square room (100,100)-(500,500) with a label near its right wall.
function labeledSquare(placed?: true): Plan {
  return {
    points: {
      a: { id: 'a', x: 100, y: 100 },
      b: { id: 'b', x: 500, y: 100 },
      c: { id: 'c', x: 500, y: 500 },
      d: { id: 'd', x: 100, y: 500 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
      w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
      w3: { id: 'w3', startPointId: 'c', endPointId: 'd', thickness: 10 },
      w4: { id: 'w4', startPointId: 'd', endPointId: 'a', thickness: 10 },
    },
    openings: {},
    roomLabels: {
      l1: placed
        ? { id: 'l1', name: 'Kitchen', x: 480, y: 250, placed }
        : { id: 'l1', name: 'Kitchen', x: 480, y: 250 },
    },
  }
}

const label = () => usePlanStore.getState().plan.roomLabels.l1
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length

function setup(placed?: true) {
  usePlanStore.setState({ plan: labeledSquare(placed), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = render(<Editor />)
  const svg = container.querySelector('svg')!
  return { container, svg }
}

function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, a.x, a.y) })
  fireEvent.pointerMove(svg, clientAt(svg, b.x, b.y))
  fireEvent.pointerUp(svg)
}

describe('label reconciliation at the end of a wall gesture', () => {
  it('snaps the label to the room centroid when a point drag deforms the room away from it', () => {
    const { svg } = setup()
    // select the right wall to reveal its point handles
    marqueeSelect(svg, { x: 450, y: 50 }, { x: 550, y: 550 })
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)
    // drag the corner (500,500) to (300,300): the label at (480,250) leaves the room
    fireEvent.pointerDown(handles[1], { button: 0, ...clientAt(svg, 500, 500) })
    fireEvent.pointerMove(svg, clientAt(svg, 300, 300))
    // mid-gesture the label is untouched
    expect(label()).toMatchObject({ x: 480, y: 250 })
    fireEvent.pointerUp(svg)
    // centroid of (100,100) (500,100) (300,300) (100,500), rounded
    expect(label()).toMatchObject({ name: 'Kitchen', x: 233, y: 233 })
    expect(undoDepth()).toBe(1)
  })

  it('moves a custom-placed label with the room on a select-all group move', () => {
    const { svg } = setup(true)
    marqueeSelect(svg, { x: 0, y: 0 }, { x: 600, y: 600 })
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[0]
    fireEvent.pointerDown(wallHit, { button: 0, ...clientAt(svg, 300, 100) })
    fireEvent.pointerMove(svg, clientAt(svg, 350, 150))
    fireEvent.pointerUp(svg)
    expect(label()).toMatchObject({ name: 'Kitchen', x: 530, y: 300, placed: true })
    expect(undoDepth()).toBe(1)
  })
})

describe('default placement follows the live centroid', () => {
  function setupUnlabeled() {
    const base = labeledSquare()
    usePlanStore.setState({ plan: { ...base, roomLabels: {} }, planEpoch: 0 })
    usePlanStore.temporal.getState().clear()
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    return { container, svg }
  }

  const blockTransform = (container: HTMLElement) =>
    container.querySelector('text.room-name')!.closest('g')!.getAttribute('transform')

  it('naming a room does not freeze its block: it tracks the centroid through a wall drag', () => {
    const { container, svg } = setupUnlabeled()
    // name the room: the label is created with default placement
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    const input = container.querySelector<HTMLInputElement>('input.room-name-input')!
    fireEvent.change(input, { target: { value: 'Kitchen' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(usePlanStore.getState().plan.roomLabels).not.toEqual({})

    // drag the right wall inward: the room becomes (100,100)-(250,500)
    const wallHits = svg.querySelectorAll('line[stroke="transparent"]')
    fireEvent.pointerDown(wallHits[1], { button: 0, ...clientAt(svg, 500, 300) })
    fireEvent.pointerMove(svg, clientAt(svg, 250, 300))
    // mid-gesture the block already sits at the live centroid
    expect(blockTransform(container)).toBe('translate(175,300)')
    fireEvent.pointerUp(svg)
    expect(blockTransform(container)).toBe('translate(175,300)')
    // the anchor was reconciled inside the room, still default placement
    const created = Object.values(usePlanStore.getState().plan.roomLabels)[0]
    expect(created).toMatchObject({ name: 'Kitchen', x: 175, y: 300 })
    expect(created.placed).toBeUndefined()
  })
})
