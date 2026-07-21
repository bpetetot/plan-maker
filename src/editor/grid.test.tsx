import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { GridLines, gridLevels, loadGridVisible, saveGridVisible } from './grid'

// CONTEXT.md: Grid — fade ramp. Opaque at 8 px cells, gone at 4 px,
// linear between.
describe('gridLevels', () => {
  it('shows both families fully at 100% zoom (10 cm = 10 px, 50 cm = 50 px)', () => {
    expect(gridLevels(1)).toEqual({ minor: 1, major: 1 })
  })

  it('fades the minor family halfway when its cells are 6 px', () => {
    expect(gridLevels(0.6)).toEqual({ minor: 0.5, major: 1 })
  })

  it('drops the minor family at 4 px cells, keeping the major family', () => {
    expect(gridLevels(0.4)).toEqual({ minor: 0, major: 1 })
  })

  it('fades the major family halfway when 50 cm cells are 6 px', () => {
    expect(gridLevels(0.12)).toEqual({ minor: 0, major: 0.5 })
  })

  it('drops everything when even 50 cm cells are 4 px or less', () => {
    expect(gridLevels(0.08)).toEqual({ minor: 0, major: 0 })
  })
})

// Per-device preference (CONTEXT.md: Grid — "shown by default").
describe('grid visibility preference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to visible when nothing is stored', () => {
    expect(loadGridVisible()).toBe(true)
  })

  it('remembers hiding the grid', () => {
    saveGridVisible(false)
    expect(loadGridVisible()).toBe(false)
  })

  it('remembers showing it again', () => {
    saveGridVisible(false)
    saveGridVisible(true)
    expect(loadGridVisible()).toBe(true)
  })
})

describe('GridLines', () => {
  const draw = async (view: { x: number; y: number; w: number; h: number }, zoomScale: number) => {
    const { container } = await render(
      <svg>
        <GridLines view={view} pxPerCm={zoomScale} />
      </svg>,
    )
    return container
  }

  it('rules the view every 10 cm, 50 cm lines drawn as major', async () => {
    // x: 31 multiples of 10 in [0, 300], 7 of them 50s; y: 21 in [0, 200], 5 of them 50s
    const c = await draw({ x: 0, y: 0, w: 300, h: 200 }, 1)
    expect(c.querySelectorAll('[data-grid="minor"] line')).toHaveLength(24 + 16)
    expect(c.querySelectorAll('[data-grid="major"] line')).toHaveLength(7 + 5)
  })

  it('dashes the minor family, keeps the major solid', async () => {
    const c = await draw({ x: 0, y: 0, w: 300, h: 200 }, 1)
    expect(c.querySelector('[data-grid="minor"]')?.getAttribute('stroke-dasharray')).toBe('3 3')
    expect(c.querySelector('[data-grid="major"]')?.hasAttribute('stroke-dasharray')).toBe(false)
  })

  it('spans each line across the whole view', async () => {
    const c = await draw({ x: -50, y: -30, w: 200, h: 100 }, 1)
    const vertical = [...c.querySelectorAll('[data-grid="major"] line')].find(
      (l) => l.getAttribute('x1') === '100',
    )!
    expect(vertical.getAttribute('y1')).toBe('-30')
    expect(vertical.getAttribute('y2')).toBe('70')
  })

  it('applies the fade as group opacity', async () => {
    // minor cells 6 px → halfway through the fade ramp
    const c = await draw({ x: 0, y: 0, w: 300, h: 200 }, 0.6)
    expect(c.querySelector('[data-grid="minor"]')?.getAttribute('opacity')).toBe('0.5')
    expect(c.querySelector('[data-grid="major"]')?.getAttribute('opacity')).toBe('1')
  })

  it('omits the minor family entirely once faded out', async () => {
    const c = await draw({ x: 0, y: 0, w: 1000, h: 800 }, 0.3)
    expect(c.querySelector('[data-grid="minor"]')).toBeNull()
    expect(c.querySelectorAll('[data-grid="major"] line').length).toBeGreaterThan(0)
  })

  it('renders nothing at extreme zoom-out', async () => {
    const c = await draw({ x: 0, y: 0, w: 100000, h: 80000 }, 0.02)
    expect(c.querySelector('[data-grid]')).toBeNull()
  })
})
