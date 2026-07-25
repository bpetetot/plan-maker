// Free-text annotation (CONTEXT.md: Text): always-visible content with a free
// anchor, never part of the wall graph.
import type { Plan, TextNote, TextSize } from './types';
import { newId } from './types';

// `(x, y)` is the top-left anchor.
export function addText(
  plan: Plan,
  x: number,
  y: number,
  content: string,
  size: TextSize = 'M',
): [Plan, string] {
  const id = newId();
  const text: TextNote = { id, x: Math.round(x), y: Math.round(y), content, size };
  return [{ ...plan, texts: { ...plan.texts, [id]: text } }, id];
}

// A group move carries a Text rigidly, like a Ruler: it has one anchor, no
// endpoint handles, and the whole block shifts by the delta.
export function translateText(plan: Plan, id: string, dx: number, dy: number): Plan {
  const text = plan.texts[id];
  if (!text) return plan;
  const moved = { ...text, x: Math.round(text.x + dx), y: Math.round(text.y + dy) };
  return { ...plan, texts: { ...plan.texts, [id]: moved } };
}

export function editTextContent(plan: Plan, id: string, content: string): Plan {
  const text = plan.texts[id];
  if (!text) return plan;
  return { ...plan, texts: { ...plan.texts, [id]: { ...text, content } } };
}

export function setTextSize(plan: Plan, id: string, size: TextSize): Plan {
  const text = plan.texts[id];
  if (!text) return plan;
  return { ...plan, texts: { ...plan.texts, [id]: { ...text, size } } };
}

export function deleteText(plan: Plan, id: string): Plan {
  if (!plan.texts[id]) return plan;
  const texts = { ...plan.texts };
  delete texts[id];
  return { ...plan, texts };
}
