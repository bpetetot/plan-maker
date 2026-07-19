// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'
import { installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

// The displayed percentage is relative to the default framing: 100% when the
// view frames DEFAULT_VIEW (820×620) in the window — same min-ratio ("meet")
// rule as the browser on both sides. The test screen is 800×600.
const scale = (w: number, h: number) => Math.min(800 / w, 600 / h)
const pct = (w: number, h: number) => `${Math.round((scale(w, h) / scale(820, 620)) * 100)}%`
const zoomLabel = () => screen.getByTitle('Fit to plan').textContent

describe('zoom percentage indicator', () => {
  it('shows 100% for the initial view', () => {
    render(<Editor />)
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })

  it('refreshes after a single click on Zoom in', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom in')) // view ×(1/1.25)
    expect(zoomLabel()).toBe(pct(820 / 1.25, 620 / 1.25)) // 125%
  })

  it('refreshes after a single click on Zoom out', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom out')) // view ×1.25
    expect(zoomLabel()).toBe(pct(820 * 1.25, 620 * 1.25)) // 80%
  })

  it('refreshes after a wheel zoom', () => {
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 }) // view ×(1/1.08)
    expect(zoomLabel()).toBe(pct(820 / 1.08, 620 / 1.08)) // 108%
  })

  it('refreshes after a single click on Fit to plan', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom in')) // leave the default view
    fireEvent.click(screen.getByTitle('Fit to plan')) // empty plan → default view
    expect(zoomLabel()).toBe(pct(820, 620)) // 100%
  })
})
