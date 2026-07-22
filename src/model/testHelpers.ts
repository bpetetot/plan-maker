import type { Opening, Plan, Point, RoomLabel, Wall } from './types';
import { defaultOpeningWidth, emptyPlan, WALL_THICKNESS } from './types';

export interface PlanBuilder {
  point: (x: number, y: number) => Point;
  wall: (a: Point, b: Point) => Wall;
  opening: (wall: Wall, type: Opening['type'], offset: number, width?: number) => Opening;
  label: (name: string, x: number, y: number, placed?: true) => RoomLabel;
}

let counter = 0;

// Bypasses snapping: coordinates land exactly where the test asks.
export function buildPlan(build: (b: PlanBuilder) => void): Plan {
  const plan = emptyPlan();
  const builder: PlanBuilder = {
    point(x, y) {
      const p = { id: `p${++counter}`, x, y };
      plan.points[p.id] = p;
      return p;
    },
    wall(a, b) {
      const id = `w${++counter}`;
      const wall: Wall = { id, startPointId: a.id, endPointId: b.id, thickness: WALL_THICKNESS };
      plan.walls[id] = wall;
      return wall;
    },
    opening(wall, type, offset, width = defaultOpeningWidth(type)) {
      const id = `o${++counter}`;
      const opening: Opening =
        type === 'door'
          ? { id, wallId: wall.id, type, offset, width, hingeSide: 'start', swing: 'in' }
          : { id, wallId: wall.id, type, offset, width };
      plan.openings[id] = opening;
      return opening;
    },
    label(name, x, y, placed) {
      const id = `l${++counter}`;
      const label: RoomLabel = placed ? { id, name, x, y, placed } : { id, name, x, y };
      plan.roomLabels[id] = label;
      return label;
    },
  };
  build(builder);
  return plan;
}

// 4×4 m axis-to-axis, walls 10 cm: interior faces 3,90 m, exterior 4,10 m.
export function squareRoomPlan(): Plan {
  return buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 400);
    const p4 = b.point(0, 400);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
  });
}

// 400×400 room holed by a disconnected 150×100 island at (100,100).
export function nestedRoomPlan(): Plan {
  return buildPlan((b) => {
    const a = b.point(0, 0);
    const c = b.point(400, 0);
    const d = b.point(400, 400);
    const e = b.point(0, 400);
    b.wall(a, c);
    b.wall(c, d);
    b.wall(d, e);
    b.wall(e, a);
    const i1 = b.point(100, 100);
    const i2 = b.point(250, 100);
    const i3 = b.point(250, 200);
    const i4 = b.point(100, 200);
    b.wall(i1, i2);
    b.wall(i2, i3);
    b.wall(i3, i4);
    b.wall(i4, i1);
  });
}

// Two 400×400 rooms sharing the wall at x=400.
export function twoRoomPlan(): Plan {
  return buildPlan((b) => {
    const a = b.point(0, 0);
    const c = b.point(400, 0);
    const d = b.point(400, 400);
    const e = b.point(0, 400);
    const f = b.point(800, 0);
    const g = b.point(800, 400);
    b.wall(a, c);
    b.wall(c, d);
    b.wall(d, e);
    b.wall(e, a);
    b.wall(c, f);
    b.wall(f, g);
    b.wall(g, d);
  });
}

// 4×3 m named room: tells the area measure apart from the room name.
export function namedRoomPlan(name = 'Kitchen'): Plan {
  return buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 300);
    const p4 = b.point(0, 300);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
    b.label(name, 200, 150);
  });
}
