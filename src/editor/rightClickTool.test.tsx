// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { emptyPlan } from '../model/types'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

const TOOLS = ['Select', 'Wall', 'Door', 'Window'] as const
const activeTool = () =>
  TOOLS.find((label) => screen.getByLabelText(label).getAttribute('aria-pressed') === 'true')

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
  it('returns to the Select tool when a drawing tool is active', () => {
    const { container } = render(<Editor />)
    fireEvent.click(screen.getByLabelText('Wall'))
    expect(activeTool()).toBe('Wall')
    fireEvent.contextMenu(container.querySelector('svg')!)
    expect(activeTool()).toBe('Select')
  })

  it('ends the wall chain first; a second right-click returns to Select', () => {
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByLabelText('Wall'))
    fireEvent.pointerDown(svg, { button: 0, clientX: 400, clientY: 300 })
    expect(screen.getByText(/close the room/)).toBeTruthy() // chain in progress
    fireEvent.contextMenu(svg)
    expect(activeTool()).toBe('Wall')
    expect(screen.getByText(/start a wall chain/)).toBeTruthy() // chain ended
    fireEvent.contextMenu(svg)
    expect(activeTool()).toBe('Select')
  })

  it('is ignored while a drag is in progress', () => {
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByLabelText('Wall'))
    fireEvent.pointerDown(svg, { button: 1, clientX: 400, clientY: 300 }) // middle-button pan
    fireEvent.contextMenu(svg)
    expect(activeTool()).toBe('Wall')
    fireEvent.pointerUp(svg)
  })

  it('keeps the freshly placed opening selected when leaving the Door tool', () => {
    usePlanStore.setState({ plan: wallPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByLabelText('Door'))
    fireEvent.pointerMove(svg, clientAt(svg, 300, 100))
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 300, 100) })
    expect(screen.getByText('Door')).toBeTruthy() // actions popover is up
    fireEvent.contextMenu(svg)
    expect(activeTool()).toBe('Select')
    expect(screen.getByText('Door')).toBeTruthy() // popover survives the exit
  })

  it('does not clear the selection in the Select tool', () => {
    usePlanStore.setState({ plan: wallPlan() })
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    // marquee around the wall to select it
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 50, 50) })
    fireEvent.pointerMove(svg, clientAt(svg, 550, 150))
    fireEvent.pointerUp(svg)
    expect(screen.getByLabelText('Delete')).toBeTruthy() // wall popover is up
    fireEvent.contextMenu(svg)
    expect(screen.getByLabelText('Delete')).toBeTruthy() // selection intact
  })

  it('suppresses the native menu but does nothing in the Select tool', () => {
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    const notCancelled = fireEvent.contextMenu(svg)
    expect(notCancelled).toBe(false) // preventDefault was called
    expect(activeTool()).toBe('Select')
  })
})
