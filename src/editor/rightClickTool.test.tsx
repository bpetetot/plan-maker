import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyPlan } from '../model/types'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, mouse, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

const TOOLS = ['Select', 'Wall', 'Door', 'Window'] as const
const activeTool = () =>
  TOOLS.find((label) => page.getByLabelText(label).element().getAttribute('aria-pressed') === 'true')

const wallPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
})

describe('right-click exits the drawing tool', () => {
  it('returns to the Select tool when a drawing tool is active', async () => {
    const { container } = await render(<Editor />)
    await userEvent.click(page.getByLabelText('Wall'))
    expect(activeTool()).toBe('Wall')
    await mouse(container.querySelector('svg')!, 'contextmenu')
    expect(activeTool()).toBe('Select')
  })

  it('ends the wall chain first; a second right-click returns to Select', async () => {
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    await userEvent.click(page.getByLabelText('Wall'))
    await pointer(svg, 'pointerdown', { button: 0, clientX: 400, clientY: 300 })
    expect(page.getByText(/close the room/).element()).toBeTruthy() // chain in progress
    await mouse(svg, 'contextmenu')
    expect(activeTool()).toBe('Wall')
    expect(page.getByText(/start a wall chain/).element()).toBeTruthy() // chain ended
    await mouse(svg, 'contextmenu')
    expect(activeTool()).toBe('Select')
  })

  it('is ignored while a drag is in progress', async () => {
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    await userEvent.click(page.getByLabelText('Wall'))
    await pointer(svg, 'pointerdown', { button: 1, clientX: 400, clientY: 300 }) // middle-button pan
    await mouse(svg, 'contextmenu')
    expect(activeTool()).toBe('Wall')
    await pointer(svg, 'pointerup')
  })

  it('keeps the freshly placed opening selected when leaving the Door tool', async () => {
    usePlanStore.setState({ plan: wallPlan() })
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    await userEvent.click(page.getByLabelText('Door'))
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100))
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) })
    expect(page.getByText('Door', { exact: true }).element()).toBeTruthy() // selection panel is up
    await mouse(svg, 'contextmenu')
    expect(activeTool()).toBe('Select')
    expect(page.getByText('Door', { exact: true }).element()).toBeTruthy() // panel survives the exit
  })

  it('does not clear the selection in the Select tool', async () => {
    usePlanStore.setState({ plan: wallPlan() })
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    // marquee around the wall to select it
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 50, 50) })
    await pointer(svg, 'pointermove', clientAt(svg, 550, 150))
    await pointer(svg, 'pointerup')
    expect(page.getByLabelText('Delete').element()).toBeTruthy() // wall panel is up
    await mouse(svg, 'contextmenu')
    expect(page.getByLabelText('Delete').element()).toBeTruthy() // selection intact
  })

  it('suppresses the native menu but does nothing in the Select tool', async () => {
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    const notCancelled = await mouse(svg, 'contextmenu')
    expect(notCancelled).toBe(false) // preventDefault was called
    expect(activeTool()).toBe('Select')
  })
})
