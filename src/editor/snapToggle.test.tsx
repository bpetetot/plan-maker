// @vitest-environment jsdom
// Snap is a state, not a permanent behavior (ADR 0007): it is on by default,
// can be turned off for the whole editor as a per-device preference, and Alt
// inverts it for the duration of a gesture — in both directions.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

const plan = () => usePlanStore.getState().plan
const toggle = () => screen.getByLabelText('Snap')
const pressed = () => toggle().getAttribute('aria-pressed')

function setup() {
  const { container, unmount } = render(<Editor />)
  const svg = container.querySelector('svg')!
  fireEvent.keyDown(window, { key: '2' }) // Wall tool
  return { svg, unmount }
}

// Two clicks commit one wall. The cursor positions are deliberately off-grid
// and 22.5° off the anchor — half way between two 45° axes, so no axis lock
// intervenes and the grid is the only alignment target left to observe.
const A = { x: 203, y: 187 }
const B = { x: 400, y: 273 }
const SNAPPED = [
  { x: 200, y: 190 },
  { x: 400, y: 270 },
]
const FREE = [A, B]

function drawWall(svg: SVGSVGElement, altKey = false) {
  fireEvent.pointerDown(svg, { button: 0, altKey, ...clientAt(svg, A.x, A.y) })
  fireEvent.pointerDown(svg, { button: 0, altKey, ...clientAt(svg, B.x, B.y) })
  return Object.values(plan().points).map((p) => ({ x: p.x, y: p.y }))
}

const holdAlt = () => fireEvent.keyDown(window, { key: 'Alt', altKey: true })
const releaseAlt = () => fireEvent.keyUp(window, { key: 'Alt', altKey: false })

describe('snap toggle', () => {
  it('snaps by default, toggle pressed', () => {
    const { svg } = setup()
    expect(pressed()).toBe('true')
    expect(drawWall(svg)).toEqual(SNAPPED)
  })

  it('drops the alignment targets once snap is off', () => {
    const { svg } = setup()
    fireEvent.click(toggle())
    expect(pressed()).toBe('false')
    expect(drawWall(svg)).toEqual(FREE)
  })

  it('toggles with the S key', () => {
    const { svg } = setup()
    fireEvent.keyDown(window, { key: 's' })
    expect(pressed()).toBe('false')
    expect(drawWall(svg)).toEqual(FREE)
  })

  it('ignores S under a modifier — Ctrl/Cmd+S is the Save reflex', () => {
    setup()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(pressed()).toBe('true')
  })

  it('remembers the choice across sessions', () => {
    const { unmount } = setup()
    fireEvent.click(toggle())
    unmount()

    const second = setup()
    expect(pressed()).toBe('false')
    expect(drawWall(second.svg)).toEqual(FREE)
  })
})

describe('Alt inverts the mode', () => {
  it('suspends the alignment targets while snap is on', () => {
    const { svg } = setup()
    holdAlt()
    expect(drawWall(svg, true)).toEqual(FREE)
  })

  it('restores them while snap is off', () => {
    const { svg } = setup()
    fireEvent.click(toggle())
    holdAlt()
    expect(drawWall(svg, true)).toEqual(SNAPPED)
  })
})

describe('the toggle shows the effective state', () => {
  it('unpresses while Alt is held with snap on, and recovers on release', () => {
    setup()
    expect(pressed()).toBe('true')
    holdAlt()
    expect(pressed()).toBe('false')
    releaseAlt()
    expect(pressed()).toBe('true')
  })

  it('presses while Alt is held with snap off', () => {
    setup()
    fireEvent.click(toggle())
    holdAlt()
    expect(pressed()).toBe('true')
    releaseAlt()
    expect(pressed()).toBe('false')
  })

  it('clicking while Alt is held toggles snapping, not the inversion', () => {
    setup()
    holdAlt()
    fireEvent.click(toggle()) // snapping on -> off, Alt still inverting
    expect(pressed()).toBe('true')
    releaseAlt()
    expect(pressed()).toBe('false')
  })

  it('drops a held Alt when the window loses focus, rather than staying stuck', () => {
    const { svg } = setup()
    holdAlt()
    expect(pressed()).toBe('false')
    fireEvent.blur(window) // Alt+Tab away: the keyup never arrives
    expect(pressed()).toBe('true')
    expect(drawWall(svg)).toEqual(SNAPPED)
  })
})
