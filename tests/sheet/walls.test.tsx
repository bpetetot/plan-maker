import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ElementRef } from '../../src/model/selection';
import { buildPlan, oneWallPlan, squareRoomPlan } from '../helpers';
import type { Plan, Wall } from '../../src/model/types';
import { COLORS } from '../../src/sheet/paint';
import { JunctionPatches, WallLine } from '../../src/sheet/walls';

describe('WallLine', () => {
  async function renderWall(plan: Plan, wall: Wall) {
    const { container } = await render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    );
    return container.querySelector('polygon')!;
  }

  it('draws a free-standing wall as a rectangle overhanging its Points', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    const polygon = await renderWall(plan, wall);
    expect(polygon.getAttribute('points')).toBe('-5,5 405,5 405,-5 -5,-5');
  });

  it('miters a square-room corner: faces meet where the dimensions measure', async () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    const polygon = await renderWall(plan, bottom);
    // interior face y=5 spans 5..395, exterior face y=-5 spans -5..405
    expect(polygon.getAttribute('points')).toBe('5,5 395,5 405,-5 -5,-5');
  });
});

describe('JunctionPatches', () => {
  // A T junction: two collinear bar walls split at the stem's Point.
  function tJunctionPlan(): { plan: Plan; bar1: Wall; bar2: Wall; stem: Wall } {
    let bar1!: Wall, bar2!: Wall, stem!: Wall;
    const plan = buildPlan((b) => {
      const left = b.point(0, 0);
      const mid = b.point(200, 0);
      const right = b.point(400, 0);
      const foot = b.point(200, 200);
      bar1 = b.wall(left, mid);
      bar2 = b.wall(mid, right);
      stem = b.wall(mid, foot);
    });
    return { plan, bar1, bar2, stem };
  }

  async function renderPatch(plan: Plan, selection: ElementRef[] = []) {
    const selected = (id: string) => selection.some((r) => r.type === 'wall' && r.id === id);
    const { container } = await render(
      <svg>
        <JunctionPatches plan={plan} selected={selected} />
      </svg>,
    );
    return container.querySelector('polygon')!;
  }

  it('tints the patch when two of its walls are selected', async () => {
    const { plan, bar1, bar2 } = tJunctionPlan();
    const patch = await renderPatch(plan, [
      { type: 'wall', id: bar1.id },
      { type: 'wall', id: bar2.id },
    ]);
    expect(patch.getAttribute('fill')).toBe(COLORS.wallSelected);
  });

  it('keeps the plain wall color when only one of its walls is selected', async () => {
    const { plan, bar1 } = tJunctionPlan();
    const patch = await renderPatch(plan, [{ type: 'wall', id: bar1.id }]);
    expect(patch.getAttribute('fill')).toBe(COLORS.wall);
  });

  it('keeps the plain wall color without a selection (PNG export)', async () => {
    const { plan } = tJunctionPlan();
    const patch = await renderPatch(plan);
    expect(patch.getAttribute('fill')).toBe(COLORS.wall);
  });
});
