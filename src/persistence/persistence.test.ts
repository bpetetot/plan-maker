import 'fake-indexeddb/auto'
import { clear, get, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRoomLabel } from '../model/operations'
import { detectRooms } from '../model/rooms'
import { buildPlan } from '../model/testHelpers'
import { emptyPlan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { startAutosave } from './autosave'
import { runMigrations, SCHEMA_VERSION, validatePlan, type StoredRecord } from './schema'
import { BACKUP_KEY, CURRENT_KEY, loadPlan, savePlan } from './storage'

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

beforeEach(async () => {
  await clear()
})

describe('validatePlan', () => {
  it('accepts a valid plan', () => {
    expect(validatePlan(squarePlan())).not.toBeNull()
    expect(validatePlan(emptyPlan())).not.toBeNull()
  })

  it('rejects non-objects and missing collections', () => {
    expect(validatePlan(null)).toBeNull()
    expect(validatePlan('nope')).toBeNull()
    expect(validatePlan({ points: {}, walls: {} })).toBeNull()
  })

  it('rejects walls referencing missing points', () => {
    const plan = squarePlan()
    const broken = structuredClone(plan) as { walls: Record<string, { startPointId: string }> }
    Object.values(broken.walls)[0].startPointId = 'missing'
    expect(validatePlan(broken)).toBeNull()
  })

  it('rejects openings referencing missing walls or with bad door fields', () => {
    const plan = structuredClone(squarePlan())
    plan.openings['o1'] = { id: 'o1', wallId: 'missing', type: 'window', offset: 100, width: 90 }
    expect(validatePlan(plan)).toBeNull()

    const plan2 = structuredClone(squarePlan())
    const wallId = Object.keys(plan2.walls)[0]
    // @ts-expect-error deliberately malformed door
    plan2.openings['o1'] = { id: 'o1', wallId, type: 'door', offset: 100, width: 90, hingeSide: 'left' }
    expect(validatePlan(plan2)).toBeNull()
  })

  it('accepts a wall with a valid dimension placement', () => {
    const plan = structuredClone(squarePlan())
    Object.values(plan.walls)[0].dimPlacement = { t: 0.75, side: -1 }
    expect(validatePlan(plan)).not.toBeNull()
  })

  it('rejects malformed dimension placements', () => {
    for (const dimPlacement of [{ t: 1.2, side: 1 }, { t: 0.5, side: 0 }, { t: NaN, side: 1 }, 'mid']) {
      const plan = structuredClone(squarePlan())
      // @ts-expect-error deliberately malformed placement
      Object.values(plan.walls)[0].dimPlacement = dimPlacement
      expect(validatePlan(plan)).toBeNull()
    }
  })
})

describe('runMigrations', () => {
  it('applies ordered migrations from the record version', () => {
    const table = {
      0: (plan: unknown) => ({ ...(plan as object), first: true }),
      1: (plan: unknown) => ({ ...(plan as object), second: true }),
    }
    expect(runMigrations(0, {}, table)).toEqual({ first: true, second: true })
    expect(runMigrations(SCHEMA_VERSION, { untouched: 1 }, table)).toEqual({ untouched: 1 })
  })

  it('throws on a missing migration step', () => {
    expect(() => runMigrations(-1, {}, {})).toThrow()
  })
})

describe('storage', () => {
  it('round-trips a plan through save and load', async () => {
    const plan = squarePlan()
    await savePlan(plan)
    const loaded = await loadPlan()
    expect(loaded).toEqual(plan)
  })

  it('returns null when nothing is stored', async () => {
    expect(await loadPlan()).toBeNull()
  })

  it('falls back to the backup when the current record is corrupt', async () => {
    const plan = squarePlan()
    await set(BACKUP_KEY, { schemaVersion: SCHEMA_VERSION, savedAt: 1, plan })
    await set(CURRENT_KEY, { schemaVersion: SCHEMA_VERSION, savedAt: 2, plan: { garbage: true } })
    const loaded = await loadPlan()
    expect(loaded).toEqual(plan)
  })

  it('refreshes the backup after a successful load', async () => {
    const plan = squarePlan()
    await savePlan(plan)
    await loadPlan()
    const backup = (await get(BACKUP_KEY)) as StoredRecord
    expect(backup.plan).toEqual(plan)
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('loads a v1 record unchanged (dimension placement is optional)', async () => {
    const plan = squarePlan()
    await set(CURRENT_KEY, { schemaVersion: 1, savedAt: 1, plan })
    expect(await loadPlan()).toEqual(plan)
  })

  it('rejects records from a future schema version', async () => {
    await set(CURRENT_KEY, { schemaVersion: SCHEMA_VERSION + 1, savedAt: 1, plan: squarePlan() })
    expect(await loadPlan()).toBeNull()
  })
})

describe('autosave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces store changes into a single save', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    usePlanStore.setState({ plan: emptyPlan() })
    const stop = startAutosave({ debounceMs: 400 })

    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'One', 1, 1)[0])
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Two', 2, 2)[0])
    expect(await get(CURRENT_KEY)).toBeUndefined()

    await vi.advanceTimersByTimeAsync(500)
    const record = (await get(CURRENT_KEY)) as StoredRecord
    expect(Object.keys(record.plan.roomLabels)).toHaveLength(2)
    stop()
  })

  it('flushes the pending save on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    usePlanStore.setState({ plan: emptyPlan() })
    const stop = startAutosave({ debounceMs: 400 })
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'One', 1, 1)[0])
    stop()
    await vi.advanceTimersByTimeAsync(0)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 0))
    const record = (await get(CURRENT_KEY)) as StoredRecord
    expect(record).toBeDefined()
  })
})

describe('loadPlan — orphan room labels', () => {
  it('drops labels outside any room and keeps contained ones', async () => {
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
    await savePlan(plan)
    const loaded = await loadPlan()
    expect(Object.keys(loaded?.roomLabels ?? {})).toEqual([inside])
  })
})

describe('loadPlan — coincident points', () => {
  it('merges coincident points so a visually closed loop loads as a room', async () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      const twin = b.point(0, 0) // twin of a: closed on screen, open in the graph
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, twin)
    })
    await savePlan(plan)
    const loaded = await loadPlan()
    expect(Object.keys(loaded!.points)).toHaveLength(4)
    expect(detectRooms(loaded!)).toHaveLength(1)
  })
})

describe('validatePlan — label placement state', () => {
  it('accepts placed: true and rejects other values', () => {
    const base = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(400, 0)
      const d = b.point(400, 300)
      const e = b.point(0, 300)
      b.wall(a, c)
      b.wall(c, d)
      b.wall(d, e)
      b.wall(e, a)
      b.label('Kitchen', 200, 150, true)
    })
    expect(validatePlan(base)).not.toBeNull()
    const label = Object.values(base.roomLabels)[0]
    const bad = { ...base, roomLabels: { [label.id]: { ...label, placed: 'yes' } } }
    expect(validatePlan(bad)).toBeNull()
  })
})
