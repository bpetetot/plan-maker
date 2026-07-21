import type { Cm } from './types';

// Spec §2: meters with 2 decimals from 1 m up, else cm.
export function formatLength(cm: Cm): string {
  const rounded = Math.round(cm);
  if (rounded < 100) return `${rounded} cm`;
  return `${(rounded / 100).toFixed(2).replace('.', ',')} m`;
}

export function formatArea(cm2: number): string {
  return `${(cm2 / 10_000).toFixed(2).replace('.', ',')} m²`;
}
