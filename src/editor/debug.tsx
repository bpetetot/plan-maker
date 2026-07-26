// CONTEXT.md: Debug mode — what the editor draws to show its own workings, over
// the sheet and never part of it (ADR 0036).
import type { AxisLock } from '../model/axisLock';
import { COLORS } from '../sheet/paint';
import type { View } from './useView';

/** CONTEXT.md: Axis lock, drawn. A line has no ends, so it is stretched from
 *  its origin — off-screen or not — past the frame, which does the cutting. */
export function AxisLockLine({ lock, view }: { lock: AxisLock | null; view: View }) {
  if (!lock) return null;
  const reach =
    Math.hypot(view.x + view.w / 2 - lock.at.x, view.y + view.h / 2 - lock.at.y) + Math.hypot(view.w, view.h);
  return (
    <line
      data-debug="axis-lock"
      x1={lock.at.x - lock.dir.x * reach}
      y1={lock.at.y - lock.dir.y * reach}
      x2={lock.at.x + lock.dir.x * reach}
      y2={lock.at.y + lock.dir.y * reach}
      stroke={COLORS.snap}
      strokeWidth={1}
      strokeDasharray="4 4"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}
