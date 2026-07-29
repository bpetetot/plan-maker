import type { ReactNode } from 'react';
import { detectRooms } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import type { Plan, RoomProfile } from '../model/types';
import { DimLabel, RulerLabel } from './measures';
import { OpeningGlyph } from './openings';
import { COLORS } from './paint';
import type { RoomTextBlock } from './rooms';
import { CondemnedHatching, RoomOverlay } from './rooms';
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

// A Room profile is not an ElementRef, so the overlay's wiring rides beside
// `element` rather than through it.
export interface SheetDecor {
  element: (ref: ElementRef) => ElementDecor | undefined;
  pxPerCm: number;
  /** Reconciled mid-drag, so the profiles shown are not always the plan's. */
  profiles?: RoomProfile[];
  editingKey?: string;
  onLinePointerDown?: (block: RoomTextBlock, profile: RoomProfile | null, e: React.PointerEvent) => void;
  onLineDoubleClick?: (block: RoomTextBlock, profile: RoomProfile | null, e: React.MouseEvent) => void;
}

// The Sheet (CONTEXT.md), called by both adapters — which is what keeps them in
// step. The export passes neither optional prop (ADR 0024).
export function PlanScene({
  plan,
  measuresVisible,
  dimFontPx,
  decor,
  chrome,
}: {
  plan: Plan;
  measuresVisible: boolean;
  dimFontPx: number;
  decor?: SheetDecor;
  chrome?: ReactNode;
}) {
  const dress = (type: ElementRef['type'], id: string) => decor?.element({ type, id });
  // Read here rather than received: the rooms are the plan's, and reading them
  // twice costs nothing (ADR 0029).
  const rooms = detectRooms(plan);
  const profiles = decor?.profiles ?? Object.values(plan.roomProfiles);
  return (
    <>
      {/* Under the walls: a floor marking, not a stroke over them. */}
      <CondemnedHatching rooms={rooms} profiles={profiles} />
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
        profiles={profiles}
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
              pxPerCm={decor?.pxPerCm}
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
