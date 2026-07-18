// PROTOTYPE — wayfinder ticket 05 (drawing interactions). Throwaway code, do not build on it.
// Shared-vertex planar graph per the locked data model: Point + Wall by ids, integer cm, 10 cm grid.

export const GRID = 10 // cm
export const WALL_T = 10 // rendered wall thickness (cm)
export const DOOR_W = 90
export const WINDOW_W = 120

export type Pt = { id: string; x: number; y: number }
export type Wall = { id: string; a: string; b: string }
export type OpeningKind = 'door' | 'window'
export type Opening = { id: string; wall: string; kind: OpeningKind; center: number; width: number }
export type Plan = {
  points: Record<string, Pt>
  walls: Record<string, Wall>
  openings: Record<string, Opening>
}

let n = 0
export const uid = (prefix: string) => `${prefix}${++n}`

export function samplePlan(): Plan {
  const points: Record<string, Pt> = {}
  const walls: Record<string, Wall> = {}
  const openings: Record<string, Opening> = {}
  const P = (x: number, y: number) => {
    const p = { id: uid('p'), x, y }
    points[p.id] = p
    return p
  }
  const W = (a: Pt, b: Pt) => {
    const w = { id: uid('w'), a: a.id, b: b.id }
    walls[w.id] = w
    return w
  }
  const O = (wall: Wall, kind: OpeningKind, center: number, width: number) => {
    const o = { id: uid('o'), wall: wall.id, kind, center, width }
    openings[o.id] = o
    return o
  }
  const p1 = P(0, 0)
  const p1b = P(250, 0)
  const p2 = P(600, 0)
  const p3 = P(600, 300)
  const p4 = P(400, 300)
  const p5 = P(400, 450)
  const p6 = P(0, 450)
  const p7 = P(250, 300)
  const wTop = W(p1, p1b)
  W(p1b, p2)
  const wRight = W(p2, p3)
  W(p3, p4)
  W(p4, p5)
  W(p5, p6)
  W(p6, p1)
  const wInner = W(p1b, p7)
  W(p7, p4)
  O(wTop, 'door', 125, DOOR_W)
  O(wInner, 'door', 150, DOOR_W)
  O(wRight, 'window', 150, WINDOW_W)
  return { points, walls, openings }
}

// ---------- geometry ----------

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)

export const wallPts = (plan: Plan, w: Wall): [Pt, Pt] => [plan.points[w.a], plan.points[w.b]]

export const wallLen = (plan: Plan, w: Wall) => {
  const [a, b] = wallPts(plan, w)
  return dist(a.x, a.y, b.x, b.y)
}

export function fmtLen(cm: number): string {
  if (cm < 100) return `${Math.round(cm)} cm`
  return `${Math.round(cm) / 100} m`
}

// ---------- snapping ----------

export type Snap = {
  x: number
  y: number
  kind: 'point' | 'axis' | 'grid' | 'free'
  pointId?: string
  axisFrom?: { x: number; y: number }
}

export function snapPoint(
  plan: Plan,
  x: number,
  y: number,
  opt: { tol: number; anchor?: { x: number; y: number }; exclude?: Set<string>; free?: boolean },
): Snap {
  if (opt.free) return { x: Math.round(x), y: Math.round(y), kind: 'free' }
  let best: Pt | null = null
  let bd = opt.tol
  for (const p of Object.values(plan.points)) {
    if (opt.exclude?.has(p.id)) continue
    const d = dist(p.x, p.y, x, y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  if (best) return { x: best.x, y: best.y, kind: 'point', pointId: best.id }
  if (opt.anchor) {
    const dx = x - opt.anchor.x
    const dy = y - opt.anchor.y
    const d = Math.hypot(dx, dy)
    if (d > 1) {
      const step = Math.PI / 4
      const ang = Math.atan2(dy, dx)
      const snapped = Math.round(ang / step) * step
      if (Math.abs(ang - snapped) < (8 * Math.PI) / 180) {
        const dd = Math.max(GRID, Math.round(d / GRID) * GRID)
        return {
          x: Math.round(opt.anchor.x + dd * Math.cos(snapped)),
          y: Math.round(opt.anchor.y + dd * Math.sin(snapped)),
          kind: 'axis',
          axisFrom: { x: opt.anchor.x, y: opt.anchor.y },
        }
      }
    }
  }
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, kind: 'grid' }
}

// ---------- plan operations (all immutable) ----------

export function ensurePoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId]
  const id = uid('p')
  const p = { id, x: Math.round(snap.x), y: Math.round(snap.y) }
  return [{ ...plan, points: { ...plan.points, [id]: p } }, id]
}

export function addWall(plan: Plan, a: string, b: string): Plan {
  if (a === b) return plan
  for (const w of Object.values(plan.walls)) {
    if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return plan
  }
  const id = uid('w')
  return { ...plan, walls: { ...plan.walls, [id]: { id, a, b } } }
}

export function movePoint(plan: Plan, id: string, x: number, y: number): Plan {
  return { ...plan, points: { ...plan.points, [id]: { id, x: Math.round(x), y: Math.round(y) } } }
}

export function setPoints(plan: Plan, updates: Record<string, { x: number; y: number }>): Plan {
  const points = { ...plan.points }
  for (const [id, p] of Object.entries(updates)) points[id] = { id, x: Math.round(p.x), y: Math.round(p.y) }
  return { ...plan, points }
}

export function deleteWall(plan: Plan, id: string): Plan {
  const wall = plan.walls[id]
  if (!wall) return plan
  const walls = { ...plan.walls }
  delete walls[id]
  const openings: Record<string, Opening> = {}
  for (const o of Object.values(plan.openings)) if (o.wall !== id) openings[o.id] = o
  const used = new Set<string>()
  for (const w of Object.values(walls)) {
    used.add(w.a)
    used.add(w.b)
  }
  const points: Record<string, Pt> = {}
  for (const p of Object.values(plan.points)) if (used.has(p.id)) points[p.id] = p
  return { points, walls, openings }
}

export function deletePointIfOrphan(plan: Plan, id: string): Plan {
  for (const w of Object.values(plan.walls)) if (w.a === id || w.b === id) return plan
  const points = { ...plan.points }
  delete points[id]
  return { ...plan, points }
}

export function deleteOpening(plan: Plan, id: string): Plan {
  const openings = { ...plan.openings }
  delete openings[id]
  return { ...plan, openings }
}

// ---------- openings ----------

export function projectOnWall(plan: Plan, w: Wall, x: number, y: number): { t: number; d: number } {
  const [a, b] = wallPts(plan, w)
  const L = dist(a.x, a.y, b.x, b.y)
  if (L < 1) return { t: 0, d: dist(a.x, a.y, x, y) }
  const ux = (b.x - a.x) / L
  const uy = (b.y - a.y) / L
  const t = Math.max(0, Math.min(L, (x - a.x) * ux + (y - a.y) * uy))
  const px = a.x + ux * t
  const py = a.y + uy * t
  return { t, d: dist(px, py, x, y) }
}

export function nearestWall(plan: Plan, x: number, y: number, tol: number): { wall: Wall; t: number } | null {
  let best: { wall: Wall; t: number } | null = null
  let bd = tol
  for (const w of Object.values(plan.walls)) {
    const { t, d } = projectOnWall(plan, w, x, y)
    if (d < bd) {
      bd = d
      best = { wall: w, t }
    }
  }
  return best
}

export function clampOpening(plan: Plan, w: Wall, t: number, width: number): number | null {
  const L = wallLen(plan, w)
  const margin = width / 2 + 5
  if (L < width + 10) return null
  return Math.round(Math.max(margin, Math.min(L - margin, t)))
}

export function placeOpening(plan: Plan, wallId: string, kind: OpeningKind, t: number): Plan {
  const w = plan.walls[wallId]
  const width = kind === 'door' ? DOOR_W : WINDOW_W
  const center = clampOpening(plan, w, t, width)
  if (center === null) return plan
  const id = uid('o')
  return { ...plan, openings: { ...plan.openings, [id]: { id, wall: wallId, kind, center, width } } }
}

export function moveOpening(plan: Plan, id: string, t: number): Plan {
  const o = plan.openings[id]
  const center = clampOpening(plan, plan.walls[o.wall], t, o.width)
  if (center === null) return plan
  return { ...plan, openings: { ...plan.openings, [id]: { ...o, center } } }
}

export function setOpeningWidth(plan: Plan, id: string, width: number): Plan {
  const o = plan.openings[id]
  const center = clampOpening(plan, plan.walls[o.wall], o.center, width)
  if (center === null) return plan
  return { ...plan, openings: { ...plan.openings, [id]: { ...o, width, center } } }
}

export function planBBox(plan: Plan): { x: number; y: number; w: number; h: number } {
  const pts = Object.values(plan.points)
  if (pts.length === 0) return { x: 0, y: 0, w: 600, h: 450 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}
