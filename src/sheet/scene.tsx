import type { Room } from '../model/rooms';
import type { Plan } from '../model/types';
import { DimLabel, RulerLabel } from './measures';
import { OpeningGlyph } from './openings';
import { RoomOverlay } from './rooms';
import { TextNoteView } from './texts';
import { JunctionPatches, WallLine } from './walls';

// The PNG export's scene: no selection, no UI chrome (spec §7). Takes the
// on-screen measure preference rather than always printing (ADR 0008).
export function PlanScene({
  plan,
  rooms,
  measuresVisible,
  dimFontPx,
}: {
  plan: Plan;
  rooms: Room[];
  measuresVisible: boolean;
  dimFontPx?: number;
}) {
  return (
    <>
      {Object.values(plan.walls).map((wall) => (
        <WallLine key={wall.id} plan={plan} wall={wall} />
      ))}
      <JunctionPatches plan={plan} />
      {Object.values(plan.openings).map((opening) => (
        <OpeningGlyph key={opening.id} plan={plan} opening={opening} />
      ))}
      <RoomOverlay rooms={rooms} labels={Object.values(plan.roomLabels)} measuresVisible={measuresVisible} />
      {/* Always-visible content (CONTEXT.md: Text): never gated by the measures
          toggle, unlike the dimensions and rulers below. */}
      {Object.values(plan.texts).map((text) => (
        <TextNoteView key={text.id} text={text} />
      ))}
      {measuresVisible &&
        Object.values(plan.walls).map((wall) => (
          <DimLabel key={wall.id} plan={plan} wall={wall} fontPx={dimFontPx} />
        ))}
      {measuresVisible &&
        Object.values(plan.rulers).map((ruler) => (
          <RulerLabel key={ruler.id} ruler={ruler} fontPx={dimFontPx} />
        ))}
    </>
  );
}
