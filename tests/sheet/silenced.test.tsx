// CONTEXT.md: Silenced — the one place that decides what the Sheet draws, so
// the editor and the export both inherit what is asserted here (ADR 0024).
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../src/model/types';
import { PlanScene } from '../../src/sheet/scene';
import { buildPlan, oneWallPlan, twoRoomPlan } from '../helpers';

const scene = (plan: Plan) =>
  render(
    <svg>
      <PlanScene plan={plan} measuresVisible dimFontPx={11} />
    </svg>,
  );

// The plate is the one sheet-coloured rect a Dimension draws; the extent line the
// only `line` a bare wall plan holds; the arrowheads the only dim-inked polygons.
const dimParts = (container: HTMLElement) => ({
  labels: container.querySelectorAll('text.dim').length,
  plates: container.querySelectorAll('rect[fill="var(--sheet)"]').length,
  extents: container.querySelectorAll('line').length,
  arrows: container.querySelectorAll('polygon[fill="var(--dim-line)"]').length,
});

describe('a silenced Dimension', () => {
  it('draws no plate, no extent line, no arrowheads', async () => {
    const { plan } = oneWallPlan(0, 0, 400, 0);
    const stated = await scene(plan);
    expect(dimParts(stated.container)).toEqual({ labels: 1, plates: 1, extents: 2, arrows: 2 });
    await stated.unmount();

    plan.walls.w.dimSilenced = true;
    const { container } = await scene(plan);
    expect(dimParts(container)).toEqual({ labels: 0, plates: 0, extents: 0, arrows: 0 });
  });

  it('leaves every other wall of the plan measured', async () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
    });
    Object.values(plan.walls)[0].dimSilenced = true;
    const { container } = await scene(plan);
    expect(container.querySelectorAll('text.dim')).toHaveLength(3);
  });
});

// 4×4 m square room; the profile sits on the anchor.
const roomWith = (marks: { name: string; areaSilenced?: true }): Plan =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 400);
    const p4 = b.point(0, 400);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
    b.profile(marks.name, 200, 200, { areaSilenced: marks.areaSilenced });
  });

describe('a silenced Room area', () => {
  it('draws no area text, and the name still draws', async () => {
    const { container } = await scene(roomWith({ name: 'Corridor', areaSilenced: true }));
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')?.textContent).toBe('Corridor');
  });

  // A block that renders nothing must not linger as an invisible drag target;
  // the floor is the way back to the switch (ADR 0014).
  it('renders no block at all for a room with neither name nor stated area', async () => {
    const { container } = await scene(roomWith({ name: '', areaSilenced: true }));
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')).toBeNull();
    expect(container.querySelectorAll('rect.room-area-hit')).toHaveLength(0);
    expect(container.querySelectorAll('rect.room-name-hit')).toHaveLength(0);
  });

  it('leaves the neighbouring room stating its own', async () => {
    // two 4×4 m rooms sharing a wall: the left one silenced at (200,200), the
    // right one bare and therefore stating its area
    const plan = twoRoomPlan();
    plan.roomProfiles.l = { id: 'l', name: '', x: 200, y: 200, areaSilenced: true };
    const { container } = await scene(plan);
    expect(container.querySelectorAll('text.room-area')).toHaveLength(1);
  });
});
