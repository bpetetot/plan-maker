import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { buildPlan, squareRoomPlan } from '../model/testHelpers'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, key, pointer } from './testKit'

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

async function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan })
  const { container } = await render(<Editor />)
  const svg = container.querySelector('svg')!
  return { svg }
}

// Marquee selection over plan coordinates — containment capture, no element
// hit-testing needed.
async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) })
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y))
  await pointer(svg, 'pointerup')
}

const panel = () => document.querySelector('.panel')

// The panel rows are read, not operated: a label and its value are two spans
// side by side, which no locator can navigate between.
function rowValue(label: string) {
  const rows = [...document.querySelectorAll('.panel-row')]
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label)
  return row?.querySelector('.panel-row-value')?.textContent
}

// The panel shows at most one preset dropdown — wall thickness or opening
// width, never both.
const presets = () => page.getByRole('combobox')
const presetValue = () => document.querySelector<HTMLSelectElement>('.panel select')!.value

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
  it('shows Interior, Exterior and Thickness for a wall bordering one room', async () => {
    const { svg } = await setup()
    // bottom wall of the 4×4 m square only
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(panel()).toBeTruthy()
    await expect.element(page.getByText('Wall', { exact: true })).toBeInTheDocument()
    expect(rowValue('Interior')).toBe('3,90 m')
    expect(rowValue('Exterior')).toBe('4,10 m')
    expect(presetValue()).toBe('10')
  })

  it('shows a single hors-tout Length when no orientation is claimed', async () => {
    const { svg } = await setup(standalonePlan())
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(rowValue('Length')).toBe('4,10 m')
    expect(presetValue()).toBe('10')
    expect(rowValue('Interior')).toBeUndefined()
    expect(rowValue('Exterior')).toBeUndefined()
  })

  it('updates live while a wall point moves', async () => {
    const { svg } = await setup(standalonePlan())
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(rowValue('Length')).toBe('4,10 m')
    // drag the end-point handle from (400,0) to (500,0)
    const handles = svg.querySelectorAll('circle')
    await pointer(handles[handles.length - 1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 0) })
    await pointer(svg, 'pointermove', clientAt(svg, 500, 0))
    expect(rowValue('Length')).toBe('5,10 m')
    await pointer(svg, 'pointerup')
  })
})

describe('tool panel on selected openings', () => {
  it('shows Width, Hinge/Swing options and Delete for a door', async () => {
    const { svg } = await setup(doorPlan())
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    await expect.element(page.getByText('Door', { exact: true })).toBeInTheDocument()
    expect(presetValue()).toBe('90')
    await expect.element(page.getByText('Hinge')).toBeInTheDocument()
    await expect.element(page.getByText('Swing')).toBeInTheDocument()
    await userEvent.selectOptions(presets(), '80')
    expect(Object.values(usePlanStore.getState().plan.openings)[0].width).toBe(80)
  })

  it('shows Width but no options for a window, and Delete removes it', async () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(100, 100), b.point(500, 100))
      b.opening(wall, 'window', 200)
    })
    const { svg } = await setup(plan)
    await marqueeSelect(svg, { x: 230, y: 60 }, { x: 370, y: 140 })
    await expect.element(page.getByText('Window', { exact: true })).toBeInTheDocument()
    expect(document.querySelector('.panel select')).toBeTruthy()
    await expect.element(page.getByText('Hinge')).not.toBeInTheDocument()
    await userEvent.click(page.getByLabelText('Delete'))
    expect(Object.values(usePlanStore.getState().plan.openings)).toHaveLength(0)
    expect(panel()).toBeNull()
  })
})

describe('tool defaults facet', () => {
  it('shows the active tool defaults on an empty selection, nothing in Select', async () => {
    await setup()
    expect(panel()).toBeNull()
    await key('2')
    expect(panel()).toBeTruthy()
    await expect.element(page.getByText('Wall', { exact: true })).toBeInTheDocument()
    expect(presetValue()).toBe('10')
    await expect.element(page.getByLabelText('Delete')).not.toBeInTheDocument()
    await key('3')
    await expect.element(page.getByText('Door', { exact: true })).toBeInTheDocument()
    expect(presetValue()).toBe('90')
    await expect.element(page.getByText('Hinge')).toBeInTheDocument()
    await key('4')
    await expect.element(page.getByText('Window', { exact: true })).toBeInTheDocument()
    expect(presetValue()).toBe('120')
    await expect.element(page.getByText('Hinge')).not.toBeInTheDocument()
    await key('1')
    expect(panel()).toBeNull()
  })

  it('draws walls with the preconfigured thickness', async () => {
    const { svg } = await setup(emptyPlan())
    await key('2')
    await userEvent.selectOptions(presets(), '20')
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 0, 0) })
    await pointer(svg, 'pointerup')
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) })
    await pointer(svg, 'pointerup')
    const walls = Object.values(usePlanStore.getState().plan.walls)
    expect(walls).toHaveLength(1)
    expect(walls[0].thickness).toBe(20)
  })

  it('places doors with the preconfigured width, hinge and swing', async () => {
    const { svg } = await setup(standalonePlan())
    await key('3')
    await userEvent.selectOptions(presets(), '80')
    await userEvent.click(page.getByText('Hinge'))
    await userEvent.click(page.getByText('Swing'))
    await pointer(svg, 'pointermove', clientAt(svg, 200, 0))
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) })
    await pointer(svg, 'pointerup')
    const door = Object.values(usePlanStore.getState().plan.openings)[0]
    expect(door).toMatchObject({ type: 'door', width: 80, hingeSide: 'end', swing: 'out' })
  })

  it('adopts the width of an edited selected opening as the tool default (sticky)', async () => {
    const { svg } = await setup(doorPlan())
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    await userEvent.selectOptions(presets(), '100')
    await key('3')
    expect(presetValue()).toBe('100')
  })

  it('edits a selected wall thickness and makes it the tool default (sticky)', async () => {
    const { svg } = await setup(standalonePlan())
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    await userEvent.selectOptions(presets(), '25')
    const wall = Object.values(usePlanStore.getState().plan.walls)[0]
    expect(wall.thickness).toBe(25)
    // hors-tout follows the new thickness
    expect(rowValue('Length')).toBe('4,25 m')
    await key('2')
    expect(presetValue()).toBe('25')
  })
})

describe('tool panel visibility', () => {
  it('is hidden on an empty selection and after Escape clears it', async () => {
    const { svg } = await setup()
    expect(panel()).toBeNull()
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(panel()).toBeTruthy()
    await key('Escape')
    expect(panel()).toBeNull()
  })

  it('never steals focus when a selection is made', async () => {
    const { svg } = await setup(doorPlan())
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 })
    expect(panel()).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('tool panel on a multi-selection', () => {
  it('shows the element count and Delete removes everything', async () => {
    const { svg } = await setup()
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 450 })
    await expect.element(page.getByText('4 elements')).toBeInTheDocument()
    await userEvent.click(page.getByLabelText('Delete'))
    expect(Object.values(usePlanStore.getState().plan.walls)).toHaveLength(0)
    expect(panel()).toBeNull()
  })
})
