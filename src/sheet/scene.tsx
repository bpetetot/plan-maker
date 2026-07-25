import type { ReactNode } from 'react';
import type { Room } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import type { Plan, RoomLabel } from '../model/types';
import { DimLabel, RulerLabel } from './measures';
import { OpeningGlyph } from './openings';
import { COLORS } from './paint';
import type { RoomTextBlock } from './rooms';
import { RoomOverlay } from './rooms';
import { TextNoteView } from './texts';
import { JunctionPatches, WallLine } from './walls';

// How one element is dressed. `onPointerDown` is what the element answers to
// *in the sheet*: for a wall that is its Dimension plate, the body being chrome.
export interface ElementDecor {
  selected?: boolean;
  hovered?: boolean;
  hidden?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

// The screen's dressing of the whole sheet, absent from the export. `element`
// covers the four families an ElementRef names; a Room label is not one of them,
// so the overlay's own wiring rides beside it.
export interface SheetDecor {
  element: (ref: ElementRef) => ElementDecor | undefined;
  pxPerCm: number;
  /** Reconciled mid-drag, so the labels shown are not always the plan's. */
  labels?: RoomLabel[];
  editingKey?: string;
  onLinePointerDown?: (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => void;
  onLineDoubleClick?: (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => void;
}

// The sheet: everything the export prints and nothing else (spec §7, ADR 0005).
// Both adapters call it, which is what keeps them in step — the screen adds its
// dressing and its chrome, the export passes neither.
export function PlanScene({
  plan,
  rooms,
  measuresVisible,
  dimFontPx,
  decor,
  chrome,
}: {
  plan: Plan;
  rooms: Room[];
  measuresVisible: boolean;
  dimFontPx?: number;
  decor?: SheetDecor;
  chrome?: ReactNode;
}) {
  const dress = (type: ElementRef['type'], id: string) => decor?.element({ type, id });
  return (
    <>
      {Object.values(plan.walls).map((wall) => {
        const d = dress('wall', wall.id);
        return (
          <WallLine
            key={wall.id}
            plan={plan}
            wall={wall}
            color={d?.selected ? COLORS.wallSelected : d?.hovered ? COLORS.wallHover : undefined}
          />
        );
      })}
      <JunctionPatches plan={plan} selected={(wallId) => Boolean(dress('wall', wallId)?.selected)} />
      {Object.values(plan.openings).map((opening) => (
        <OpeningGlyph
          key={opening.id}
          plan={plan}
          opening={opening}
          selected={dress('opening', opening.id)?.selected}
        />
      ))}
      <RoomOverlay
        rooms={rooms}
        labels={decor?.labels ?? Object.values(plan.roomLabels)}
        measuresVisible={measuresVisible}
        editingKey={decor?.editingKey}
        onLinePointerDown={decor?.onLinePointerDown}
        onLineDoubleClick={decor?.onLineDoubleClick}
      />
      {/* Always-visible content (CONTEXT.md: Text): never gated by the measures
          toggle, unlike the dimensions and rulers below. */}
      {Object.values(plan.texts).map((text) => {
        const d = dress('text', text.id);
        return d?.hidden ? null : (
          <TextNoteView
            key={text.id}
            text={text}
            pxPerCm={decor?.pxPerCm}
            interactive={Boolean(d?.onPointerDown)}
            selected={d?.selected}
            onPointerDown={d?.onPointerDown}
            onDoubleClick={d?.onDoubleClick}
          />
        );
      })}
      {/* The one place chrome slips inside the sheet: the grab zones belong
          under the measures, or a Dimension plate loses the hit-test to them. */}
      {chrome}
      {measuresVisible &&
        Object.values(plan.walls).map((wall) => {
          const d = dress('wall', wall.id);
          return (
            <DimLabel
              key={wall.id}
              plan={plan}
              wall={wall}
              fontPx={dimFontPx}
              selected={d?.selected}
              onPointerDown={d?.onPointerDown}
            />
          );
        })}
      {measuresVisible &&
        Object.values(plan.rulers).map((ruler) => {
          const d = dress('ruler', ruler.id);
          return (
            <RulerLabel
              key={ruler.id}
              ruler={ruler}
              fontPx={dimFontPx}
              selected={d?.selected}
              hovered={d?.hovered}
            />
          );
        })}
    </>
  );
}
