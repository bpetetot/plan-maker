// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { emptyPlan } from '../model/types'
import Editor from './Editor'
import { installSvgGeometry } from './testHelpers'

beforeAll(installSvgGeometry)

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

afterEach(cleanup)

const gridOnSheet = (container: HTMLElement) => container.querySelector('svg [data-grid]')

describe('grid visibility toggle', () => {
  it('shows the grid by default, toggle pressed', () => {
    const { container } = render(<Editor />)
    expect(gridOnSheet(container)).not.toBeNull()
    expect(screen.getByLabelText('Grid').getAttribute('aria-pressed')).toBe('true')
  })

  it('hides the grid on toggle', () => {
    const { container } = render(<Editor />)
    fireEvent.click(screen.getByLabelText('Grid'))
    expect(gridOnSheet(container)).toBeNull()
    expect(screen.getByLabelText('Grid').getAttribute('aria-pressed')).toBe('false')
  })

  it('remembers the choice across sessions', () => {
    const first = render(<Editor />)
    fireEvent.click(screen.getByLabelText('Grid'))
    first.unmount()

    const second = render(<Editor />)
    expect(gridOnSheet(second.container)).toBeNull()
  })
})
