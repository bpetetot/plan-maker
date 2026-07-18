// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'

// Fixed on-screen size of the SVG canvas for every test.
const RECT = { left: 0, top: 0, width: 800, height: 600 }

// jsdom has no SVG geometry. Emulate the browser: the screen CTM is derived
// from the *committed* viewBox attribute, so a component reading it during a
// React render sees the DOM as it was before that render's commit — the exact
// semantics the zoom indicator depends on.
beforeAll(() => {
  const proto = SVGSVGElement.prototype as SVGSVGElement & Record<string, unknown>

  proto.getBoundingClientRect = function () {
    return {
      ...RECT,
      right: RECT.left + RECT.width,
      bottom: RECT.top + RECT.height,
      x: RECT.left,
      y: RECT.top,
      toJSON: () => '',
    } as DOMRect
  }

  // Default preserveAspectRatio (xMidYMid meet): uniform scale = min of the
  // two ratios, content centered on the slack axis.
  proto.getScreenCTM = function (this: SVGSVGElement) {
    const vb = this.getAttribute('viewBox')
    if (!vb) return null
    const [x, y, w, h] = vb.split(/\s+/).map(Number)
    const s = Math.min(RECT.width / w, RECT.height / h)
    const e = RECT.left + (RECT.width - w * s) / 2 - x * s
    const f = RECT.top + (RECT.height - h * s) / 2 - y * s
    return makeMatrix(s, e, f)
  }

  // Minimal DOMMatrix/DOMPoint pair supporting scale+translate and inversion.
  function makeMatrix(s: number, e: number, f: number) {
    return {
      a: s,
      b: 0,
      c: 0,
      d: s,
      e,
      f,
      inverse: () => makeMatrix(1 / s, -e / s, -f / s),
    } as unknown as DOMMatrix
  }

  class FakeDOMPoint {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
    matrixTransform(m: { a: number; c: number; e: number; b: number; d: number; f: number }) {
      return new FakeDOMPoint(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f)
    }
  }
  ;(globalThis as Record<string, unknown>).DOMPoint = FakeDOMPoint
})

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
