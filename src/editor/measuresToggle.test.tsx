// @vitest-environment jsdom
// The Measure toggle hides what the plan states about itself — wall
// dimensions and room areas — and nothing else (CONTEXT.md: Measure).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildPlan, namedRoomPlan } from '../model/testHelpers'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { loadMeasuresVisible, saveMeasuresVisible } from './measurePref'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  localStorage.clear()
  saveMeasuresVisible(true)
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

function setup(plan = namedRoomPlan()) {
  usePlanStore.setState({ plan })
  const { container } = render(<Editor />)
  return { container, svg: container.querySelector('svg')! }
}

const dims = (svg: SVGSVGElement) => svg.querySelectorAll('text.dim:not(.dim-live)')
const areas = (svg: SVGSVGElement) => svg.querySelectorAll('text.room-area')
const names = (svg: SVGSVGElement) => svg.querySelectorAll('text.room-name')
const toggle = () => screen.getByLabelText('Measures')

describe('measure visibility toggle', () => {
  it('shows measures by default, toggle pressed', () => {
    const { svg } = setup()
    expect(dims(svg)).toHaveLength(4)
    expect(areas(svg)).toHaveLength(1)
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
  })

  it('hides wall dimensions and room areas on toggle', () => {
    const { svg } = setup()
    fireEvent.click(toggle())
    expect(dims(svg)).toHaveLength(0)
    expect(areas(svg)).toHaveLength(0)
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the room name, which is not a measure', () => {
    const { svg } = setup()
    expect(names(svg)).toHaveLength(1)
    fireEvent.click(toggle())
    expect(names(svg)).toHaveLength(1)
  })

  it('leaves the grid alone', () => {
    const { svg } = setup()
    fireEvent.click(toggle())
    expect(svg.querySelector('[data-grid]')).not.toBeNull()
  })

  it('does not bring the measure back for a selected wall', () => {
    const { svg } = setup()
    fireEvent.click(toggle())
    // marquee over the top wall only
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, -50, -50) })
    fireEvent.pointerMove(svg, clientAt(svg, 450, 50))
    fireEvent.pointerUp(svg)
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0)
    expect(dims(svg)).toHaveLength(0)
  })

  it('keeps the live length while a wall is drawn — interaction chrome', () => {
    const { svg } = setup(emptyPlan())
    fireEvent.click(toggle())
    fireEvent.click(screen.getByTitle('Wall (2)'))
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, 0, 0) })
    fireEvent.pointerUp(svg, clientAt(svg, 0, 0))
    fireEvent.pointerMove(svg, clientAt(svg, 300, 0))
    expect(svg.querySelector('text.dim-live')).not.toBeNull()
  })

  it('keeps the placement dimensions of a selected opening — interaction chrome', () => {
    const withDoor = buildPlan((b) => {
      const p1 = b.point(0, 0)
      const p2 = b.point(400, 0)
      const wall = b.wall(p1, p2)
      b.opening(wall, 'door', 200)
    })
    const { svg } = setup(withDoor)
    fireEvent.click(toggle())
    // marquee over the wall and its door
    fireEvent.pointerDown(svg, { button: 0, ...clientAt(svg, -50, -50) })
    fireEvent.pointerMove(svg, clientAt(svg, 450, 50))
    fireEvent.pointerUp(svg)
    expect(svg.querySelectorAll('text.placement-chip').length).toBeGreaterThan(0)
    expect(dims(svg)).toHaveLength(0)
  })

  // its text block held nothing but the area, and a block that renders nothing
  // must not linger as an invisible drag target
  it('leaves an unlabeled room blank, with no drag target behind', () => {
    const { svg } = setup({ ...namedRoomPlan(), roomLabels: {} })
    expect(areas(svg)).toHaveLength(1)
    expect(svg.querySelectorAll('rect.room-area-hit')).toHaveLength(1)

    fireEvent.click(toggle())
    expect(areas(svg)).toHaveLength(0)
    expect(names(svg)).toHaveLength(0)
    expect(svg.querySelectorAll('rect.room-area-hit')).toHaveLength(0)
    expect(svg.querySelectorAll('rect.room-name-hit')).toHaveLength(0)
  })

  it('remembers the choice across sessions', () => {
    setup()
    fireEvent.click(toggle())
    expect(localStorage.getItem('plan-maker:measures')).toBe('hidden')
    cleanup()

    const { svg } = setup()
    expect(dims(svg)).toHaveLength(0)
    expect(areas(svg)).toHaveLength(0)
  })

  it('stores nothing once measures are shown again', () => {
    setup()
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(localStorage.getItem('plan-maker:measures')).toBeNull()
  })

  // the editor draws with the preference and the export prints with it, so the
  // two must never disagree — including when storage refuses the write
  it('still reports hidden to the export when storage is unavailable', () => {
    const { svg } = setup()
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('quota')
    }
    try {
      fireEvent.click(toggle())
      expect(dims(svg)).toHaveLength(0)
      expect(loadMeasuresVisible()).toBe(false)
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
