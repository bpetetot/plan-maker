// @vitest-environment jsdom
// Room text block UX: drag the area text without naming the room, inline
// Excalidraw-style name editing on double-click, empty text clears the name
// only, and the block never leaves its room — the drag clamps to its polygon.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptySquare(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

// A closed square room (100,100)-(500,500); centroid at (300,300).
function emptySquare(label?: { name: string; x: number; y: number }): Plan {
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
    roomLabels: label ? { l1: { id: 'l1', ...label } } : {},
  }
}

const plan = () => usePlanStore.getState().plan
const labels = () => Object.values(plan().roomLabels)
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length

function setup(label?: { name: string; x: number; y: number }) {
  usePlanStore.setState({ plan: emptySquare(label), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = render(<Editor />)
  const svg = container.querySelector('svg')!
  const areaBlock = () => container.querySelector('rect.room-area-hit')!
  const nameInput = () => container.querySelector<HTMLInputElement>('input.room-name-input')
  return { container, svg, areaBlock, nameInput }
}

describe('inline room-name editing', () => {
  it('double-clicking a room opens the inline input; Enter commits the name', () => {
    const { svg, nameInput } = setup()
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    const input = nameInput()!
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Kitchen' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(nameInput()).toBeNull()
    expect(labels()).toHaveLength(1)
    expect(labels()[0]).toMatchObject({ name: 'Kitchen', x: 300, y: 300 })
    expect(undoDepth()).toBe(1)
  })

  it('Escape cancels without touching the plan', () => {
    const { svg, nameInput } = setup()
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    const input = nameInput()!
    fireEvent.change(input, { target: { value: 'Kitchen' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(nameInput()).toBeNull()
    expect(labels()).toHaveLength(0)
    expect(undoDepth()).toBe(0)
  })

  it('committing an empty name on an unlabeled room creates nothing', () => {
    const { svg, nameInput } = setup()
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    fireEvent.keyDown(nameInput()!, { key: 'Enter' })
    expect(labels()).toHaveLength(0)
    expect(undoDepth()).toBe(0)
  })

  it('emptying the text clears the name but keeps the marker in place', () => {
    const { svg, nameInput } = setup({ name: 'Kitchen', x: 250, y: 260 })
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    const input = nameInput()!
    expect(input.value).toBe('Kitchen')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(labels()[0]).toMatchObject({ name: '', x: 250, y: 260 })
    expect(undoDepth()).toBe(1)
  })

  it('committing the unchanged name leaves no undo entry', () => {
    const { svg, nameInput } = setup({ name: 'Kitchen', x: 300, y: 300 })
    fireEvent.doubleClick(svg, clientAt(svg, 300, 300))
    fireEvent.keyDown(nameInput()!, { key: 'Enter' })
    expect(undoDepth()).toBe(0)
  })
})

describe('a room inside a room', () => {
  // The bug's plan: outer room (130,40)-(520,430) labeled 'AAA', with a
  // disconnected island room (250,80)-(400,180) inside it.
  function nestedRooms(): Plan {
    return {
      points: {
        a: { id: 'a', x: 130, y: 40 },
        b: { id: 'b', x: 520, y: 40 },
        c: { id: 'c', x: 520, y: 430 },
        d: { id: 'd', x: 130, y: 430 },
        e: { id: 'e', x: 250, y: 80 },
        f: { id: 'f', x: 400, y: 80 },
        g: { id: 'g', x: 400, y: 180 },
        h: { id: 'h', x: 250, y: 180 },
      },
      walls: {
        w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
        w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
        w3: { id: 'w3', startPointId: 'c', endPointId: 'd', thickness: 10 },
        w4: { id: 'w4', startPointId: 'd', endPointId: 'a', thickness: 10 },
        w5: { id: 'w5', startPointId: 'e', endPointId: 'f', thickness: 10 },
        w6: { id: 'w6', startPointId: 'f', endPointId: 'g', thickness: 10 },
        w7: { id: 'w7', startPointId: 'g', endPointId: 'h', thickness: 10 },
        w8: { id: 'w8', startPointId: 'h', endPointId: 'e', thickness: 10 },
      },
      openings: {},
      roomLabels: { l1: { id: 'l1', name: 'AAA', x: 325, y: 235 } },
    }
  }

  function setupNested() {
    usePlanStore.setState({ plan: nestedRooms(), planEpoch: 0 })
    usePlanStore.temporal.getState().clear()
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const nameInput = () => container.querySelector<HTMLInputElement>('input.room-name-input')
    return { svg, nameInput }
  }

  it('double-clicking inside the inner room edits its own label, not the outer one', () => {
    const { svg, nameInput } = setupNested()
    fireEvent.doubleClick(svg, clientAt(svg, 325, 130))
    const input = nameInput()!
    expect(input).toBeTruthy()
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: 'Cellier' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const all = labels()
    expect(all).toHaveLength(2)
    expect(all.find((l) => l.name === 'Cellier')).toMatchObject({ x: 325, y: 130 })
    expect(all.find((l) => l.name === 'AAA')).toMatchObject({ x: 325, y: 235 })
  })

  it('double-clicking in the outer room still edits the outer label', () => {
    const { svg, nameInput } = setupNested()
    fireEvent.doubleClick(svg, clientAt(svg, 200, 350))
    expect(nameInput()!.value).toBe('AAA')
  })
})

describe('dragging the area text', () => {
  it('a drag on an unlabeled room creates a nameless label in one undo entry', () => {
    const { svg, areaBlock } = setup()
    fireEvent.pointerDown(areaBlock(), { button: 0, ...clientAt(svg, 300, 300) })
    fireEvent.pointerMove(svg, clientAt(svg, 350, 320))
    fireEvent.pointerUp(svg)
    expect(labels()).toHaveLength(1)
    expect(labels()[0]).toMatchObject({ name: '', x: 350, y: 320 })
    expect(undoDepth()).toBe(1)
  })

  it('a plain click on the area text does nothing', () => {
    const { svg, areaBlock } = setup()
    fireEvent.pointerDown(areaBlock(), { button: 0, ...clientAt(svg, 300, 300) })
    fireEvent.pointerUp(svg)
    expect(labels()).toHaveLength(0)
    expect(undoDepth()).toBe(0)
    expect(document.querySelector('.panel')).toBeNull()
  })

  it('the block cannot leave its room: a drag past a wall clamps to the boundary', () => {
    const { svg, areaBlock } = setup()
    fireEvent.pointerDown(areaBlock(), { button: 0, ...clientAt(svg, 300, 300) })
    fireEvent.pointerMove(svg, clientAt(svg, 700, 300))
    fireEvent.pointerUp(svg)
    expect(labels()).toHaveLength(1)
    // clamped to the wall at x=500, nudged one unit inside
    expect(labels()[0]).toMatchObject({ name: '', x: 499, y: 300 })
    expect(undoDepth()).toBe(1)
  })

  it('an existing label clamps to its room too', () => {
    const { svg, areaBlock } = setup({ name: 'Kitchen', x: 300, y: 300 })
    fireEvent.pointerDown(areaBlock(), { button: 0, ...clientAt(svg, 300, 300) })
    fireEvent.pointerMove(svg, clientAt(svg, 700, 300))
    fireEvent.pointerUp(svg)
    expect(labels()[0]).toMatchObject({ name: 'Kitchen', x: 499, y: 300 })
  })

  it('a label outside any room (defensive: unreachable via plan operations) drags freely', () => {
    const { container, svg } = setup({ name: 'Kitchen', x: 700, y: 300 })
    const nameBlock = container.querySelector('rect.room-name-hit')!
    fireEvent.pointerDown(nameBlock, { button: 0, ...clientAt(svg, 700, 300) })
    fireEvent.pointerMove(svg, clientAt(svg, 650, 200))
    fireEvent.pointerUp(svg)
    expect(labels()[0]).toMatchObject({ name: 'Kitchen', x: 650, y: 200 })
  })
})
