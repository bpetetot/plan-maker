// Issue 13: a free move (Alt) suspends the alignment snaps (45° axes, grid)
// and keeps the connection ones (existing points, wall bodies).
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { EditorWithHotkeys } from './testHarness'
import { clientAt, key, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.temporal.getState().clear()
})

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

async function setup() {
  usePlanStore.setState({ plan: hostPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
  const { container } = await render(<EditorWithHotkeys />)
  const svg = container.querySelector('svg')!
  await key('2') // Wall tool
  return { svg }
}

// Alt is tracked from key events, so hold it down before the gesture.
const holdAlt = () => key('Alt', { altKey: true })

describe('drawing a wall during a free move', () => {
  it('anchors onto a wall body and splits it, while the free end stays off the grid', async () => {
    const { svg } = await setup()
    await holdAlt()
    // start off-grid and off-axis, end on w1's body at x = 203
    await pointer(svg, 'pointerdown', { button: 0, altKey: true, ...clientAt(svg, 203, 187) })
    await pointer(svg, 'pointerdown', { button: 0, altKey: true, ...clientAt(svg, 203, 3) })

    const junction = Object.values(plan().points).find((p) => p.x === 203 && p.y === 0)
    expect(junction).toBeDefined()
    // w1 split in two at the junction, plus the wall just drawn
    expect(Object.keys(plan().walls)).toHaveLength(3)
    const atJunction = Object.values(plan().walls).filter(
      (w) => w.startPointId === junction!.id || w.endPointId === junction!.id,
    )
    expect(atJunction).toHaveLength(3)
    expect(Object.values(plan().points).some((p) => p.x === 203 && p.y === 187)).toBe(true)
  })
})

describe('dragging a point during a free move', () => {
  it('still merges onto an existing point', async () => {
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
    const { container } = await render(<EditorWithHotkeys />)
    const svg = container.querySelector('svg')!

    // marquee over w2 to reveal its point handles
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 150, 250) })
    await pointer(svg, 'pointermove', clientAt(svg, 450, 350))
    await pointer(svg, 'pointerup')
    const handles = svg.querySelectorAll('circle')
    expect(handles).toHaveLength(2)

    await holdAlt()
    await pointer(handles[1], 'pointerdown', { button: 0, altKey: true, ...clientAt(svg, 400, 300) })
    await pointer(svg, 'pointermove', { altKey: true, ...clientAt(svg, 397, 4) })
    await pointer(svg, 'pointerup')

    expect(plan().points.d).toBeUndefined()
    expect(plan().walls.w2).toMatchObject({ startPointId: 'c', endPointId: 'b' })
  })
})
