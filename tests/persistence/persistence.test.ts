import 'fake-indexeddb/auto';
import { clear, get, set } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRoomProfile } from '../../src/model/roomProfiles';
import { detectRooms } from '../../src/model/rooms';
import { buildPlan } from '../helpers';
import { emptyPlan } from '../../src/model/types';
import { beginEdit, editPlan, usePlanStore } from '../../src/store/planStore';
import { startAutosave } from '../../src/persistence/autosave';
import { decodePlanPayload, SCHEMA_VERSION, type StoredRecord } from '../../src/persistence/schema';
import { BACKUP_KEY, CURRENT_KEY, loadPlan, savePlan } from '../../src/persistence/storage';

const squarePlan = () =>
  buildPlan((b) => {
    const a = b.point(0, 0);
    const c = b.point(400, 0);
    const d = b.point(400, 300);
    const e = b.point(0, 300);
    b.wall(a, c);
    b.wall(c, d);
    b.wall(d, e);
    b.wall(e, a);
  });

const decode = (payload: unknown) => decodePlanPayload(SCHEMA_VERSION, payload);

beforeEach(async () => {
  await clear();
});

describe('decodePlanPayload', () => {
  it('accepts a valid plan', () => {
    expect(decode(squarePlan()).ok).toBe(true);
    expect(decode(emptyPlan()).ok).toBe(true);
  });

  it('rejects non-objects and missing collections', () => {
    expect(decode(null)).toEqual({ ok: false, reason: 'invalid-plan' });
    expect(decode('nope')).toEqual({ ok: false, reason: 'invalid-plan' });
    expect(decode({ points: {}, walls: {} })).toEqual({ ok: false, reason: 'invalid-plan' });
  });

  it('rejects a version it cannot reach, in either direction', () => {
    expect(decodePlanPayload(SCHEMA_VERSION + 1, squarePlan())).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
    expect(decodePlanPayload('2', squarePlan())).toEqual({ ok: false, reason: 'unsupported-version' });
    // older than the oldest migration: unreadable, not "newer"
    expect(decodePlanPayload(0, squarePlan())).toEqual({ ok: false, reason: 'invalid-plan' });
  });

  it('rejects walls referencing missing points', () => {
    const plan = squarePlan();
    const broken = structuredClone(plan) as { walls: Record<string, { startPointId: string }> };
    Object.values(broken.walls)[0].startPointId = 'missing';
    expect(decode(broken).ok).toBe(false);
  });

  it('rejects openings referencing missing walls or with bad door fields', () => {
    const plan = structuredClone(squarePlan());
    plan.openings['o1'] = { id: 'o1', wallId: 'missing', type: 'window', offset: 100, width: 90 };
    expect(decode(plan).ok).toBe(false);

    const plan2 = structuredClone(squarePlan());
    const wallId = Object.keys(plan2.walls)[0];
    // @ts-expect-error deliberately malformed door
    plan2.openings['o1'] = { id: 'o1', wallId, type: 'door', offset: 100, width: 90, hingeSide: 'left' };
    expect(decode(plan2).ok).toBe(false);
  });

  it('accepts a wall with a valid dimension placement', () => {
    const plan = structuredClone(squarePlan());
    Object.values(plan.walls)[0].dimPlacement = { t: 0.75, side: -1 };
    expect(decode(plan).ok).toBe(true);
  });

  it('rejects malformed dimension placements', () => {
    for (const dimPlacement of [{ t: 1.2, side: 1 }, { t: 0.5, side: 0 }, { t: NaN, side: 1 }, 'mid']) {
      const plan = structuredClone(squarePlan());
      // @ts-expect-error deliberately malformed placement
      Object.values(plan.walls)[0].dimPlacement = dimPlacement;
      expect(decode(plan).ok).toBe(false);
    }
  });

  it('accepts a plan carrying a valid ruler', () => {
    const plan = structuredClone(squarePlan());
    plan.rulers['r1'] = { id: 'r1', a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, t: 0.5 };
    expect(decode(plan).ok).toBe(true);
  });

  it('rejects malformed rulers', () => {
    const rulers = [
      { id: 'other', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, t: 0.5 }, // id ≠ key
      { id: 'r1', a: { x: 0.5, y: 0 }, b: { x: 10, y: 0 }, t: 0.5 }, // non-integer cm
      { id: 'r1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, t: 1.5 }, // t out of [0,1]
      { id: 'r1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, t: NaN }, // t not finite
      { id: 'r1', a: { x: 0, y: 0 }, t: 0.5 }, // missing endpoint
      'nope',
    ];
    for (const ruler of rulers) {
      const plan = structuredClone(squarePlan()) as { rulers: Record<string, unknown> };
      plan.rulers['r1'] = ruler;
      expect(decode(plan).ok).toBe(false);
    }
  });

  it('tolerates a plan missing the rulers field, defaulting it to empty', () => {
    const plan = structuredClone(squarePlan()) as Partial<ReturnType<typeof squarePlan>>;
    delete plan.rulers;
    const result = decode(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.rulers).toEqual({});
  });

  it('accepts a plan carrying a valid text note', () => {
    const plan = structuredClone(squarePlan());
    plan.texts['t1'] = { id: 't1', x: 100, y: 50, content: 'Garage', size: 'M' };
    expect(decode(plan).ok).toBe(true);
  });

  it('rejects malformed text notes', () => {
    const texts = [
      { id: 'other', x: 0, y: 0, content: 'A', size: 'M' }, // id ≠ key
      { id: 't1', x: 0.5, y: 0, content: 'A', size: 'M' }, // non-integer cm
      { id: 't1', x: 0, y: 0, content: 12, size: 'M' }, // content not a string
      { id: 't1', x: 0, y: 0, content: 'A', size: 'XL' }, // size outside S/M/L
      { id: 't1', x: 0, y: 0, content: 'A' }, // missing size
      'nope',
    ];
    for (const text of texts) {
      const plan = structuredClone(squarePlan()) as { texts: Record<string, unknown> };
      plan.texts['t1'] = text;
      expect(decode(plan).ok).toBe(false);
    }
  });

  it('tolerates a plan missing the texts field, defaulting it to empty', () => {
    const plan = structuredClone(squarePlan()) as Partial<ReturnType<typeof squarePlan>>;
    delete plan.texts;
    const result = decode(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.texts).toEqual({});
  });
});

describe('storage', () => {
  it('round-trips a plan through save and load', async () => {
    const plan = squarePlan();
    await savePlan(plan);
    const loaded = await loadPlan();
    expect(loaded).toEqual(plan);
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadPlan()).toBeNull();
  });

  it('falls back to the backup when the current record is corrupt', async () => {
    const plan = squarePlan();
    await set(BACKUP_KEY, { schemaVersion: SCHEMA_VERSION, plan });
    await set(CURRENT_KEY, { schemaVersion: SCHEMA_VERSION, plan: { garbage: true } });
    const loaded = await loadPlan();
    expect(loaded).toEqual(plan);
  });

  it('refreshes the backup after a successful load', async () => {
    const plan = squarePlan();
    await savePlan(plan);
    await loadPlan();
    const backup = (await get(BACKUP_KEY)) as StoredRecord;
    expect(backup.plan).toEqual(plan);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('loads a v1 record unchanged (dimension placement is optional)', async () => {
    const plan = squarePlan();
    await set(CURRENT_KEY, { schemaVersion: 1, plan });
    expect(await loadPlan()).toEqual(plan);
  });

  it('rejects records from a future schema version', async () => {
    await set(CURRENT_KEY, { schemaVersion: SCHEMA_VERSION + 1, plan: squarePlan() });
    expect(await loadPlan()).toBeNull();
  });
});

describe('autosave', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces store changes into a single save', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    usePlanStore.setState({ plan: emptyPlan() });
    const stop = startAutosave({ debounceMs: 400 });

    editPlan((p) => addRoomProfile(p, 'One', 1, 1)[0]);
    editPlan((p) => addRoomProfile(p, 'Two', 2, 2)[0]);
    expect(await get(CURRENT_KEY)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(500);
    const record = (await get(CURRENT_KEY)) as StoredRecord;
    expect(Object.keys(record.plan.roomProfiles)).toHaveLength(2);
    stop();
  });

  it('saves nothing while an Edit is open, then the plan it landed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    usePlanStore.setState({ plan: emptyPlan(), editOpen: false });
    const stop = startAutosave({ debounceMs: 400 });

    const edit = beginEdit();
    edit.aim(addRoomProfile(usePlanStore.getState().plan, 'Aimed', 1, 1)[0]);
    await vi.advanceTimersByTimeAsync(500);
    expect(await get(CURRENT_KEY)).toBeUndefined();

    // The settle can return the aimed plan untouched, so the landing shares its
    // reference: the save must still happen.
    edit.land(usePlanStore.getState().plan);
    await vi.advanceTimersByTimeAsync(500);
    const record = (await get(CURRENT_KEY)) as StoredRecord;
    expect(Object.keys(record.plan.roomProfiles)).toHaveLength(1);
    stop();
  });

  it('flushes the pending save on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    usePlanStore.setState({ plan: emptyPlan() });
    const stop = startAutosave({ debounceMs: 400 });
    editPlan((p) => addRoomProfile(p, 'One', 1, 1)[0]);
    stop();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await expect.poll(() => get(CURRENT_KEY)).toBeDefined();
  });
});

describe('loadPlan — orphan room profiles', () => {
  it('drops profiles outside any room and keeps contained ones', async () => {
    let inside = '';
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const e = b.point(0, 300);
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      inside = b.profile('Kitchen', 200, 150).id;
      b.profile('Orphan', 900, 900);
    });
    await savePlan(plan);
    const loaded = await loadPlan();
    expect(Object.keys(loaded?.roomProfiles ?? {})).toEqual([inside]);
  });
});

describe('loadPlan — coincident points', () => {
  it('merges coincident points so a visually closed loop loads as a room', async () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const e = b.point(0, 300);
      const twin = b.point(0, 0); // twin of a: closed on screen, open in the graph
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, twin);
    });
    await savePlan(plan);
    const loaded = await loadPlan();
    expect(Object.keys(loaded!.points)).toHaveLength(4);
    expect(detectRooms(loaded!)).toHaveLength(1);
  });
});

describe('decodePlanPayload — profile placement state', () => {
  it('accepts placed: true and rejects other values', () => {
    const base = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const e = b.point(0, 300);
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      b.profile('Kitchen', 200, 150, true);
    });
    expect(decode(base).ok).toBe(true);
    const profile = Object.values(base.roomProfiles)[0];
    const bad = { ...base, roomProfiles: { [profile.id]: { ...profile, placed: 'yes' } } };
    expect(decode(bad).ok).toBe(false);
  });

  it('accepts condemned: true and rejects other values', () => {
    const base = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const e = b.point(0, 300);
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      b.profile('Kitchen', 200, 150);
    });
    const profile = Object.values(base.roomProfiles)[0];
    const marked = { ...base, roomProfiles: { [profile.id]: { ...profile, condemned: true } } };
    expect(decode(marked).ok).toBe(true);
    const bad = { ...base, roomProfiles: { [profile.id]: { ...profile, condemned: 1 } } };
    expect(decode(bad).ok).toBe(false);
  });
});
