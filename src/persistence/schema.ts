import type { Opening, Plan } from '../model/types'

// One schema, one migration path (spec §7): the IndexedDB record and the JSON
// export file share this version and replay the same ordered migrations.
export const SCHEMA_VERSION = 1

export interface StoredRecord {
  schemaVersion: number
  savedAt: number
  plan: Plan
}

// Keyed by the version they migrate FROM; applied in order up to SCHEMA_VERSION.
type Migration = (plan: unknown) => unknown
export const migrations: Record<number, Migration> = {}

export function runMigrations(
  fromVersion: number,
  plan: unknown,
  table: Record<number, Migration> = migrations,
): unknown {
  let current = plan
  for (let version = fromVersion; version < SCHEMA_VERSION; version++) {
    const migrate = table[version]
    if (!migrate) throw new Error(`No migration from schema version ${version}`)
    current = migrate(current)
  }
  return current
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Spec §2: units are integer centimeters.
const isCm = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

function isValidOpening(value: unknown, wallIds: Set<string>): value is Opening {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.wallId !== 'string') return false
  if (!wallIds.has(value.wallId)) return false
  if (!isCm(value.offset) || !isCm(value.width)) return false
  if (value.type === 'door') {
    return (
      (value.hingeSide === 'start' || value.hingeSide === 'end') &&
      (value.swing === 'in' || value.swing === 'out')
    )
  }
  return value.type === 'window'
}

// Structural + referential validation of a plan at the CURRENT schema version.
export function validatePlan(value: unknown): Plan | null {
  if (!isRecord(value)) return null
  const { points, walls, openings, roomLabels } = value
  if (!isRecord(points) || !isRecord(walls) || !isRecord(openings) || !isRecord(roomLabels)) return null

  for (const [id, point] of Object.entries(points)) {
    if (!isRecord(point) || point.id !== id || !isCm(point.x) || !isCm(point.y)) return null
  }
  for (const [id, wall] of Object.entries(walls)) {
    if (!isRecord(wall) || wall.id !== id) return null
    if (typeof wall.startPointId !== 'string' || typeof wall.endPointId !== 'string') return null
    if (!(wall.startPointId in points) || !(wall.endPointId in points)) return null
    if (!isCm(wall.thickness)) return null
  }
  const wallIds = new Set(Object.keys(walls))
  for (const [id, opening] of Object.entries(openings)) {
    if (!isValidOpening(opening, wallIds) || opening.id !== id) return null
  }
  for (const [id, label] of Object.entries(roomLabels)) {
    if (!isRecord(label) || label.id !== id) return null
    if (typeof label.name !== 'string' || !isCm(label.x) || !isCm(label.y)) return null
  }

  return value as unknown as Plan
}
