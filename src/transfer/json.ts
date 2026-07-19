import { dropOrphanRoomLabels } from '../model/rooms'
import type { Plan } from '../model/types'
import { runMigrations, SCHEMA_VERSION, validatePlan } from '../persistence/schema'

// JSON transfer file (spec §7): persisted model + envelope. `format` cleanly
// rejects foreign JSON; `version` replays the same migration chain as storage.

export const FILE_FORMAT = 'plan-maker'

export type ParseResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: 'invalid-json' | 'wrong-format' | 'unsupported-version' | 'invalid-plan' }

export function serializePlanFile(plan: Plan): string {
  return JSON.stringify({ format: FILE_FORMAT, version: SCHEMA_VERSION, plan }, null, 2)
}

export function parsePlanFile(text: string): ParseResult {
  let envelope: unknown
  try {
    envelope = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof envelope !== 'object' || envelope === null) return { ok: false, reason: 'wrong-format' }
  const { format, version, plan } = envelope as Record<string, unknown>
  if (format !== FILE_FORMAT) return { ok: false, reason: 'wrong-format' }
  if (typeof version !== 'number' || version > SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported-version' }
  }
  let migrated: unknown
  try {
    migrated = runMigrations(version, plan)
  } catch {
    // an old version with no registered migration path is unreadable, not "newer"
    return { ok: false, reason: 'invalid-plan' }
  }
  const validated = validatePlan(migrated)
  if (!validated) return { ok: false, reason: 'invalid-plan' }
  return { ok: true, plan: dropOrphanRoomLabels(validated) }
}

export function transferFileName(extension: 'json' | 'png', date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `plan-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.${extension}`
}
