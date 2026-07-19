// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'
import { RECT, installSvgGeometry, viewBoxOf, zoomLabel } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

afterEach(() => {
  cleanup()
  RECT.width = 800
  RECT.height = 600
})

const resizeTo = (w: number, h: number) => {
  RECT.width = w
  RECT.height = h
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

// Default framing on the 800×600 test screen: the default frame (820×620 at
// -80,-80) fitted with the min ratio — scale 600/620, centered horizontally.
const S0 = 600 / 620

describe('window resize never pans or zooms the view', () => {
  it('opens with the default framing filling the screen exactly', () => {
    const { container } = render(<Editor />)
    const [x, y, w, h] = viewBoxOf(container)
    expect(x).toBeCloseTo(-80 - (800 / S0 - 820) / 2, 2)
    expect(y).toBeCloseTo(-80, 5)
    expect(w).toBeCloseTo(800 / S0, 2)
    expect(h).toBeCloseTo(620, 5)
  })

  it('growing the window reveals plan to the right and bottom, top-left anchored', () => {
    const { container } = render(<Editor />)
    const [x0, y0] = viewBoxOf(container)
    resizeTo(1000, 800)
    const [x, y, w, h] = viewBoxOf(container)
    expect(x).toBeCloseTo(x0, 5)
    expect(y).toBeCloseTo(y0, 5)
    expect(w).toBeCloseTo(1000 / S0, 2)
    expect(h).toBeCloseTo(800 / S0, 2)
    expect(zoomLabel()).toBe('100%')
  })

  it('shrinking the window never rescales the plan', () => {
    const { container } = render(<Editor />)
    const [x0, y0] = viewBoxOf(container)
    resizeTo(400, 300)
    const [x, y, w, h] = viewBoxOf(container)
    expect(x).toBeCloseTo(x0, 5)
    expect(y).toBeCloseTo(y0, 5)
    expect(w).toBeCloseTo(400 / S0, 2)
    expect(h).toBeCloseTo(300 / S0, 2)
    expect(zoomLabel()).toBe('100%')
  })

  it('a zoomed view keeps its scale and origin through a resize', () => {
    const { container } = render(<Editor />)
    fireEvent.click(screen.getByLabelText('Zoom in')) // scale ×1.25
    const [x0, y0] = viewBoxOf(container)
    resizeTo(1000, 600)
    const [x, y, w, h] = viewBoxOf(container)
    expect(x).toBeCloseTo(x0, 5)
    expect(y).toBeCloseTo(y0, 5)
    expect(w).toBeCloseTo(1000 / (S0 * 1.25), 2)
    expect(h).toBeCloseTo(600 / (S0 * 1.25), 2)
    expect(zoomLabel()).toBe('125%')
  })
})
