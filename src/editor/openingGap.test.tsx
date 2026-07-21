// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Opening, Plan, Wall } from '../model/types'
import { OpeningGlyph, WallLine } from './render'

afterEach(cleanup)

// A single horizontal wall with a window in the middle.
function planWithWindow(): { plan: Plan; wall: Wall; opening: Opening } {
  const wall: Wall = { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 }
  const opening: Opening = { id: 'o', wallId: 'w', type: 'window', offset: 200, width: 100 }
  const plan: Plan = {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: { w: wall },
    openings: { o: opening },
    roomLabels: {},
  }
  return { plan, wall, opening }
}

// The gap is a real hole in the wall (SVG mask), not a sheet-colored patch —
// whatever sits beneath (the Grid) stays visible through the opening.
describe('opening gap in the wall', () => {
  it('cuts the opening out of the wall body with a mask', () => {
    const { plan, wall } = planWithWindow()
    const { container } = render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    const polygon = container.querySelector('polygon')!
    expect(polygon.getAttribute('mask')).toBe('url(#wall-gaps-w)')
    const hole = container.querySelector('mask#wall-gaps-w rect[fill="#000"]')!
    // a window's cut is inset by half a jamb bar at each end: the uncut strips
    // ARE the jambs, so they stay one polygon with the wall body
    expect(hole.getAttribute('width')).toBe('98.5')
    expect(hole.getAttribute('height')).toBe('12') // thickness + 1 cm each side
  })

  it('cuts a door gap at full width', () => {
    const { plan, wall } = planWithWindow()
    plan.openings.o = {
      id: 'o',
      wallId: 'w',
      type: 'door',
      offset: 200,
      width: 90,
      hingeSide: 'start',
      swing: 'in',
    }
    const { container } = render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    const hole = container.querySelector('mask#wall-gaps-w rect[fill="#000"]')!
    expect(hole.getAttribute('width')).toBe('90')
  })

  it('leaves a wall without openings unmasked', () => {
    const { plan, wall } = planWithWindow()
    plan.openings = {}
    const { container } = render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    expect(container.querySelector('polygon')!.hasAttribute('mask')).toBe(false)
    expect(container.querySelector('mask')).toBeNull()
  })

  it('paints no sheet-colored patch over a placed opening', () => {
    const { plan, opening } = planWithWindow()
    const { container } = render(
      <svg>
        <OpeningGlyph plan={plan} opening={opening} />
      </svg>,
    )
    expect(container.querySelector('rect[fill="var(--sheet)"]')).toBeNull()
  })

  it('keeps the sheet-colored patch on the placement ghost', () => {
    // the ghost is not in the plan, so no wall mask can cut its gap — the
    // patch is how the preview shows the future hole
    const { plan, opening } = planWithWindow()
    const ghost = { ...opening, id: '__ghost' }
    const { container } = render(
      <svg>
        <OpeningGlyph plan={plan} opening={ghost} ghost />
      </svg>,
    )
    expect(container.querySelector('rect[fill="var(--sheet)"]')).not.toBeNull()
  })
})
