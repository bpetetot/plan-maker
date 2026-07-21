import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'
import { wheel, zoomLabel } from './testKit'

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

// The displayed percentage is relative to the default framing (820×620 fitted
// with the min ratio into the window at the last load or Fit). The window
// never resizes here, so expected values read as ratios of framing scales.
// The test screen is 800×600.
const scale = (w: number, h: number) => Math.min(800 / w, 600 / h)
const pct = (w: number, h: number) => `${Math.round((scale(w, h) / scale(820, 620)) * 100)}%`

describe('zoom percentage indicator', () => {
  it('shows 100% for the initial view', async () => {
    await render(<Editor />)
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })

  it('refreshes after a single click on Zoom in', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom in')) // view ×(1/1.25)
    expect(zoomLabel()).toBe(pct(820 / 1.25, 620 / 1.25)) // 125%
  })

  it('refreshes after a single click on Zoom out', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom out')) // view ×1.25
    expect(zoomLabel()).toBe(pct(820 * 1.25, 620 * 1.25)) // 80%
  })

  it('refreshes after a wheel zoom', async () => {
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    await wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 }) // view ×(1/1.08)
    expect(zoomLabel()).toBe(pct(820 / 1.08, 620 / 1.08)) // 108%
  })

  it('refreshes after a single click on Fit to plan', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom in')) // leave the default view
    await userEvent.click(page.getByTitle('Fit to plan')) // empty plan → default view
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })
})
