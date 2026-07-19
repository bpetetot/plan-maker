// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildPlan, squareRoomPlan } from '../model/testHelpers'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan })
  const { container } = render(<Editor />)
  const svg = container.querySelector('svg')!
  return { svg }
}

// Marquee selection over plan coordinates — containment capture, no element
// hit-testing needed.
function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, a.x, a.y) })
  fireEvent.pointerMove(svg, clientAt(svg, b.x, b.y))
  fireEvent.pointerUp(svg)
}

const panel = () => document.querySelector('.panel')

// Value shown on the panel row with the given label.
function rowValue(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent
}

const standalonePlan = () =>
  buildPlan((b) => {
    b.wall(b.point(0, 0), b.point(400, 0))
  })

const doorPlan = () =>
  buildPlan((b) => {
    const wall = b.wall(b.point(100, 100), b.point(500, 100))
    b.opening(wall, 'door', 200)
  })

describe('selection panel on a wall', () => {
  it('shows Interior, Exterior and Thickness for a wall bordering one room', () => {
    const { svg } = setup()
    // bottom wall of the 4×4 m square only
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(panel()).toBeTruthy()
    expect(screen.getByText('Wall')).toBeTruthy()
    expect(rowValue('Interior')).toBe('3,90 m')
    expect(rowValue('Exterior')).toBe('4,10 m')
    expect(rowValue('Thickness')).toBe('10 cm')
  })

  it('shows a single hors-tout Length when no orientation is claimed', () => {
    const { svg } = setup(standalonePlan())
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(rowValue('Length')).toBe('4,10 m')
    expect(rowValue('Thickness')).toBe('10 cm')
    expect(screen.queryByText('Interior')).toBeNull()
    expect(screen.queryByText('Exterior')).toBeNull()
  })

  it('updates live while a wall point moves', () => {
    const { svg } = setup(standalonePlan())
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(rowValue('Length')).toBe('4,10 m')
    // drag the end-point handle from (400,0) to (500,0)
    const handles = svg.querySelectorAll('circle')
    fireEvent.pointerDown(handles[handles.length - 1], { button: 0, ...clientAt(svg, 400, 0) })
    fireEvent.pointerMove(svg, clientAt(svg, 500, 0))
    expect(rowValue('Length')).toBe('5,10 m')
    fireEvent.pointerUp(svg)
  })
})

describe('selection panel on openings', () => {
  it('shows Width, Hinge/Swing options and Delete for a door', () => {
    const { svg } = setup(doorPlan())
    marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    expect(screen.getByText('Door')).toBeTruthy()
    const select = document.querySelector<HTMLSelectElement>('.panel select')!
    expect(select.value).toBe('90')
    expect(screen.getByText('Hinge')).toBeTruthy()
    expect(screen.getByText('Swing')).toBeTruthy()
    fireEvent.change(select, { target: { value: '80' } })
    expect(Object.values(usePlanStore.getState().plan.openings)[0].width).toBe(80)
  })

  it('shows Width but no options for a window, and Delete removes it', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(100, 100), b.point(500, 100))
      b.opening(wall, 'window', 200)
    })
    const { svg } = setup(plan)
    marqueeSelect(svg, { x: 230, y: 60 }, { x: 370, y: 140 })
    expect(screen.getByText('Window')).toBeTruthy()
    expect(document.querySelector('.panel select')).toBeTruthy()
    expect(screen.queryByText('Hinge')).toBeNull()
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(Object.values(usePlanStore.getState().plan.openings)).toHaveLength(0)
    expect(panel()).toBeNull()
  })
})

describe('selection panel visibility', () => {
  it('is hidden on an empty selection and after Escape clears it', () => {
    const { svg } = setup()
    expect(panel()).toBeNull()
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(panel()).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel()).toBeNull()
  })

  it('never steals focus when a selection is made', () => {
    const { svg } = setup(doorPlan())
    marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    expect(panel()).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('selection panel on a multi-selection', () => {
  it('shows the element count and Delete removes everything', () => {
    const { svg } = setup()
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 450 })
    expect(screen.getByText('4 elements')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(Object.values(usePlanStore.getState().plan.walls)).toHaveLength(0)
    expect(panel()).toBeNull()
  })
})
