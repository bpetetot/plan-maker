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

// The displayed percentage must always equal the scale implied by the current
// view — same min-ratio rule as the browser. DEFAULT_VIEW is 820×620.
const pct = (w: number, h: number) => `${Math.round(Math.min(800 / w, 600 / h) * 100)}%`
const zoomLabel = () => screen.getByTitle('Fit to plan').textContent

describe('zoom percentage indicator', () => {
  it('shows the scale of the initial view', () => {
    render(<Editor />)
    expect(zoomLabel()).toBe(pct(820, 620)) // 97%
  })

  it('refreshes after a single click on Zoom in', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom in')) // view ×(1/1.25)
    expect(zoomLabel()).toBe(pct(820 / 1.25, 620 / 1.25)) // 121%
  })

  it('refreshes after a single click on Zoom out', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom out')) // view ×1.25
    expect(zoomLabel()).toBe(pct(820 * 1.25, 620 * 1.25)) // 77%
  })

  it('refreshes after a wheel zoom', () => {
    const { container } = render(<Editor />)
    const svg = container.querySelector('svg')!
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 }) // view ×(1/1.08)
    expect(zoomLabel()).toBe(pct(820 / 1.08, 620 / 1.08)) // 105%
  })

  it('refreshes after a single click on Fit to plan', () => {
    render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom in')) // leave the default view
    fireEvent.click(screen.getByTitle('Fit to plan')) // empty plan → default view
    expect(zoomLabel()).toBe(pct(820, 620)) // 97%
  })
})
