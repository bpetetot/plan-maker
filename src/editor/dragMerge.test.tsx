// Coincident points merge at drag end (ADR 0003): the stationary point survives.
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.temporal.getState().clear()
})

// Free ends b (500,100) and c (500,200) do not touch yet.
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

async function setup() {
  usePlanStore.setState({ plan: openCorner(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = await render(<Editor />)
  const svg = container.querySelector('svg')!
  return { svg }
}

async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) })
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y))
  await pointer(svg, 'pointerup')
}

describe('point drag ending on another point', () => {
  it('merges the dragged point into the stationary one, in one history entry', async () => {
    const { svg } = await setup()
    await marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)
    // drag c (500,200) onto b (500,100)
    await pointer(handles[0], 'pointerdown', { button: 0, ...clientAt(svg, 500, 200) })
    await pointer(svg, 'pointermove', clientAt(svg, 500, 100))
    await pointer(svg, 'pointerup')
    expect(plan().points.c).toBeUndefined()
    expect(plan().points.b).toMatchObject({ x: 500, y: 100 })
    expect(plan().walls.w2).toMatchObject({ startPointId: 'b', endPointId: 'e' })
    expect(undoDepth()).toBe(1)
  })
})

describe('group move ending point-on-point', () => {
  it('merges the moved wall end into the stationary point', async () => {
    const { svg } = await setup()
    // w2 up by 100: c lands on b
    await marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[1]
    await pointer(wallHit, 'pointerdown', { button: 0, ...clientAt(svg, 500, 350) })
    await pointer(svg, 'pointermove', clientAt(svg, 500, 250))
    await pointer(svg, 'pointerup')
    expect(plan().points.c).toBeUndefined()
    expect(plan().walls.w2).toMatchObject({ startPointId: 'b', endPointId: 'e' })
    expect(plan().points.e).toMatchObject({ x: 500, y: 400 })
    expect(undoDepth()).toBe(1)
  })

  it('restores the exact pre-drag plan on a single undo', async () => {
    const { svg } = await setup()
    await marqueeSelect(svg, { x: 450, y: 150 }, { x: 550, y: 550 })
    const before = plan()
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[1]
    await pointer(wallHit, 'pointerdown', { button: 0, ...clientAt(svg, 500, 350) })
    await pointer(svg, 'pointermove', clientAt(svg, 500, 250))
    await pointer(svg, 'pointerup')
    expect(plan().points.c).toBeUndefined()
    usePlanStore.temporal.getState().undo()
    expect(plan()).toEqual(before)
  })
})
