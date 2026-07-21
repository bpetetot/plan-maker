import type { Plan } from '../model/types';
import { replacePlan, usePlanStore } from '../store/planStore';
import { parsePlanFile, serializePlanFile, transferFileName } from './json';

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPlanJson(plan: Plan) {
  downloadBlob(new Blob([serializePlanFile(plan)], { type: 'application/json' }), transferFileName('json'));
}

const IMPORT_ERRORS: Record<string, string> = {
  'invalid-json': 'This file is not valid JSON.',
  'wrong-format': 'This file is not a Plan Maker export.',
  'unsupported-version': 'This file comes from a newer version of Plan Maker.',
  'invalid-plan': 'This file is damaged and cannot be imported.',
};

// Import always replaces, never merges (spec §7).
export function importPlanJson(onError: (message: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const result = parsePlanFile(await file.text());
    if (!result.ok) {
      onError(IMPORT_ERRORS[result.reason]);
      return;
    }
    const hasWalls = Object.keys(usePlanStore.getState().plan.walls).length > 0;
    if (hasWalls && !window.confirm('Replace the current plan? It will be lost.')) return;
    replacePlan(result.plan);
  };
  input.click();
}
