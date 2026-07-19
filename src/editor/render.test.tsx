// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { squareRoomPlan } from '../model/testHelpers'
import type { Plan, Wall } from '../model/types'
import { DimLabel, labelAngle, RubberWall, WallLine } from './render'

afterEach(cleanup)

// A single-wall plan from (x1,y1) to (x2,y2), thickness 10.
function planWith(x1: number, y1: number, x2: number, y2: number): { plan: Plan; wall: Wall } {
  const wall: Wall = { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 }
  const plan: Plan = {
    points: {
      a: { id: 'a', x: x1, y: y1 },
      b: { id: 'b', x: x2, y: y2 },
    },
    walls: { w: wall },
    openings: {},
    roomLabels: {},
  }
  return { plan, wall }
}

function renderDim(plan: Plan, wall: Wall) {
  const { container } = render(
    <svg>
      <DimLabel plan={plan} wall={wall} />
    </svg>,
  )
  const text = container.querySelector('text')!
  const group = text.closest('g')!
  return { text, group }
}

describe('labelAngle', () => {
  it('reads horizontal walls left-to-right regardless of draw direction', () => {
    expect(labelAngle(100, 0)).toBe(0)
    expect(labelAngle(-100, 0)).toBe(0)
  })

  it('reads vertical walls bottom-to-top (ISO), regardless of draw direction', () => {
    expect(labelAngle(0, 100)).toBe(-90)
    expect(labelAngle(0, -100)).toBe(-90)
  })

  it('normalizes every angle into [-90, 90)', () => {
    expect(labelAngle(100, 1)).toBeCloseTo(0.57, 1)
    expect(labelAngle(-100, 1)).toBeCloseTo(-0.57, 1)
    expect(labelAngle(-100, -1)).toBeCloseTo(0.57, 1)
    expect(labelAngle(1, 100)).toBeCloseTo(89.43, 1)
    expect(labelAngle(-1, 100)).toBeCloseTo(-89.43, 1)
  })
})

describe('DimLabel value', () => {
  // A dimension measures the rendered silhouette on the side it sits on —
  // 3,90 m inside, 4,10 m outside a 4×4 m axis square, and the hors-tout
  // extent (axis + thickness) on a free-standing wall.
  it('shows the hors-tout extent on a free-standing wall', () => {
    const { plan, wall } = planWith(0, 0, 400, 0)
    const { text } = renderDim(plan, wall)
    expect(text.textContent).toBe('4,10 m')
  })

  it('measures the silhouette on the side it sits on', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    // default side for a horizontal wall is the upper one — outside the room
    expect(renderDim(plan, bottom).text.textContent).toBe('4,10 m')
    cleanup()
    // dragged inside the room (side +1, below in screen coords): interior face
    bottom.dimPlacement = { t: 0.5, side: 1 }
    expect(renderDim(plan, bottom).text.textContent).toBe('3,90 m')
  })

  it('marks the measured extent: a broken line with a tick at each end', () => {
    const { plan, wall } = planWith(0, 0, 400, 0)
    const { container } = render(
      <svg>
        <DimLabel plan={plan} wall={wall} />
      </svg>,
    )
    // 2 line pieces around the text + 2 perpendicular ticks
    const lines = Array.from(container.querySelectorAll('line'))
    expect(lines).toHaveLength(4)
    // the extent runs between the silhouette ends: x = -5 and 405
    const xs = lines.flatMap((l) => [l.getAttribute('x1'), l.getAttribute('x2')])
    expect(xs).toContain('-5')
    expect(xs).toContain('405')
  })

  it('keeps the extent ticks even when no line piece has room for them', () => {
    // a 25 cm wall: the text gap swallows the whole line, the ticks stay —
    // marking the measured extent is the point when a value refines
    const { plan, wall } = planWith(0, 0, 25, 0)
    const { container } = render(
      <svg>
        <DimLabel plan={plan} wall={wall} />
      </svg>,
    )
    expect(container.querySelector('text')!.textContent).toBe('35 cm')
    expect(container.querySelectorAll('line')).toHaveLength(2)
  })
})

describe('WallLine', () => {
  function renderWall(plan: Plan, wall: Wall) {
    const { container } = render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    )
    return container.querySelector('polygon')!
  }

  it('draws a free-standing wall as a rectangle overhanging its Points', () => {
    const { plan, wall } = planWith(0, 0, 400, 0)
    const polygon = renderWall(plan, wall)
    expect(polygon.getAttribute('points')).toBe('-5,5 405,5 405,-5 -5,-5')
  })

  it('miters a square-room corner: faces meet where the dimensions measure', () => {
    const plan = squareRoomPlan()
    const bottom = Object.values(plan.walls)[0]
    const polygon = renderWall(plan, bottom)
    // interior face (y=5) from 5 to 395, exterior face (y=-5) from -5 to 405
    expect(polygon.getAttribute('points')).toBe('5,5 395,5 405,-5 -5,-5')
  })
})

describe('DimLabel on a vertical wall', () => {
  it('rotates the text -90 for both draw directions', () => {
    for (const [y1, y2] of [
      [0, 200],
      [200, 0],
    ]) {
      const { plan, wall } = planWith(0, y1, 0, y2)
      const { group } = renderDim(plan, wall)
      expect(group.getAttribute('transform')).toContain('rotate(-90)')
      cleanup()
    }
  })

  it('defaults to the left side of the wall (above the reading line)', () => {
    const { plan, wall } = planWith(0, 0, 0, 200)
    const { group } = renderDim(plan, wall)
    // the text group sits on the dimension line, 18 left of the wall axis
    expect(group.getAttribute('transform')).toBe('translate(-18,100) rotate(-90)')
  })

  it('keeps a stored placement on its geometric side', () => {
    // Geometric right is side -1 when drawn downward, side +1 when drawn
    // upward (side is a sign along the start→end left normal). Both must
    // land 18 right of the wall axis.
    for (const [y1, y2, side] of [
      [0, 200, -1],
      [200, 0, 1],
    ] as const) {
      const { plan, wall } = planWith(0, y1, 0, y2)
      wall.dimPlacement = { t: 0.5, side }
      const { group } = renderDim(plan, wall)
      expect(group.getAttribute('transform')).toBe('translate(18,100) rotate(-90)')
      cleanup()
    }
  })
})

describe('RubberWall', () => {
  function renderRubber(from: { x: number; y: number }, to: { x: number; y: number }) {
    const { container } = render(
      <svg>
        <RubberWall from={from} to={to} thickness={10} />
      </svg>,
    )
    return container
  }

  it('labels the hors-tout extent: axis length plus the thickness', () => {
    const container = renderRubber({ x: 0, y: 0 }, { x: 400, y: 0 })
    expect(container.querySelector('text')!.textContent).toBe('4,10 m')
  })

  it('previews the future body honestly: square caps', () => {
    const container = renderRubber({ x: 0, y: 0 }, { x: 400, y: 0 })
    expect(container.querySelector('line')!.getAttribute('stroke-linecap')).toBe('square')
  })
})
