// CONTEXT.md: Interaction chrome — the box opened on the sheet to type a Room
// label or a Text, as one value. Pure, and carrying no plan (ADR 0025).
import type { Vec } from '../model/geometry';
import { addRoomLabel, renameRoomLabel } from '../model/roomLabels';
import type { ElementRef } from '../model/selection';
import { addText, deleteText, editTextContent } from '../model/texts';
import type { Plan, RoomLabel, TextNote, TextSize } from '../model/types';
import type { RoomTextBlock } from '../sheet/rooms';
import { BLOCK_LINE_HEIGHT, blockNameSlots } from '../sheet/rooms';

export type InlineEdit =
  // `id` is null until the node exists: it is born on a non-empty commit, so an
  // abandoned box leaves no orphan behind.
  | { kind: 'roomLabel'; id: string | null; blockKey: string; at: Vec; initial: string }
  | { kind: 'text'; id: string | null; at: Vec; size: TextSize; initial: string };

interface InlineEditResult {
  plan: Plan;
  /** Only a born Text produces one — the 06 auto-select deferral. */
  selection?: ElementRef[];
}

/** Which slot of a stacked block the box overlays: a label's own id, or the
 *  block's key while creating the first one. */
export const editedSlot = (edit: InlineEdit | null): string | undefined =>
  edit?.kind === 'roomLabel' ? (edit.id ?? edit.blockKey) : undefined;

export function openRoomLabel(block: RoomTextBlock, label: RoomLabel | null): InlineEdit {
  // The input overlays the label's own slot in a stacked block; creation
  // targets the top slot.
  const named = blockNameSlots(block, label?.id);
  const line = label
    ? Math.max(
        0,
        named.findIndex((l) => l.id === label.id),
      )
    : 0;
  return {
    kind: 'roomLabel',
    id: label?.id ?? null,
    blockKey: block.key,
    at: { x: block.x, y: block.y + line * BLOCK_LINE_HEIGHT },
    initial: label?.name ?? '',
  };
}

export const openText = (text: TextNote): InlineEdit => ({
  kind: 'text',
  id: text.id,
  at: { x: text.x, y: text.y },
  size: text.size,
  initial: text.content,
});

/** Where a Text placement leaves its box (CONTEXT.md: Tool) — no node yet. */
export const placeText = (spot: { x: number; y: number; size: TextSize }): InlineEdit => ({
  kind: 'text',
  id: null,
  at: { x: spot.x, y: spot.y },
  size: spot.size,
  initial: '',
});

/** null when the box writes nothing: Escape, a value left unchanged, or an
 *  empty creation. */
export function commitInlineEdit(
  plan: Plan,
  edit: InlineEdit,
  value: string | null,
): InlineEditResult | null {
  if (value === null) return null;
  // A label is stored trimmed; a Text keeps what was typed, indentation
  // included, and only tests the trim for emptiness.
  const written = edit.kind === 'roomLabel' ? value.trim() : value;
  if (written === edit.initial) return null;
  const empty = written.trim() === '';
  if (edit.kind === 'roomLabel') {
    // An emptied label is dropped by the rename itself, unless a hand placement
    // keeps it carrying something (CONTEXT.md: Room label).
    if (edit.id) return { plan: renameRoomLabel(plan, edit.id, written) };
    return empty ? null : { plan: addRoomLabel(plan, written, edit.at.x, edit.at.y)[0] };
  }
  if (edit.id) {
    return { plan: empty ? deleteText(plan, edit.id) : editTextContent(plan, edit.id, written) };
  }
  if (empty) return null;
  // A placed Text hands back to Select, selected — mirroring a placed Ruler and
  // Opening.
  const [next, id] = addText(plan, edit.at.x, edit.at.y, written, edit.size);
  return { plan: next, selection: [{ type: 'text', id }] };
}
