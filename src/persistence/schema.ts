import { settlePlan } from '../model/settle';
import type { Opening, Plan, Ruler, TextNote } from '../model/types';

// Spec §7: the IndexedDB record and the JSON export file share this version.
export const SCHEMA_VERSION = 2;

export interface StoredRecord {
  schemaVersion: number;
  plan: Plan;
}

export type DecodeIssue = 'unsupported-version' | 'invalid-plan';

type DecodeResult = { ok: true; plan: Plan } | { ok: false; reason: DecodeIssue };

// Keyed by the version they migrate FROM.
type Migration = (plan: unknown) => unknown;
const migrations: Record<number, Migration> = {
  // v2 only added the optional Wall.dimPlacement: v1 plans are already valid v2.
  1: (plan) => plan,
};

function runMigrations(fromVersion: number, plan: unknown): unknown {
  let current = plan;
  for (let version = fromVersion; version < SCHEMA_VERSION; version++) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`No migration from schema version ${version}`);
    current = migrate(current);
  }
  return current;
}

/** The one reading of a versioned plan: the file and the stored record hand it
 *  their version and payload, and add nothing but their own failure policy. */
export function decodePlanPayload(version: unknown, payload: unknown): DecodeResult {
  if (typeof version !== 'number' || version > SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }
  let migrated: unknown;
  try {
    migrated = runMigrations(version, payload);
  } catch {
    // an old version with no migration path: unreadable, not "newer"
    return { ok: false, reason: 'invalid-plan' };
  }
  const validated = validatePlan(migrated);
  return validated ? { ok: true, plan: settlePlan(validated) } : { ok: false, reason: 'invalid-plan' };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Spec §2: units are integer centimeters.
const isCm = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

const isCmPoint = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && isCm(value.x) && isCm(value.y);

// Free coordinates (not shared Points), `t` a ratio in [0, 1]; see CONTEXT.md.
function isValidRuler(value: unknown): value is Ruler {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (!isCmPoint(value.a) || !isCmPoint(value.b)) return false;
  return typeof value.t === 'number' && Number.isFinite(value.t) && value.t >= 0 && value.t <= 1;
}

// Free coordinates (not shared Points), a preset size; see CONTEXT.md.
function isValidTextNote(value: unknown): value is TextNote {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (!isCm(value.x) || !isCm(value.y)) return false;
  if (typeof value.content !== 'string') return false;
  return value.size === 'S' || value.size === 'M' || value.size === 'L';
}

function isValidOpening(value: unknown, wallIds: Set<string>): value is Opening {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.wallId !== 'string') return false;
  if (!wallIds.has(value.wallId)) return false;
  if (!isCm(value.offset) || !isCm(value.width)) return false;
  if (value.type === 'door') {
    return (
      (value.hingeSide === 'start' || value.hingeSide === 'end') &&
      (value.swing === 'in' || value.swing === 'out')
    );
  }
  return value.type === 'window';
}

// Assumes the plan is already migrated to SCHEMA_VERSION.
function validatePlan(value: unknown): Plan | null {
  if (!isRecord(value)) return null;
  const { points, walls, openings, roomProfiles } = value;
  if (!isRecord(points) || !isRecord(walls) || !isRecord(openings) || !isRecord(roomProfiles)) return null;

  for (const [id, point] of Object.entries(points)) {
    if (!isRecord(point) || point.id !== id || !isCm(point.x) || !isCm(point.y)) return null;
  }
  for (const [id, wall] of Object.entries(walls)) {
    if (!isRecord(wall) || wall.id !== id) return null;
    if (typeof wall.startPointId !== 'string' || typeof wall.endPointId !== 'string') return null;
    if (!(wall.startPointId in points) || !(wall.endPointId in points)) return null;
    if (!isCm(wall.thickness)) return null;
    if (wall.dimPlacement !== undefined) {
      const dp = wall.dimPlacement;
      if (!isRecord(dp)) return null;
      if (typeof dp.t !== 'number' || !Number.isFinite(dp.t) || dp.t < 0 || dp.t > 1) return null;
      if (dp.side !== 1 && dp.side !== -1) return null;
    }
  }
  const wallIds = new Set(Object.keys(walls));
  for (const [id, opening] of Object.entries(openings)) {
    if (!isValidOpening(opening, wallIds) || opening.id !== id) return null;
  }
  for (const [id, profile] of Object.entries(roomProfiles)) {
    if (!isRecord(profile) || profile.id !== id) return null;
    if (typeof profile.name !== 'string' || !isCm(profile.x) || !isCm(profile.y)) return null;
    if (profile.placed !== undefined && profile.placed !== true) return null;
  }

  // Rulers arrived after v2 (pre-production, no migration): plans without the
  // field are valid and read as empty.
  const rulers = value.rulers ?? {};
  if (!isRecord(rulers)) return null;
  for (const [id, ruler] of Object.entries(rulers)) {
    if (!isValidRuler(ruler) || ruler.id !== id) return null;
  }

  // Texts arrived after v2 (pre-production, no migration): plans without the
  // field are valid and read as empty.
  const texts = value.texts ?? {};
  if (!isRecord(texts)) return null;
  for (const [id, text] of Object.entries(texts)) {
    if (!isValidTextNote(text) || text.id !== id) return null;
  }

  return { ...value, rulers, texts } as unknown as Plan;
}
