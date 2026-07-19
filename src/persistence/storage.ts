import { get, set } from 'idb-keyval'
import { dropOrphanRoomLabels } from '../model/rooms'
import type { Plan } from '../model/types'
import type { StoredRecord } from './schema'
import { runMigrations, SCHEMA_VERSION, validatePlan } from './schema'

export const CURRENT_KEY = 'plan:current'
export const BACKUP_KEY = 'plan:backup'

function decodeRecord(value: unknown): Plan | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Partial<StoredRecord>
  if (typeof record.schemaVersion !== 'number' || record.schemaVersion > SCHEMA_VERSION) return null
  try {
    const plan = validatePlan(runMigrations(record.schemaVersion, record.plan))
    return plan && dropOrphanRoomLabels(plan)
  } catch {
    return null
  }
}

export function makeRecord(plan: Plan): StoredRecord {
  return { schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), plan }
}

// Loads the current record, falling back to the last-known-good backup when the
// current one is missing or fails validation. A successful load refreshes the
// backup with the loaded (already migrated) plan.
export async function loadPlan(): Promise<Plan | null> {
  let plan: Plan | null = null
  try {
    plan = decodeRecord(await get(CURRENT_KEY))
  } catch {
    plan = null
  }
  if (!plan) {
    try {
      plan = decodeRecord(await get(BACKUP_KEY))
    } catch {
      plan = null
    }
  }
  if (plan) {
    try {
      await set(BACKUP_KEY, makeRecord(plan))
    } catch {
      // backup refresh is best-effort
    }
  }
  return plan
}

export async function savePlan(plan: Plan): Promise<void> {
  await set(CURRENT_KEY, makeRecord(plan))
}
