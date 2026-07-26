// Free-coordinate measurement (CONTEXT.md: Ruler): endpoints are its own, not
// shared Points, so nothing in the wall graph moves it.
import type { Vec } from './geometry';
import type { Plan, Ruler } from './types';
import { newId } from './types';

// `t` centers the value along A→B.
export function addRuler(
  plan: Plan,
  a: { x: number; y: number },
  b: { x: number; y: number },
  t = 0.5,
): [Plan, string] {
  const id = newId();
  const ruler: Ruler = {
    id,
    a: { x: Math.round(a.x), y: Math.round(a.y) },
    b: { x: Math.round(b.x), y: Math.round(b.y) },
    t,
  };
  return [{ ...plan, rulers: { ...plan.rulers, [id]: ruler } }, id];
}

export function moveRulerEndpoint(plan: Plan, id: string, end: 'a' | 'b', x: number, y: number): Plan {
  const ruler = plan.rulers[id];
  if (!ruler) return plan;
  const moved = { ...ruler, [end]: { x: Math.round(x), y: Math.round(y) } };
  return { ...plan, rulers: { ...plan.rulers, [id]: moved } };
}

// A group move carries a Ruler rigidly: both endpoints shift and `t`, a ratio,
// is untouched.
export function translateRuler(plan: Plan, id: string, dx: number, dy: number): Plan {
  const ruler = plan.rulers[id];
  if (!ruler) return plan;
  const moved = {
    ...ruler,
    a: { x: Math.round(ruler.a.x + dx), y: Math.round(ruler.a.y + dy) },
    b: { x: Math.round(ruler.b.x + dx), y: Math.round(ruler.b.y + dy) },
  };
  return { ...plan, rulers: { ...plan.rulers, [id]: moved } };
}

/** The Ruler's own direction, unit length — the line a held Shift slides an
 *  endpoint along. Empty when the two endpoints coincide. */
export function rulerAxes(ruler: Ruler): Vec[] {
  const dx = ruler.b.x - ruler.a.x;
  const dy = ruler.b.y - ruler.a.y;
  const length = Math.hypot(dx, dy);
  return length < 1 ? [] : [{ x: dx / length, y: dy / length }];
}

export function deleteRuler(plan: Plan, id: string): Plan {
  if (!plan.rulers[id]) return plan;
  const rulers = { ...plan.rulers };
  delete rulers[id];
  return { ...plan, rulers };
}
