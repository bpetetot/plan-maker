// Space held is a modal pan: it suspends the active tool for as long as the
// key is down. Being modal is exactly what makes it dangerous — a keyup the
// window never receives leaves the editor stuck in a mode the user has left.
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import Editor from './Editor'
import { blur, key, keyUp } from './testKit'

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 })
  usePlanStore.temporal.getState().clear()
})

async function setup() {
  const { container, unmount } = await render(<Editor />)
  return { svg: container.querySelector('svg')!, unmount }
}

describe('space held', () => {
  it('offers the grab cursor while held, and takes it back on release', async () => {
    const { svg, unmount } = await setup()
    await key(' ', { code: 'Space' })
    expect(svg.style.cursor).toBe('grab')
    await keyUp(' ', { code: 'Space' })
    expect(svg.style.cursor).toBe('default')
    await unmount()
  })

  it('drops the pan mode when the window goes away mid-hold', async () => {
    const { svg, unmount } = await setup()
    await key(' ', { code: 'Space' })
    expect(svg.style.cursor).toBe('grab')
    // Alt+Tab away: the keyup lands in the other window and never arrives here
    await blur(window)
    expect(svg.style.cursor).toBe('default')
    await unmount()
  })
})
