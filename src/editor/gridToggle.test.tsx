import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'
import { reloadPreferences } from './preferences'

beforeEach(() => {
  localStorage.clear()
  // the preference is session state now, so an empty storage is only half of a
  // fresh device — this is the other half
  reloadPreferences()
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

const gridOnSheet = (container: HTMLElement) => container.querySelector('svg [data-grid]')
const toggle = () => page.getByLabelText('Grid')

describe('grid visibility toggle', () => {
  it('shows the grid by default, toggle pressed', async () => {
    const { container } = await render(<Editor />)
    expect(gridOnSheet(container)).not.toBeNull()
    expect(toggle().element().getAttribute('aria-pressed')).toBe('true')
  })

  it('hides the grid on toggle', async () => {
    const { container } = await render(<Editor />)
    await userEvent.click(toggle())
    expect(gridOnSheet(container)).toBeNull()
    expect(toggle().element().getAttribute('aria-pressed')).toBe('false')
  })

  it('covers the whole screen, not just the viewBox', async () => {
    // screen 800×600 vs viewBox 820×620 (default view): "meet" letterboxes
    // horizontally, so the grid must start left of the viewBox's x = -80
    const { container } = await render(<Editor />)
    const horizontals = [...container.querySelectorAll('svg [data-grid="major"] line')].filter(
      (l) => l.getAttribute('y1') === l.getAttribute('y2'),
    )
    expect(horizontals.length).toBeGreaterThan(0)
    for (const l of horizontals) expect(Number(l.getAttribute('x1'))).toBeLessThan(-80)
  })

  it('remembers the choice across sessions', async () => {
    const first = await render(<Editor />)
    await userEvent.click(toggle())
    await first.unmount()

    // a reload, not just a remount: the point is that the choice came back from
    // storage, which a surviving session value would hide
    reloadPreferences()
    const second = await render(<Editor />)
    expect(gridOnSheet(second.container)).toBeNull()
  })
})
