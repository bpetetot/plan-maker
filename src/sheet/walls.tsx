import { junctionPatches, wallOutline } from '../model/faces';
import { openingPlacement } from '../model/openings';
import type { ElementRef } from '../model/selection';
import type { Plan, Wall } from '../model/types';
import { WINDOW_JAMB } from './openings';
import { COLORS, seamStroke } from './paint';

export function WallLine({ plan, wall, color }: { plan: Plan; wall: Wall; color?: string }) {
  const outline = wallOutline(plan, wall);
  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
  const paint = color ?? COLORS.wall;
  const gaps = Object.values(plan.openings).filter((o) => o.wallId === wall.id);
  if (gaps.length === 0) {
    return <polygon points={points} fill={paint} {...seamStroke(paint)} pointerEvents="none" />;
  }
  // Mask, not a sheet-coloured overlay: the Grid must stay visible through
  // the gap. Region is the bbox grown past the ±1 cm the gap rects overhang.
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const x = Math.min(...xs) - 2;
  const y = Math.min(...ys) - 2;
  const maskId = `wall-gaps-${wall.id}`;
  return (
    <g pointerEvents="none">
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={x}
        y={y}
        width={Math.max(...xs) - x + 2}
        height={Math.max(...ys) - y + 2}
      >
        <rect x={x} y={y} width={Math.max(...xs) - x + 2} height={Math.max(...ys) - y + 2} fill="#fff" />
        {gaps.map((o) => {
          const placement = openingPlacement(plan, o);
          // window jambs ARE the wall: leaving a half-jamb strip uncut can
          // never mis-register with the faces (doors keep the full-width cut)
          const inset = o.type === 'window' ? WINDOW_JAMB / 2 : 0;
          return placement ? (
            <rect
              key={o.id}
              transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
              x={-o.width / 2 + inset}
              y={-wall.thickness / 2 - 1}
              width={o.width - 2 * inset}
              height={wall.thickness + 2}
              fill="#000"
            />
          ) : null;
        })}
      </mask>
      <polygon points={points} fill={paint} {...seamStroke(paint)} mask={`url(#${maskId})`} />
    </g>
  );
}

// Fills the central gaps outlines leave at crossings (CONTEXT.md: Face). Owned
// by every wall at its Point: no hover tint, selected tint from two selected.
export function JunctionPatches({ plan, selection }: { plan: Plan; selection?: ElementRef[] }) {
  const selected = new Set((selection ?? []).filter((r) => r.type === 'wall').map((r) => r.id));
  return (
    <g pointerEvents="none">
      {junctionPatches(plan).map(({ pointId, wallIds, corners }) => {
        const paint =
          wallIds.filter((id) => selected.has(id)).length >= 2 ? COLORS.wallSelected : COLORS.wall;
        return (
          <polygon
            key={pointId}
            points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
            fill={paint}
            {...seamStroke(paint)}
          />
        );
      })}
    </g>
  );
}
