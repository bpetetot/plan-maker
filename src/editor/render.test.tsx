// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Plan, Wall } from '../model/types'
import { DimLabel, labelAngle } from './render'

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
    const { text } = renderDim(plan, wall)
    // Local (0, -18) under rotate(-90) lands at global (-18, 0): left of the wall.
    expect(text.getAttribute('y')).toBe('-18')
  })

  it('keeps a stored placement on its geometric side', () => {
    // Geometric right is side -1 when drawn downward, side +1 when drawn upward
    // (side is a sign along the start→end left normal). Both must land at
    // local (0, +18) — global (+18, 0) under rotate(-90).
    for (const [y1, y2, side] of [
      [0, 200, -1],
      [200, 0, 1],
    ] as const) {
      const { plan, wall } = planWith(0, y1, 0, y2)
      wall.dimPlacement = { t: 0.5, side }
      const { text } = renderDim(plan, wall)
      expect(text.getAttribute('y')).toBe('18')
      cleanup()
    }
  })
})
