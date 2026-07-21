import type { Vec } from './geometry';
import { wallPoints } from './geometry';
import type { Plan, Wall } from './types';

// Faces: a wall's two long sides, half a thickness off the axis; mitered at
// junctions, square-capped past free ends. Side +1 = left normal, as DimPlacement.

const rot90 = (v: Vec): Vec => ({ x: -v.y, y: v.x });

interface Frame {
  a: Vec;
  b: Vec;
  u: Vec;
  n: Vec;
  length: number;
  half: number;
}

function wallFrame(plan: Plan, wall: Wall): Frame | null {
  const [a, b] = wallPoints(plan, wall);
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return null;
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  return { a, b, u, n: rot90(u), length, half: wall.thickness / 2 };
}

function lineIntersection(p1: Vec, d1: Vec, p2: Vec, d2: Vec): Vec | null {
  const denominator = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denominator;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

function miter(p1: Vec, d1: Vec, p2: Vec, d2: Vec, corner: Vec, wallA: Wall, wallB: Wall): Vec | null {
  const hit = lineIntersection(p1, d1, p2, d2);
  if (!hit) return null;
  const limit = 2 * (wallA.thickness + wallB.thickness);
  return Math.hypot(hit.x - corner.x, hit.y - corner.y) > limit ? null : hit;
}

export function facePoint(plan: Plan, wall: Wall, end: 'start' | 'end', side: 1 | -1): Vec {
  const frame = wallFrame(plan, wall);
  if (!frame) {
    // wall collapsed mid-drag: degrade to the Point itself
    const p = plan.points[end === 'start' ? wall.startPointId : wall.endPointId];
    return { x: p.x, y: p.y };
  }
  const { a, b, u, n, half } = frame;
  const p = end === 'start' ? a : b;
  const cap = { x: p.x + n.x * side * half, y: p.y + n.y * side * half };
  const pointId = end === 'start' ? wall.startPointId : wall.endPointId;

  const wDir = end === 'start' ? u : { x: -u.x, y: -u.y };
  const rotSign = end === 'start' ? side : -side;

  let best: { wall: Wall; v: Vec; delta: number } | null = null;
  const wAngle = Math.atan2(wDir.y, wDir.x);
  for (const other of Object.values(plan.walls)) {
    if (other.id === wall.id) continue;
    let otherEnd: 'start' | 'end' | null = null;
    if (other.startPointId === pointId) otherEnd = 'start';
    else if (other.endPointId === pointId) otherEnd = 'end';
    if (!otherEnd) continue;
    const otherFrame = wallFrame(plan, other);
    if (!otherFrame) continue;
    const v = otherEnd === 'start' ? otherFrame.u : { x: -otherFrame.u.x, y: -otherFrame.u.y };
    const raw = rotSign * (Math.atan2(v.y, v.x) - wAngle);
    const delta = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    if (!best || delta < best.delta) best = { wall: other, v, delta };
  }
  if (!best) return { x: cap.x - wDir.x * half, y: cap.y - wDir.y * half };

  const m = rotSign > 0 ? { x: best.v.y, y: -best.v.x } : rot90(best.v);
  const neighbourHalf = best.wall.thickness / 2;
  const facePointOnLine = { x: a.x + n.x * side * half, y: a.y + n.y * side * half };
  const neighbourPoint = { x: p.x + m.x * neighbourHalf, y: p.y + m.y * neighbourHalf };
  return miter(facePointOnLine, u, neighbourPoint, best.v, p, wall, best.wall) ?? cap;
}

// Axis parameters, cm from the start Point.
export function faceSpan(plan: Plan, wall: Wall, side: 1 | -1): { from: number; to: number } {
  const frame = wallFrame(plan, wall);
  if (!frame) return { from: 0, to: 0 };
  const { a, u } = frame;
  const along = (p: Vec) => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  return {
    from: along(facePoint(plan, wall, 'start', side)),
    to: along(facePoint(plan, wall, 'end', side)),
  };
}

// Axis stretch at full thickness — an Opening pierces the whole thickness, so
// it may not reach past it (CONTEXT.md: Rail).
export function fullThicknessSpan(plan: Plan, wall: Wall): { from: number; to: number } {
  const left = faceSpan(plan, wall, 1);
  const right = faceSpan(plan, wall, -1);
  return { from: Math.max(left.from, right.from), to: Math.min(left.to, right.to) };
}

export function faceLength(plan: Plan, wall: Wall, side: 1 | -1): number {
  const { from, to } = faceSpan(plan, wall, side);
  return Math.max(0, to - from);
}

export function wallOutline(plan: Plan, wall: Wall): Vec[] {
  return [
    facePoint(plan, wall, 'start', 1),
    facePoint(plan, wall, 'end', 1),
    facePoint(plan, wall, 'end', -1),
    facePoint(plan, wall, 'start', -1),
  ];
}

// Fills the central gap wall outlines leave at T and angled crossings; zero
// area at plain corners and collinear continuations.
export interface JunctionPatch {
  pointId: string;
  wallIds: string[];
  corners: Vec[];
}

export function junctionPatches(plan: Plan): JunctionPatch[] {
  const byPoint = new Map<string, { wall: Wall; end: 'start' | 'end' }[]>();
  for (const wall of Object.values(plan.walls)) {
    for (const end of ['start', 'end'] as const) {
      const pointId = end === 'start' ? wall.startPointId : wall.endPointId;
      const list = byPoint.get(pointId) ?? [];
      list.push({ wall, end });
      byPoint.set(pointId, list);
    }
  }
  const patches: JunctionPatch[] = [];
  for (const [pointId, ends] of byPoint) {
    if (ends.length < 2) continue;
    const p = plan.points[pointId];
    if (!p) continue;
    const corners = ends.flatMap(({ wall, end }) =>
      ([1, -1] as const).map((side) => facePoint(plan, wall, end, side)),
    );
    corners.sort((c1, c2) => Math.atan2(c1.y - p.y, c1.x - p.x) - Math.atan2(c2.y - p.y, c2.x - p.x));
    patches.push({ pointId, wallIds: [...new Set(ends.map(({ wall }) => wall.id))], corners });
  }
  return patches;
}

// Expects a positively-oriented loop (screen coordinates), as detectRooms
// produces for interior faces.
export function interiorPolygon(plan: Plan, pointIds: string[]): Vec[] {
  const wallByEdge = new Map<string, Wall>();
  for (const wall of Object.values(plan.walls)) {
    wallByEdge.set(`${wall.startPointId}|${wall.endPointId}`, wall);
    wallByEdge.set(`${wall.endPointId}|${wall.startPointId}`, wall);
  }
  interface OffsetEdge {
    from: Vec;
    to: Vec;
    dir: Vec;
    wall: Wall;
    endPoint: Vec;
  }
  const edges: OffsetEdge[] = [];
  for (let i = 0; i < pointIds.length; i++) {
    const a = plan.points[pointIds[i]];
    const b = plan.points[pointIds[(i + 1) % pointIds.length]];
    const wall = wallByEdge.get(`${a.id}|${b.id}`);
    if (!wall) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-9) continue;
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const inward = rot90(dir);
    const o = wall.thickness / 2;
    edges.push({
      from: { x: a.x + inward.x * o, y: a.y + inward.y * o },
      to: { x: b.x + inward.x * o, y: b.y + inward.y * o },
      dir,
      wall,
      endPoint: b,
    });
  }
  const polygon: Vec[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    const e2 = edges[(i + 1) % edges.length];
    const hit = miter(e1.from, e1.dir, e2.from, e2.dir, e1.endPoint, e1.wall, e2.wall);
    if (hit) polygon.push(hit);
    else polygon.push(e1.to, e2.from);
  }
  return polygon;
}
