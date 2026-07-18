// PROTOTYPE — wayfinder ticket 05. Variant C: "Zen".
// Almost no chrome: a tiny tool HUD (keyboard-first) and a status bar with live
// hints. No persistent selection — editing is hover-based (hover + drag, hover +
// Delete). Dragging empty space pans. Backspace undoes the last chain segment,
// holding Shift disables snapping.
import { useEffect, useRef, useState } from 'react'
import * as M from './model'
import { useView } from './useView'
import {
  COLORS,
  DimLabel,
  GridDefs,
  GridRect,
  Handle,
  OpeningGlyph,
  RubberWall,
  SnapMarker,
  WallHit,
  WallLine,
} from './render'

type Mode = 'select' | 'wall' | 'door' | 'window'
type Hover = { type: 'wall' | 'opening'; id: string } | null
type ChainStep = { wallId: string; prevLast: string; createdPoint: string | null }
type Drag =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'point'; id: string }
  | { kind: 'wall'; id: string; start: { x: number; y: number }; orig: [M.Pt, M.Pt] }
  | { kind: 'opening'; id: string }

export default function VariantC() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { view, toPlan, pxPerCm, panByPx, fitPlan } = useView(svgRef)
  const [plan, setPlan] = useState(M.samplePlan)
  const [mode, setMode] = useState<Mode>('select')
  const [hover, setHover] = useState<Hover>(null)
  const [chain, setChain] = useState<{ start: string; last: string; steps: ChainStep[] } | null>(null)
  const [snap, setSnap] = useState<M.Snap | null>(null)
  const [openPreview, setOpenPreview] = useState<{ wall: string; t: number } | null>(null)
  const [shift, setShift] = useState(false)
  const drag = useRef<Drag | null>(null)

  const tol = () => 14 / pxPerCm()

  const switchMode = (m: Mode) => {
    setMode(m)
    setChain(null)
    setSnap(null)
    setOpenPreview(null)
    setHover(null)
  }

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(true)
      if (isTyping(e)) return
      if (e.key === 'Escape') {
        if (chain) setChain(null)
        else switchMode('select')
      } else if (e.key === 'Backspace' && mode === 'wall' && chain) {
        e.preventDefault()
        const step = chain.steps[chain.steps.length - 1]
        if (!step) {
          setChain(null)
          return
        }
        setPlan((p) => {
          let next = { ...p, walls: { ...p.walls } }
          delete next.walls[step.wallId]
          if (step.createdPoint) next = M.deletePointIfOrphan(next, step.createdPoint)
          return next
        })
        setChain(
          chain.steps.length === 1 && chain.start === step.prevLast
            ? { start: chain.start, last: chain.start, steps: [] }
            : { ...chain, last: step.prevLast, steps: chain.steps.slice(0, -1) },
        )
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'select' && hover) {
        if (hover.type === 'wall') setPlan((p) => M.deleteWall(p, hover.id))
        else setPlan((p) => M.deleteOpening(p, hover.id))
        setHover(null)
      } else if (e.key === 'v') switchMode('select')
      else if (e.key === 'w') switchMode('wall')
      else if (e.key === 'd') switchMode('door')
      else if (e.key === 'n') switchMode('window')
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [chain, hover, mode])

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    if (drag.current) {
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (e.button === 1 || (e.button === 0 && mode === 'select')) {
      // empty space → pan (element handlers start their own drags first)
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const c = toPlan(e.clientX, e.clientY)
    if (mode === 'wall') {
      const anchor = chain ? plan.points[chain.last] : undefined
      const s = M.snapPoint(plan, c.x, c.y, { tol: tol(), anchor, free: shift })
      if (chain && s.pointId === chain.start && chain.last !== chain.start) {
        setPlan((p) => M.addWall(p, chain.last, chain.start))
        setChain(null)
        setSnap(null)
        return
      }
      const before = plan
      const [p2, id] = M.ensurePoint(plan, s)
      const created = id in before.points ? null : id
      if (!chain) {
        setPlan(p2)
        setChain({ start: id, last: id, steps: [] })
      } else if (chain.last !== id) {
        const withWall = M.addWall(p2, chain.last, id)
        const wallId = Object.keys(withWall.walls).find((k) => !(k in before.walls))
        setPlan(withWall)
        setChain({
          ...chain,
          last: id,
          steps: wallId ? [...chain.steps, { wallId, prevLast: chain.last, createdPoint: created }] : chain.steps,
        })
      }
    } else if ((mode === 'door' || mode === 'window') && openPreview) {
      setPlan((p) => M.placeOpening(p, openPreview.wall, mode, openPreview.t))
    }
  }

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const c = toPlan(e.clientX, e.clientY)
    const d = drag.current
    if (d) {
      if (d.kind === 'pan') {
        panByPx(e.clientX - d.x, e.clientY - d.y)
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }
      } else if (d.kind === 'point') {
        const s = M.snapPoint(plan, c.x, c.y, { tol: tol(), exclude: new Set([d.id]), free: shift })
        setPlan((p) => M.movePoint(p, d.id, s.x, s.y))
        setSnap(s)
      } else if (d.kind === 'wall') {
        const dx = Math.round((c.x - d.start.x) / M.GRID) * M.GRID
        const dy = Math.round((c.y - d.start.y) / M.GRID) * M.GRID
        const [oa, ob] = d.orig
        setPlan((p) =>
          M.setPoints(p, {
            [oa.id]: { x: oa.x + dx, y: oa.y + dy },
            [ob.id]: { x: ob.x + dx, y: ob.y + dy },
          }),
        )
      } else if (d.kind === 'opening') {
        const o = plan.openings[d.id]
        if (o) {
          const { t } = M.projectOnWall(plan, plan.walls[o.wall], c.x, c.y)
          setPlan((p) => M.moveOpening(p, d.id, t))
        }
      }
      return
    }
    if (mode === 'wall') {
      const anchor = chain ? plan.points[chain.last] : undefined
      setSnap(M.snapPoint(plan, c.x, c.y, { tol: tol(), anchor, free: shift }))
    } else if (mode === 'door' || mode === 'window') {
      const near = M.nearestWall(plan, c.x, c.y, 40 / pxPerCm() + M.WALL_T)
      if (near) {
        const width = mode === 'door' ? M.DOOR_W : M.WINDOW_W
        const t = M.clampOpening(plan, near.wall, near.t, width)
        setOpenPreview(t === null ? null : { wall: near.wall.id, t })
      } else setOpenPreview(null)
    }
  }

  const onSvgPointerUp = () => {
    if (drag.current?.kind === 'point') setSnap(null)
    drag.current = null
  }

  const hoveredWall = hover?.type === 'wall' ? plan.walls[hover.id] : null
  const hoveredOpening = hover?.type === 'opening' ? plan.openings[hover.id] : null
  const cursor = mode === 'select' ? 'default' : 'crosshair'
  const ghostOpening: M.Opening | null =
    openPreview && (mode === 'door' || mode === 'window')
      ? {
          id: '__ghost',
          wall: openPreview.wall,
          kind: mode,
          center: openPreview.t,
          width: mode === 'door' ? M.DOOR_W : M.WINDOW_W,
        }
      : null

  const status = (() => {
    if (mode === 'wall') {
      if (!chain) return 'Click to start a wall chain · hold Shift for free placement (no snap)'
      const bits = ['Click to add a wall', 'click the start to close', 'Backspace undoes the last wall', 'Esc ends']
      if (snap?.kind === 'point') bits.push('◉ snapped to a corner')
      if (snap?.kind === 'axis') bits.push('◉ axis-locked')
      if (snap && chain) {
        const lastP = plan.points[chain.last]
        bits.push(`current: ${M.fmtLen(M.dist(lastP.x, lastP.y, snap.x, snap.y))}`)
      }
      return bits.join(' · ')
    }
    if (mode === 'door' || mode === 'window')
      return openPreview ? 'Click to place' : `Hover a wall to place the ${mode}`
    if (hoveredWall) return `Wall · ${M.fmtLen(M.wallLen(plan, hoveredWall))} · drag to move, drag a corner to reshape, Delete to remove`
    if (hoveredOpening)
      return `${hoveredOpening.kind === 'door' ? 'Door' : 'Window'} · ${hoveredOpening.width} cm · drag along its wall, Delete to remove`
    return 'Hover a wall to edit it · drag empty space to pan · scroll to zoom · W to draw walls'
  })()

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: '100%', height: '100%', background: '#fff', display: 'block', cursor }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
      >
        <GridDefs />
        <GridRect view={view} />
        {Object.values(plan.walls).map((w) => (
          <WallLine
            key={w.id}
            plan={plan}
            wall={w}
            color={hover?.type === 'wall' && hover.id === w.id && mode === 'select' ? COLORS.wallSelected : undefined}
          />
        ))}
        {Object.values(plan.openings).map((o) => (
          <OpeningGlyph
            key={o.id}
            plan={plan}
            opening={o}
            selected={hover?.type === 'opening' && hover.id === o.id && mode === 'select'}
            interactive={mode === 'select'}
            onPointerDown={(e) => {
              if (mode !== 'select' || e.button !== 0) return
              e.stopPropagation()
              drag.current = { kind: 'opening', id: o.id }
              svgRef.current!.setPointerCapture(e.pointerId)
            }}
          />
        ))}
        {Object.values(plan.walls).map((w) => (
          <DimLabel key={w.id} plan={plan} wall={w} />
        ))}
        {mode === 'select' &&
          Object.values(plan.walls).map((w) => (
            <WallHit
              key={w.id}
              plan={plan}
              wall={w}
              cursor="move"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                const c = toPlan(e.clientX, e.clientY)
                drag.current = { kind: 'wall', id: w.id, start: c, orig: [...M.wallPts(plan, w)] }
                svgRef.current!.setPointerCapture(e.pointerId)
              }}
              onPointerEnter={() => setHover({ type: 'wall', id: w.id })}
              onPointerLeave={() => setHover((h) => (h?.type === 'wall' && h.id === w.id ? null : h))}
            />
          ))}
        {mode === 'select' &&
          hoveredWall &&
          M.wallPts(plan, hoveredWall).map((p) => (
            <Handle
              key={p.id}
              x={p.x}
              y={p.y}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                drag.current = { kind: 'point', id: p.id }
                svgRef.current!.setPointerCapture(e.pointerId)
              }}
            />
          ))}
        {chain && snap && chain.last in plan.points && <RubberWall from={plan.points[chain.last]} to={snap} />}
        {ghostOpening && <OpeningGlyph plan={plan} opening={ghostOpening} ghost />}
        {mode === 'wall' && <SnapMarker snap={snap} />}
      </svg>

      {/* tool HUD */}
      <div className="hud">
        {(
          [
            ['select', 'Select', 'V'],
            ['wall', 'Wall', 'W'],
            ['door', 'Door', 'D'],
            ['window', 'Window', 'N'],
          ] as const
        ).map(([m, label, key]) => (
          <button key={m} className={mode === m ? 'hud-btn active' : 'hud-btn'} onClick={() => switchMode(m)}>
            <span className="kbd">{key}</span> {label}
          </button>
        ))}
        <button className="hud-btn" onClick={() => fitPlan(plan)}>
          <span className="kbd">⌖</span> Fit
        </button>
      </div>

      {/* status bar */}
      <div className="statusbar">{status}</div>
    </div>
  )
}
