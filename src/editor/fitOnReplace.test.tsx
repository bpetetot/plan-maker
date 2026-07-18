// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyPlan } from '../model/types'
import type { Plan } from '../model/types'
import { replacePlan, usePlanStore } from '../store/planStore'
import Editor from './Editor'

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

// Fit framing = bounding box + 120 cm margin on each side.
const FAR_PLAN_FIT = '1880 2880 840 640'
const DEFAULT_VIEW = '-80 -80 820 620'

const viewBox = (container: HTMLElement) => container.querySelector('svg')!.getAttribute('viewBox')

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

describe('Fit after plan replacement', () => {
  it('reframes the view when a file is opened while the editor is up', () => {
    const { container } = render(<Editor />)
    expect(viewBox(container)).toBe(DEFAULT_VIEW)
    act(() => replacePlan(farPlan()))
    expect(viewBox(container)).toBe(FAR_PLAN_FIT)
  })

  it('opens framing the plan restored before the editor mounted (startup)', () => {
    act(() => replacePlan(farPlan()))
    const { container } = render(<Editor />)
    expect(viewBox(container)).toBe(FAR_PLAN_FIT)
  })

  it('returns to the default view when the plan is reset', () => {
    act(() => replacePlan(farPlan()))
    const { container } = render(<Editor />)
    act(() => replacePlan(emptyPlan()))
    expect(viewBox(container)).toBe(DEFAULT_VIEW)
  })
})
