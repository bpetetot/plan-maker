// @vitest-environment jsdom
// A selected wall's Dimension shares the wall's selection accent; hover and
// unselected walls keep the plain dimension grays.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildPlan } from '../model/testHelpers'
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

function setup() {
  usePlanStore.setState({
    plan: buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0))
      b.wall(b.point(0, 200), b.point(400, 200))
    }),
  })
  const { container } = render(<Editor />)
  return { svg: container.querySelector('svg')! }
}

function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, a.x, a.y) })
  fireEvent.pointerMove(svg, clientAt(svg, b.x, b.y))
  fireEvent.pointerUp(svg)
}

describe('dimension of a selected wall', () => {
  it('turns accent on selection, and back to gray when cleared', () => {
    const { svg } = setup()
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0)
    // select the first wall only
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 })
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(1)
    // clicking empty canvas clears the selection
    marqueeSelect(svg, { x: 600, y: -100 }, { x: 600, y: -100 })
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0)
  })

  it('colors every selected wall dimension in a multi-selection', () => {
    const { svg } = setup()
    marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 250 })
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(2)
  })
})
