import type { Plan } from '../model/types'
import { decodePlanPayload, SCHEMA_VERSION } from '../persistence/schema'

// Transfer envelope, spec §7: `format` rejects foreign JSON, `version` replays
// the storage migration chain.

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
  let decoded: Plan | null
  try {
    decoded = decodePlanPayload(version, plan)
  } catch {
    // old version, no migration path: unreadable, not "newer"
    decoded = null
  }
  if (!decoded) return { ok: false, reason: 'invalid-plan' }
  return { ok: true, plan: decoded }
}

export function transferFileName(extension: 'json' | 'png', date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `plan-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.${extension}`
}
