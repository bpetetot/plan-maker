import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Opening, Plan, Wall } from '../model/types'
import { OpeningGlyph, WallLine } from './render'

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

// SVG mask, not a sheet-colored patch: the Grid stays visible through the hole.
describe('opening gap in the wall', () => {
  it('cuts the opening out of the wall body with a mask', async () => {
    const { plan, wall } = planWithWindow()
    const { container } = await render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    const polygon = container.querySelector('polygon')!
    expect(polygon.getAttribute('mask')).toBe('url(#wall-gaps-w)')
    const hole = container.querySelector('mask#wall-gaps-w rect[fill="#000"]')!
    // 100 inset by half a jamb bar each end; the uncut strips are the jambs
    expect(hole.getAttribute('width')).toBe('98.5')
    expect(hole.getAttribute('height')).toBe('12') // thickness + 1 cm each side
  })

  it('cuts a door gap at full width', async () => {
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
    const { container } = await render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    const hole = container.querySelector('mask#wall-gaps-w rect[fill="#000"]')!
    expect(hole.getAttribute('width')).toBe('90')
  })

  it('leaves a wall without openings unmasked', async () => {
    const { plan, wall } = planWithWindow()
    plan.openings = {}
    const { container } = await render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    expect(container.querySelector('polygon')!.hasAttribute('mask')).toBe(false)
    expect(container.querySelector('mask')).toBeNull()
  })

  it('paints no sheet-colored patch over a placed opening', async () => {
    const { plan, opening } = planWithWindow()
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={plan} opening={opening} />
      </svg>,
    )
    expect(container.querySelector('rect[fill="var(--sheet)"]')).toBeNull()
  })

  it('keeps the sheet-colored patch on the placement ghost', async () => {
    // ghost is not in the plan: no wall mask cuts its gap, so the patch previews it
    const { plan, opening } = planWithWindow()
    const ghost = { ...opening, id: '__ghost' }
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={plan} opening={ghost} ghost />
      </svg>,
    )
    expect(container.querySelector('rect[fill="var(--sheet)"]')).not.toBeNull()
  })
})
