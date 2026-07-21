import { get, set } from 'idb-keyval';
import type { Plan } from '../model/types';
import type { StoredRecord } from './schema';
import { decodePlanPayload, SCHEMA_VERSION } from './schema';

export const CURRENT_KEY = 'plan:current';
export const BACKUP_KEY = 'plan:backup';

function decodeRecord(value: unknown): Plan | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<StoredRecord>;
  if (typeof record.schemaVersion !== 'number' || record.schemaVersion > SCHEMA_VERSION) return null;
  try {
    return decodePlanPayload(record.schemaVersion, record.plan);
  } catch {
    return null;
  }
}

export function makeRecord(plan: Plan): StoredRecord {
  return { schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), plan };
}

export async function loadPlan(): Promise<Plan | null> {
  let plan: Plan | null = null;
  try {
    plan = decodeRecord(await get(CURRENT_KEY));
  } catch {
    plan = null;
  }
  if (!plan) {
    try {
      plan = decodeRecord(await get(BACKUP_KEY));
    } catch {
      plan = null;
    }
  }
  if (plan) {
    try {
      await set(BACKUP_KEY, makeRecord(plan));
    } catch {
      // backup refresh is best-effort
    }
  }
  return plan;
}

export async function savePlan(plan: Plan): Promise<void> {
  await set(CURRENT_KEY, makeRecord(plan));
}
