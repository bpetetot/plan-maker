// Planar insertion at the end of a drag, extending ADR 0002: drop on a body
// splits it (T), crossing splits both (X) — one history entry per gesture.
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.temporal.getState().clear()
})

// A long horizontal wall and a detached vertical wall below it.
function tPlan(): Plan {
  return {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
      c: { id: 'c', x: 200, y: 100 },
      d: { id: 'd', x: 200, y: 300 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
      w2: { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 },
    },
    openings: {},
    roomLabels: {},
  }
}

const plan = () => usePlanStore.getState().plan
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length

async function setup() {
  usePlanStore.setState({ plan: tPlan(), planEpoch: 0 })
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

describe('point drag ending on a wall body', () => {
  it('splits the host wall at the dropped point (T junction), in one history entry', async () => {
    const { svg } = await setup()
    await marqueeSelect(svg, { x: 150, y: 50 }, { x: 250, y: 350 })
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)
    // drag c (200,100) onto w1's body at (200,0)
    await pointer(handles[0], 'pointerdown', { button: 0, ...clientAt(svg, 200, 100) })
    await pointer(svg, 'pointermove', clientAt(svg, 200, 0))
    await pointer(svg, 'pointerup')
    expect(plan().points.c).toMatchObject({ x: 200, y: 0 })
    expect(Object.keys(plan().walls)).toHaveLength(3)
    expect(plan().walls.w1).toMatchObject({ startPointId: 'a', endPointId: 'c' })
    const endHalf = Object.values(plan().walls).find((w) => w.startPointId === 'c' && w.endPointId === 'b')
    expect(endHalf).toBeDefined()
    expect(undoDepth()).toBe(1)
  })
})

describe('group move ending wall-across-wall', () => {
  it('splits both walls at the crossing (X junction), in one history entry', async () => {
    const { svg } = await setup()
    // w2 moved up 150: spans (200,-50)→(200,150), crossing w1 at (200,0)
    await marqueeSelect(svg, { x: 150, y: 150 }, { x: 250, y: 350 })
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[1]
    await pointer(wallHit, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) })
    await pointer(svg, 'pointermove', clientAt(svg, 200, 50))
    await pointer(svg, 'pointerup')
    const cross = Object.values(plan().points).find((p) => p.x === 200 && p.y === 0)!
    expect(cross).toBeDefined()
    expect(Object.keys(plan().walls)).toHaveLength(4)
    const atCross = Object.values(plan().walls).filter(
      (w) => w.startPointId === cross.id || w.endPointId === cross.id,
    )
    expect(atCross).toHaveLength(4)
    expect(undoDepth()).toBe(1)
  })
})
