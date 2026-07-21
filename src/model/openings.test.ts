import { describe, expect, it } from 'vitest';
import { openingRail } from './openings';
import { buildPlan, squareRoomPlan } from './testHelpers';

describe('openingRail', () => {
  it('runs the full-thickness stretch of the wall when nothing else is on it', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });

  it('stops at the mitered corners of a room wall', () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    expect(openingRail(plan, bottom, 200)).toEqual({ from: 5, to: 395 });
  });

  it('cuts back to the near edge of the openings flanking the reference position', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 60, 60); // edges 30 / 90
      b.opening(wall, 'door', 300, 80); // edges 260 / 340
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: 90, to: 260 });
  });

  it('excludes the opening being placed from its own bounds', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    expect(openingRail(plan, wall, 200, opening.id)).toEqual({ from: -5, to: 405 });
  });

  it('sides a neighbour by the reference position, so a rail never spans one', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80); // edges 160 / 240
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 300)).toEqual({ from: 240, to: 405 });
    expect(openingRail(plan, wall, 100)).toEqual({ from: -5, to: 160 });
  });

  it('reads a neighbour where it is drawn, not where it is stored', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(200, 0));
      b.opening(wall, 'window', 380, 80);
    });
    const wall = Object.values(plan.walls)[0];
    // full-thickness span -5 → 205, so the neighbour renders centred on 165
    expect(openingRail(plan, wall, 50)).toEqual({ from: -5, to: 125 });
  });

  it('ignores the openings of other walls', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      const other = b.wall(b.point(0, 200), b.point(400, 200));
      b.opening(other, 'door', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });
});
