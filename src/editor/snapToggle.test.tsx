// Snap is a state, not a permanent behavior (ADR 0007): it is on by default,
// can be turned off for the whole editor as a per-device preference, and Alt
// inverts it for the duration of a gesture — in both directions.
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { blur, clientAt, key, keyUp, pointer } from './testKit'

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

const plan = () => usePlanStore.getState().plan
const toggle = () => page.getByLabelText('Snap')
const pressed = () => toggle().element().getAttribute('aria-pressed')

async function setup() {
  const { container, unmount } = await render(<Editor />)
  const svg = container.querySelector('svg')!
  await key('2') // Wall tool
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

async function drawWall(svg: SVGSVGElement, altKey = false) {
  await pointer(svg, 'pointerdown', { button: 0, altKey, ...clientAt(svg, A.x, A.y) })
  await pointer(svg, 'pointerdown', { button: 0, altKey, ...clientAt(svg, B.x, B.y) })
  return Object.values(plan().points).map((p) => ({ x: p.x, y: p.y }))
}

const holdAlt = () => key('Alt', { altKey: true })
const releaseAlt = () => keyUp('Alt', { altKey: false })

describe('snap toggle', () => {
  it('snaps by default, toggle pressed', async () => {
    const { svg } = await setup()
    expect(pressed()).toBe('true')
    expect(await drawWall(svg)).toEqual(SNAPPED)
  })

  it('drops the alignment targets once snap is off', async () => {
    const { svg } = await setup()
    await userEvent.click(toggle())
    expect(pressed()).toBe('false')
    expect(await drawWall(svg)).toEqual(FREE)
  })

  it('toggles with the S key', async () => {
    const { svg } = await setup()
    await key('s')
    expect(pressed()).toBe('false')
    expect(await drawWall(svg)).toEqual(FREE)
  })

  it('ignores S under a modifier — Ctrl/Cmd+S is the Save reflex', async () => {
    await setup()
    await key('s', { ctrlKey: true })
    await key('s', { metaKey: true })
    expect(pressed()).toBe('true')
  })

  it('remembers the choice across sessions', async () => {
    const { unmount } = await setup()
    await userEvent.click(toggle())
    await unmount()

    const second = await setup()
    expect(pressed()).toBe('false')
    expect(await drawWall(second.svg)).toEqual(FREE)
  })
})

describe('Alt inverts the mode', () => {
  it('suspends the alignment targets while snap is on', async () => {
    const { svg } = await setup()
    await holdAlt()
    expect(await drawWall(svg, true)).toEqual(FREE)
  })

  it('restores them while snap is off', async () => {
    const { svg } = await setup()
    await userEvent.click(toggle())
    await holdAlt()
    expect(await drawWall(svg, true)).toEqual(SNAPPED)
  })
})

describe('the toggle shows the effective state', () => {
  it('unpresses while Alt is held with snap on, and recovers on release', async () => {
    await setup()
    expect(pressed()).toBe('true')
    await holdAlt()
    expect(pressed()).toBe('false')
    await releaseAlt()
    expect(pressed()).toBe('true')
  })

  it('presses while Alt is held with snap off', async () => {
    await setup()
    await userEvent.click(toggle())
    await holdAlt()
    expect(pressed()).toBe('true')
    await releaseAlt()
    expect(pressed()).toBe('false')
  })

  it('clicking while Alt is held toggles snapping, not the inversion', async () => {
    await setup()
    await holdAlt()
    await userEvent.click(toggle()) // snapping on -> off, Alt still inverting
    expect(pressed()).toBe('true')
    await releaseAlt()
    expect(pressed()).toBe('false')
  })

  it('drops a held Alt when the window loses focus, rather than staying stuck', async () => {
    const { svg } = await setup()
    await holdAlt()
    expect(pressed()).toBe('false')
    await blur(window) // Alt+Tab away: the keyup never arrives
    expect(pressed()).toBe('true')
    expect(await drawWall(svg)).toEqual(SNAPPED)
  })
})
