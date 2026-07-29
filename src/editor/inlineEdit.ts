// CONTEXT.md: Interaction chrome — the box opened on the sheet to type a Room
// profile or a Text, as one value. Pure, and carrying no plan (ADR 0025).
import type { Vec } from '../model/geometry';
import { addRoomProfile, renameRoomProfile } from '../model/roomProfiles';
import type { ElementRef } from '../model/selection';
import { addText, deleteText, editTextContent } from '../model/texts';
import type { Plan, RoomProfile, TextNote, TextSize } from '../model/types';
import type { RoomTextBlock } from '../sheet/rooms';
import { BLOCK_LINE_HEIGHT, blockNameSlots } from '../sheet/rooms';

export type InlineEdit =
  // `id` is null until the node exists: it is born on a non-empty commit, so an
  // abandoned box leaves no orphan behind.
  | { kind: 'roomProfile'; id: string | null; blockKey: string; at: Vec; initial: string }
  | { kind: 'text'; id: string | null; at: Vec; size: TextSize; initial: string };

interface InlineEditResult {
  plan: Plan;
  /** Only a born Text produces one — the 06 auto-select deferral. */
  selection?: ElementRef[];
}

/** Which slot of a stacked block the box overlays: a profile's own id, or the
 *  block's key while creating the first one. */
export const editedSlot = (edit: InlineEdit | null): string | undefined =>
  edit?.kind === 'roomProfile' ? (edit.id ?? edit.blockKey) : undefined;

export function openRoomProfile(block: RoomTextBlock, profile: RoomProfile | null): InlineEdit {
  // The input overlays the profile's own slot in a stacked block; creation
  // targets the top slot.
  const named = blockNameSlots(block, profile?.id);
  const line = profile
    ? Math.max(
        0,
        named.findIndex((l) => l.id === profile.id),
      )
    : 0;
  return {
    kind: 'roomProfile',
    id: profile?.id ?? null,
    blockKey: block.key,
    at: { x: block.x, y: block.y + line * BLOCK_LINE_HEIGHT },
    initial: profile?.name ?? '',
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
  // A profile is stored trimmed; a Text keeps what was typed, indentation
  // included, and only tests the trim for emptiness.
  const written = edit.kind === 'roomProfile' ? value.trim() : value;
  if (written === edit.initial) return null;
  const empty = written.trim() === '';
  if (edit.kind === 'roomProfile') {
    // An emptied profile is dropped by the rename itself, unless a hand placement
    // keeps it carrying something (CONTEXT.md: Room profile).
    if (edit.id) return { plan: renameRoomProfile(plan, edit.id, written) };
    return empty ? null : { plan: addRoomProfile(plan, written, edit.at.x, edit.at.y)[0] };
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
