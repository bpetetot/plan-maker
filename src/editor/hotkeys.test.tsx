// The editor's shortcut registry: history, tool switching, and the typing
// guard that silences every one of them while a room is being named. The
// guard is the reason these keystrokes are dispatched at the focused element
// and left to bubble — dispatched at window they would bypass the very thing
// under test.
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { clientAt, key, mouse, pointer } from './testKit'

// A closed square room (100,100)-(500,500); centroid at (300,300).
const square = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
    c: { id: 'c', x: 500, y: 500 },
    d: { id: 'd', x: 100, y: 500 },
  },
  walls: {
    w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
    w3: { id: 'w3', startPointId: 'c', endPointId: 'd', thickness: 10 },
    w4: { id: 'w4', startPointId: 'd', endPointId: 'a', thickness: 10 },
  },
  openings: {},
  roomLabels: {},
})

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: square(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

const plan = () => usePlanStore.getState().plan
const wallCount = () => Object.keys(plan().walls).length
const nameInput = () => page.getByRole('textbox')

async function setup() {
  const { container, unmount } = await render(<Editor />)
  return { container, svg: container.querySelector('svg')!, unmount }
}

// Deleting the top wall is the cheapest undoable edit to observe on the plan.
// A marquee rather than a click: it selects on geometry alone, with no
// tolerance to get right.
async function deleteAWall(svg: SVGSVGElement) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 80, 80) })
  await pointer(svg, 'pointermove', clientAt(svg, 520, 120))
  await pointer(svg, 'pointerup')
  await key('Delete')
}

describe('history shortcuts', () => {
  it('Mod+Z undoes, Mod+Shift+Z and Mod+Y both redo', async () => {
    const { svg, unmount } = await setup()
    await deleteAWall(svg)
    expect(wallCount()).toBe(3)

    await key('z', { ctrlKey: true })
    expect(wallCount()).toBe(4)

    await key('z', { ctrlKey: true, shiftKey: true })
    expect(wallCount()).toBe(3)

    await key('z', { ctrlKey: true })
    expect(wallCount()).toBe(4)

    await key('y', { ctrlKey: true })
    expect(wallCount()).toBe(3)
    await unmount()
  })
})

describe('tool shortcuts', () => {
  it('1-4 pick the tools, and a modifier disarms them', async () => {
    const { unmount } = await setup()
    const pressed = (name: string) => page.getByLabelText(name).element().getAttribute('aria-pressed')

    await key('2')
    expect(pressed('Wall')).toBe('true')

    // Ctrl+1 is a browser tab shortcut, not a tool switch — the strict modifier
    // match is what keeps the bare digit from answering for the combo too.
    await key('1', { ctrlKey: true })
    expect(pressed('Wall')).toBe('true')

    await key('1')
    expect(pressed('Select')).toBe('true')
    await unmount()
  })
})

// The point of the registry is that the key a button advertises and the key
// that works are the same fact. Pressing what is on screen is the only
// assertion that catches them drifting apart — comparing the label to the
// registry would just be the registry compared to itself.
describe('the advertised key is the working key', () => {
  it('activates each tool by pressing the hint printed on its button', async () => {
    const { container, unmount } = await setup()
    for (const label of ['Wall', 'Door', 'Window', 'Select']) {
      const button = container.querySelector(`button[aria-label="${label}"]`)!
      const hint = button.querySelector('.key-hint')!.textContent!
      await key(hint)
      expect(button.getAttribute('aria-pressed')).toBe('true')
    }
    await unmount()
  })

  it('toggles snap by pressing the key named in the toggle title', async () => {
    const { container, unmount } = await setup()
    const snap = container.querySelector('button[aria-label="Snap"]')!
    // title reads "Disable snap (S)" — the parenthesised key is the contract
    const hint = snap.getAttribute('title')!.match(/\(([^)]+)\)/)![1]
    expect(snap.getAttribute('aria-pressed')).toBe('true')
    await key(hint)
    expect(snap.getAttribute('aria-pressed')).toBe('false')
    await unmount()
  })
})

describe('the typing guard', () => {
  it('leaves the plan alone when Mod+Z is pressed while naming a room', async () => {
    const { svg, unmount } = await setup()
    // One committed edit to undo — and the room stays closed, so it can be
    // double-clicked again to reopen the field.
    await mouse(svg, 'dblclick', clientAt(svg, 300, 300))
    await userEvent.fill(nameInput(), 'Kitchen')
    await userEvent.keyboard('{Enter}')
    expect(Object.values(plan().roomLabels)[0]).toMatchObject({ name: 'Kitchen' })

    await mouse(svg, 'dblclick', clientAt(svg, 300, 300))
    await userEvent.fill(nameInput(), 'Kitchenette')
    // Mod+Z here belongs to the field the user is typing in. Undoing the *plan*
    // under a half-typed name would be a silent, unrelated edit.
    await key('z', { ctrlKey: true })
    expect(Object.values(plan().roomLabels)[0]).toMatchObject({ name: 'Kitchen' })
    await unmount()
  })

  it('does not toggle snap when S is typed into a room name', async () => {
    const { svg, unmount } = await setup()
    const snapPressed = () => page.getByLabelText('Snap').element().getAttribute('aria-pressed')
    expect(snapPressed()).toBe('true')

    await mouse(svg, 'dblclick', clientAt(svg, 300, 300))
    // The keystroke has to leave from the field itself, or the guard under test
    // is never on its path — assert where the focus is rather than assume it.
    expect(document.activeElement).toBe(nameInput().element())
    await key('s')
    expect(snapPressed()).toBe('true')
    await unmount()
  })
})
