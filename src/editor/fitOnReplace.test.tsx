// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { emptyPlan } from '../model/types'
import type { Plan } from '../model/types'
import { replacePlan, usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { RECT, installSvgGeometry, viewBoxOf } from './testHelpers'

// A plan drawn far from the origin, entirely outside the default view.
// Bounding box: x 2000, y 3000, w 600, h 400.
const farPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 2000, y: 3000 },
    b: { id: 'b', x: 2600, y: 3400 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
})

// Fit framing = bounding box + 120 cm margin on each side, grown to the
// screen's aspect ratio (the viewBox always matches the screen) and centered.
const FAR_PLAN_FIT = { x: 1880, y: 2880, w: 840, h: 640 }
const DEFAULT_FRAME = { x: -80, y: -80, w: 820, h: 620 }

const expectFraming = (container: HTMLElement, rect: { x: number; y: number; w: number; h: number }) => {
  const scale = Math.min(RECT.width / rect.w, RECT.height / rect.h)
  const [x, y, w, h] = viewBoxOf(container)
  expect(w).toBeCloseTo(RECT.width / scale, 2)
  expect(h).toBeCloseTo(RECT.height / scale, 2)
  expect(x).toBeCloseTo(rect.x + (rect.w - RECT.width / scale) / 2, 2)
  expect(y).toBeCloseTo(rect.y + (rect.h - RECT.height / scale) / 2, 2)
}

beforeAll(installSvgGeometry)

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

describe('Fit after plan replacement', () => {
  it('reframes the view when a file is opened while the editor is up', () => {
    const { container } = render(<Editor />)
    expectFraming(container, DEFAULT_FRAME)
    act(() => replacePlan(farPlan()))
    expectFraming(container, FAR_PLAN_FIT)
  })

  it('opens framing the plan restored before the editor mounted (startup)', () => {
    act(() => replacePlan(farPlan()))
    const { container } = render(<Editor />)
    expectFraming(container, FAR_PLAN_FIT)
  })

  it('returns to the default view when the plan is reset', () => {
    act(() => replacePlan(farPlan()))
    const { container } = render(<Editor />)
    act(() => replacePlan(emptyPlan()))
    expectFraming(container, DEFAULT_FRAME)
  })
})
