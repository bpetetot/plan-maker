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

// Percentage = ratio to the default 820×620 framing, fitted with the min ratio
// into the fixed 800×600 test screen.
const scale = (w: number, h: number) => Math.min(800 / w, 600 / h)
const pct = (w: number, h: number) => `${Math.round((scale(w, h) / scale(820, 620)) * 100)}%`

describe('zoom percentage indicator', () => {
  it('shows 100% for the initial view', async () => {
    await render(<Editor />)
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })

  it('refreshes after a single click on Zoom in', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom in'))
    expect(zoomLabel()).toBe(pct(820 / 1.25, 620 / 1.25)) // 125%
  })

  it('refreshes after a single click on Zoom out', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom out'))
    expect(zoomLabel()).toBe(pct(820 * 1.25, 620 * 1.25)) // 80%
  })

  it('refreshes after a wheel zoom', async () => {
    const { container } = await render(<Editor />)
    const svg = container.querySelector('svg')!
    await wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 })
    expect(zoomLabel()).toBe(pct(820 / 1.08, 620 / 1.08)) // 108%
  })

  it('refreshes after a single click on Fit to plan', async () => {
    await render(<Editor />)
    await userEvent.click(page.getByLabelText('Zoom in'))
    await userEvent.click(page.getByTitle('Fit to plan'))
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })
})
