import { describe, expect, it } from 'vitest'
import { detectRooms } from '../model/rooms'
import { buildPlan } from '../model/testHelpers'
import { SCHEMA_VERSION } from '../persistence/schema'
import { parsePlanFile, serializePlanFile, transferFileName } from './json'

const squarePlan = () =>
  buildPlan((b) => {
    const a = b.point(0, 0)
    const c = b.point(400, 0)
    const d = b.point(400, 300)
    const e = b.point(0, 300)
    b.wall(a, c)
    b.wall(c, d)
    b.wall(d, e)
    b.wall(e, a)
  })

describe('serializePlanFile / parsePlanFile', () => {
  it('round-trips a plan through the file envelope', () => {
    const plan = squarePlan()
    const text = serializePlanFile(plan)
    const envelope = JSON.parse(text)
    expect(envelope.format).toBe('plan-maker')
    expect(envelope.version).toBe(SCHEMA_VERSION)
    expect(parsePlanFile(text)).toEqual({ ok: true, plan })
  })

  it('rejects invalid JSON', () => {
    expect(parsePlanFile('{oops')).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('rejects foreign JSON without the plan-maker format marker', () => {
    expect(parsePlanFile(JSON.stringify({ some: 'thing' }))).toEqual({ ok: false, reason: 'wrong-format' })
    expect(parsePlanFile(JSON.stringify({ format: 'other-app', version: 1, plan: {} }))).toEqual({
      ok: false,
      reason: 'wrong-format',
    })
  })

  it('rejects files from a future schema version', () => {
    const text = JSON.stringify({ format: 'plan-maker', version: SCHEMA_VERSION + 1, plan: squarePlan() })
    expect(parsePlanFile(text)).toEqual({ ok: false, reason: 'unsupported-version' })
  })

  it('rejects structurally invalid plans', () => {
    const text = JSON.stringify({ format: 'plan-maker', version: SCHEMA_VERSION, plan: { garbage: true } })
    expect(parsePlanFile(text)).toEqual({ ok: false, reason: 'invalid-plan' })
  })
})

describe('parsePlanFile — coincident points', () => {
  // Field case: a wall deleted then redrawn left two Points at (400, 100), so
  // the visually closed loop was never detected as a Room. Loading merges the
  // twins (ADR 0003) and the room appears.
  it('merges coincident points so the loop closes into a room', () => {
    const points: Record<string, [number, number]> = {
      A: [400, 100], // twin of H
      B: [700, 100],
      C: [700, 250],
      D: [349, 349],
      E: [599, 349],
      F: [219, 349],
      G: [219, 99],
      H: [400, 100],
      I: [700, 136],
    }
    const walls: [string, string][] = [
      ['B', 'I'],
      ['D', 'E'],
      ['C', 'E'],
      ['D', 'F'],
      ['F', 'G'],
      ['G', 'A'],
      ['H', 'B'],
      ['I', 'C'],
    ]
    const plan = {
      points: Object.fromEntries(Object.entries(points).map(([id, [x, y]]) => [id, { id, x, y }])),
      walls: Object.fromEntries(
        walls.map(([startPointId, endPointId], i) => [
          `w${i}`,
          { id: `w${i}`, startPointId, endPointId, thickness: 10 },
        ]),
      ),
      openings: {},
      roomLabels: {},
    }
    const result = parsePlanFile(JSON.stringify({ format: 'plan-maker', version: SCHEMA_VERSION, plan }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.plan.points)).toHaveLength(8)
      expect(detectRooms(result.plan)).toHaveLength(1)
    }
  })
})

describe('transferFileName', () => {
  it('formats plan-YYYY-MM-DD with the extension', () => {
    const date = new Date(2026, 6, 18)
    expect(transferFileName('json', date)).toBe('plan-2026-07-18.json')
    expect(transferFileName('png', date)).toBe('plan-2026-07-18.png')
  })
})

describe('parsePlanFile — orphan room labels', () => {
  it('drops labels outside any room and keeps contained ones', () => {
    let inside = ''
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      inside = b.label('Kitchen', 200, 150).id
      b.label('Orphan', 900, 900)
    })
    const result = parsePlanFile(serializePlanFile(plan))
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.keys(result.plan.roomLabels)).toEqual([inside])
  })
})
