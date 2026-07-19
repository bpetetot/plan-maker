import { describe, expect, it } from 'vitest'
import { visibleRect } from './useView'

// With preserveAspectRatio "xMidYMid meet" the screen shows more than the
// viewBox on the non-limiting axis — the visible rect is the viewBox grown
// to the screen's aspect ratio, centered.
describe('visibleRect', () => {
  it('widens the view when the screen is wider than the view', () => {
    // scale = min(800/820, 600/620) = 600/620 → visible 826.67 × 620, centered
    const r = visibleRect({ x: -80, y: -80, w: 820, h: 620 }, 800, 600)
    expect(r.x).toBeCloseTo(-83.333, 2)
    expect(r.y).toBeCloseTo(-80, 5)
    expect(r.w).toBeCloseTo(826.667, 2)
    expect(r.h).toBeCloseTo(620, 5)
  })

  it('heightens the view when the screen is taller than the view', () => {
    // scale = min(300/300, 300/200) = 1 → visible 300 × 300, centered
    const r = visibleRect({ x: 0, y: 0, w: 300, h: 200 }, 300, 300)
    expect(r).toEqual({ x: 0, y: -50, w: 300, h: 300 })
  })

  it('falls back to the view itself before the screen is measured', () => {
    const view = { x: 0, y: 0, w: 300, h: 200 }
    expect(visibleRect(view, 0, 0)).toEqual(view)
  })
})
