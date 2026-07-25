import { openingPlacement } from '../model/openings';
import type { Door, Opening, Plan } from '../model/types';
import { COLORS, seamStroke } from './paint';

// Full jamb bar width; WallLine's mask leaves a half-bar of body uncut beneath.
// The glyph repaints the bars in its own tint, not the wall body's.
export const WINDOW_JAMB = 1.5;

// Local frame: origin at the gap centre, wall along x. Shared by glyph and
// grab zone — they must not drift apart.
export const doorMirror = (door: Door) =>
  `scale(${door.hingeSide === 'end' ? -1 : 1},${door.swing === 'out' ? -1 : 1})`;
export const doorLeaf = (door: Door) => ({
  x1: -door.width / 2,
  y1: 0,
  x2: -door.width / 2,
  y2: -door.width,
});
export const doorArc = (door: Door) =>
  `M ${door.width / 2} 0 A ${door.width} ${door.width} 0 0 0 ${-door.width / 2} ${-door.width}`;

export function OpeningGlyph({
  plan,
  opening,
  ghost,
  selected,
}: {
  plan: Plan;
  opening: Opening;
  ghost?: boolean;
  selected?: boolean;
}) {
  const wall = plan.walls[opening.wallId];
  const placement = openingPlacement(plan, opening);
  if (!wall || !placement) return null;
  const halfWidth = opening.width / 2;
  const thickness = wall.thickness;
  const stroke = selected ? COLORS.wallSelected : ghost ? COLORS.preview : COLORS.wall;
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      opacity={ghost ? 0.55 : 1}
      pointerEvents="none"
    >
      {/* the ghost is not in the plan, so WallLine's mask cuts no gap for it */}
      {ghost && (
        <rect
          x={-halfWidth}
          y={-thickness / 2 - 1}
          width={opening.width}
          height={thickness + 2}
          fill="var(--sheet)"
        />
      )}
      {opening.type === 'door' ? (
        <g transform={doorMirror(opening)}>
          <line {...doorLeaf(opening)} stroke={stroke} strokeWidth={2} />
          {/* solid, not dashed: dashed reads as "above the cut plane" */}
          <path d={doorArc(opening)} fill="none" stroke={stroke} strokeWidth={1} />
        </g>
      ) : (
        <>
          <line x1={-halfWidth} y1={-3} x2={halfWidth} y2={-3} stroke={stroke} strokeWidth={1.5} />
          <line x1={-halfWidth} y1={3} x2={halfWidth} y2={3} stroke={stroke} strokeWidth={1.5} />
          {[-halfWidth, halfWidth].map((x) => (
            <rect
              key={x}
              x={x - WINDOW_JAMB / 2}
              y={-thickness / 2}
              width={WINDOW_JAMB}
              height={thickness}
              fill={stroke}
              {...seamStroke(stroke)}
            />
          ))}
        </>
      )}
    </g>
  );
}
