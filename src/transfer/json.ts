import type { Plan } from '../model/types';
import type { DecodeIssue } from '../persistence/schema';
import { decodePlanPayload, SCHEMA_VERSION } from '../persistence/schema';

// Transfer envelope, spec §7: `format` rejects foreign JSON, `version` is read
// by the shared decoding, which replays the migration chain.

const FILE_FORMAT = 'plan-maker';

export type ImportIssue = 'invalid-json' | 'wrong-format' | DecodeIssue;

export type ParseResult = { ok: true; plan: Plan } | { ok: false; reason: ImportIssue };

export function serializePlanFile(plan: Plan): string {
  return JSON.stringify({ format: FILE_FORMAT, version: SCHEMA_VERSION, plan }, null, 2);
}

export function parsePlanFile(text: string): ParseResult {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (typeof envelope !== 'object' || envelope === null) return { ok: false, reason: 'wrong-format' };
  const { format, version, plan } = envelope as Record<string, unknown>;
  if (format !== FILE_FORMAT) return { ok: false, reason: 'wrong-format' };
  return decodePlanPayload(version, plan);
}

export function transferFileName(extension: 'json' | 'png', date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `plan-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.${extension}`;
}
