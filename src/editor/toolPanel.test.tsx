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

describe('tool panel on a selected wall', () => {
  it('shows Interior, Exterior and Thickness for a wall bordering one room', () => {
    const { svg } = setup()
    // bottom wall of the 4×4 m square only
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(panel()).toBeTruthy()
    expect(screen.getByText('Wall')).toBeTruthy()
    expect(rowValue('Interior')).toBe('3,90 m')
    expect(rowValue('Exterior')).toBe('4,10 m')
    expect(screen.getByText('Thickness').nextElementSibling).toHaveProperty('value', '10')
  })

  it('shows a single hors-tout Length when no orientation is claimed', () => {
    const { svg } = setup(standalonePlan())
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(rowValue('Length')).toBe('4,10 m')
    expect(screen.getByText('Thickness').nextElementSibling).toHaveProperty('value', '10')
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

describe('tool panel on selected openings', () => {
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

describe('tool defaults facet', () => {
  it('shows the active tool defaults on an empty selection, nothing in Select', () => {
    setup()
    expect(panel()).toBeNull()
    fireEvent.keyDown(window, { key: '2' })
    expect(panel()).toBeTruthy()
    expect(screen.getByText('Wall')).toBeTruthy()
    const thickness = document.querySelector<HTMLSelectElement>('.panel select')!
    expect(thickness.value).toBe('10')
    expect(screen.queryByLabelText('Delete')).toBeNull()
    fireEvent.keyDown(window, { key: '3' })
    expect(screen.getByText('Door')).toBeTruthy()
    expect(document.querySelector<HTMLSelectElement>('.panel select')!.value).toBe('90')
    expect(screen.getByText('Hinge')).toBeTruthy()
    fireEvent.keyDown(window, { key: '4' })
    expect(screen.getByText('Window')).toBeTruthy()
    expect(document.querySelector<HTMLSelectElement>('.panel select')!.value).toBe('120')
    expect(screen.queryByText('Hinge')).toBeNull()
    fireEvent.keyDown(window, { key: '1' })
    expect(panel()).toBeNull()
  })

  it('draws walls with the preconfigured thickness', () => {
    const { svg } = setup(emptyPlan())
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.change(document.querySelector('.panel select')!, { target: { value: '20' } })
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 0, 0) })
    fireEvent.pointerUp(svg)
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 200, 0) })
    fireEvent.pointerUp(svg)
    const walls = Object.values(usePlanStore.getState().plan.walls)
    expect(walls).toHaveLength(1)
    expect(walls[0].thickness).toBe(20)
  })

  it('places doors with the preconfigured width, hinge and swing', () => {
    const { svg } = setup(standalonePlan())
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.change(document.querySelector('.panel select')!, { target: { value: '80' } })
    fireEvent.click(screen.getByText('Hinge'))
    fireEvent.click(screen.getByText('Swing'))
    fireEvent.pointerMove(svg, clientAt(svg, 200, 0))
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 200, 0) })
    fireEvent.pointerUp(svg)
    const door = Object.values(usePlanStore.getState().plan.openings)[0]
    expect(door).toMatchObject({ type: 'door', width: 80, hingeSide: 'end', swing: 'out' })
  })

  it('adopts the width of an edited selected opening as the tool default (sticky)', () => {
    const { svg } = setup(doorPlan())
    marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    fireEvent.change(document.querySelector('.panel select')!, { target: { value: '100' } })
    fireEvent.keyDown(window, { key: '3' })
    expect(document.querySelector<HTMLSelectElement>('.panel select')!.value).toBe('100')
  })

  it('edits a selected wall thickness and makes it the tool default (sticky)', () => {
    const { svg } = setup(standalonePlan())
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    fireEvent.change(document.querySelector('.panel select')!, { target: { value: '25' } })
    const wall = Object.values(usePlanStore.getState().plan.walls)[0]
    expect(wall.thickness).toBe(25)
    // hors-tout follows the new thickness
    expect(rowValue('Length')).toBe('4,25 m')
    fireEvent.keyDown(window, { key: '2' })
    expect(document.querySelector<HTMLSelectElement>('.panel select')!.value).toBe('25')
  })
})

describe('tool panel visibility', () => {
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

describe('tool panel on a multi-selection', () => {
  it('shows the element count and Delete removes everything', () => {
    const { svg } = setup()
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 450 })
    expect(screen.getByText('4 elements')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(Object.values(usePlanStore.getState().plan.walls)).toHaveLength(0)
    expect(panel()).toBeNull()
  })
})
