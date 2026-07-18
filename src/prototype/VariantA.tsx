// PROTOTYPE — wayfinder ticket 05. Variant A: "Floating minimal".
// Full-bleed canvas, floating pill toolbar, click-to-click polyline walls,
// contextual popover on the selection, dimensions always visible.
import { useEffect, useRef, useState } from 'react'
import * as M from './model'
import { useSpaceHeld, useView } from './useView'
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
type Sel = { type: 'wall' | 'opening'; id: string } | null
type Drag =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'point'; id: string }
  | { kind: 'wall'; id: string; start: { x: number; y: number }; orig: [M.Pt, M.Pt] }
  | { kind: 'opening'; id: string }

export default function VariantA() {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { view, toPlan, pxPerCm, zoomCenter, panByPx, fitPlan } = useView(svgRef)
  const [plan, setPlan] = useState(M.samplePlan)
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Sel>(null)
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  const [chain, setChain] = useState<{ start: string; last: string } | null>(null)
  const [snap, setSnap] = useState<M.Snap | null>(null)
  const [openPreview, setOpenPreview] = useState<{ wall: string; t: number } | null>(null)
  const space = useSpaceHeld()
  const drag = useRef<Drag | null>(null)
  const alt = useRef(false)

  const tol = () => 14 / pxPerCm()

  const switchMode = (m: Mode) => {
    setMode(m)
    setChain(null)
    setSnap(null)
    setOpenPreview(null)
    if (m !== 'select') setSel(null)
  }

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      alt.current = e.altKey
      if (e.key === 'Escape') {
        if (chain) setChain(null)
        else if (sel) setSel(null)
        else switchMode('select')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel?.type === 'wall') setPlan((p) => M.deleteWall(p, sel.id))
        if (sel?.type === 'opening') setPlan((p) => M.deleteOpening(p, sel.id))
        setSel(null)
      } else if (e.key === 'v') switchMode('select')
      else if (e.key === 'w') switchMode('wall')
      else if (e.key === 'd') switchMode('door')
      else if (e.key === 'n') switchMode('window')
    }
    const up = (e: KeyboardEvent) => {
      alt.current = e.altKey
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [chain, sel])

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    if (drag.current) {
      // a child handler already started a drag — just capture the pointer
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (space || e.button === 1) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const c = toPlan(e.clientX, e.clientY)
    if (mode === 'wall') {
      const anchor = chain ? plan.points[chain.last] : undefined
      const s = M.snapPoint(plan, c.x, c.y, { tol: tol(), anchor, free: alt.current })
      if (chain && s.pointId === chain.start && chain.last !== chain.start) {
        setPlan((p) => M.addWall(p, chain.last, chain.start))
        setChain(null)
        setSnap(null)
        return
      }
      const [p2, id] = M.ensurePoint(plan, s)
      let next = p2
      if (chain && chain.last !== id) next = M.addWall(next, chain.last, id)
      setPlan(next)
      setChain(chain ? { ...chain, last: id } : { start: id, last: id })
    } else if ((mode === 'door' || mode === 'window') && openPreview) {
      setPlan((p) => M.placeOpening(p, openPreview.wall, mode, openPreview.t))
    } else if (mode === 'select') {
      setSel(null)
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
        const s = M.snapPoint(plan, c.x, c.y, { tol: tol(), exclude: new Set([d.id]), free: alt.current })
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
      setSnap(M.snapPoint(plan, c.x, c.y, { tol: tol(), anchor, free: alt.current }))
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

  const selWall = sel?.type === 'wall' ? plan.walls[sel.id] : null
  const selOpening = sel?.type === 'opening' ? plan.openings[sel.id] : null

  // popover anchored to the selection, in wrapper coordinates
  let popover: { left: number; top: number } | null = null
  if (svgRef.current && wrapRef.current && (selWall || selOpening)) {
    let px = 0
    let py = 0
    if (selWall) {
      const [a, b] = M.wallPts(plan, selWall)
      px = (a.x + b.x) / 2
      py = (a.y + b.y) / 2
    } else if (selOpening) {
      const w = plan.walls[selOpening.wall]
      const [a, b] = M.wallPts(plan, w)
      const L = M.wallLen(plan, w)
      px = a.x + ((b.x - a.x) * selOpening.center) / L
      py = a.y + ((b.y - a.y) * selOpening.center) / L
    }
    const m = svgRef.current.getScreenCTM()
    if (m) {
      const sp = new DOMPoint(px, py).matrixTransform(m)
      const r = wrapRef.current.getBoundingClientRect()
      popover = { left: sp.x - r.left, top: sp.y - r.top + 24 }
    }
  }

  const cursor = space ? 'grab' : mode === 'select' ? 'default' : 'crosshair'
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

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: '100%', height: '100%', background: '#fff', display: 'block', cursor }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onDoubleClick={() => {
          if (mode === 'wall') {
            setChain(null)
            setSnap(null)
          }
        }}
      >
        <GridDefs />
        <GridRect view={view} />
        {Object.values(plan.walls).map((w) => (
          <WallLine
            key={w.id}
            plan={plan}
            wall={w}
            color={sel?.type === 'wall' && sel.id === w.id ? COLORS.wallSelected : hoverWall === w.id && mode === 'select' ? COLORS.wallHover : undefined}
          />
        ))}
        {Object.values(plan.openings).map((o) => (
          <OpeningGlyph
            key={o.id}
            plan={plan}
            opening={o}
            selected={sel?.type === 'opening' && sel.id === o.id}
            interactive={mode === 'select'}
            onPointerDown={(e) => {
              if (mode !== 'select' || e.button !== 0 || space) return
              setSel({ type: 'opening', id: o.id })
              drag.current = { kind: 'opening', id: o.id }
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
                if (e.button !== 0 || space) return
                setSel({ type: 'wall', id: w.id })
                const c = toPlan(e.clientX, e.clientY)
                drag.current = { kind: 'wall', id: w.id, start: c, orig: [...M.wallPts(plan, w)] }
              }}
              onPointerEnter={() => setHoverWall(w.id)}
              onPointerLeave={() => setHoverWall((h) => (h === w.id ? null : h))}
            />
          ))}
        {selWall && (
          <>
            {M.wallPts(plan, selWall).map((p) => (
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
          </>
        )}
        {chain && snap && <RubberWall from={plan.points[chain.last]} to={snap} />}
        {ghostOpening && <OpeningGlyph plan={plan} opening={ghostOpening} ghost />}
        {mode === 'wall' && <SnapMarker snap={snap} />}
        {drag.current?.kind === 'point' && <SnapMarker snap={snap} />}
      </svg>

      {/* floating toolbar */}
      <div className="pill" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
        {(
          [
            ['select', 'Select', 'V'],
            ['wall', 'Wall', 'W'],
            ['door', 'Door', 'D'],
            ['window', 'Window', 'N'],
          ] as const
        ).map(([m, label, key]) => (
          <button key={m} className={mode === m ? 'pill-btn active' : 'pill-btn'} onClick={() => switchMode(m)}>
            {label} <span className="kbd">{key}</span>
          </button>
        ))}
      </div>

      {/* hint line */}
      <div className="hint" style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)' }}>
        {mode === 'wall'
          ? chain
            ? 'Click to add a wall · click the start point to close the room · Esc / double-click to stop'
            : 'Click to start a wall chain'
          : mode === 'door' || mode === 'window'
            ? 'Hover a wall, click to place'
            : 'Click a wall or an opening to edit it · Space+drag or middle-drag to pan · scroll to zoom'}
      </div>

      {/* zoom controls */}
      <div className="pill" style={{ position: 'absolute', right: 16, bottom: 64 }}>
        <button className="pill-btn" onClick={() => zoomCenter(1 / 1.25)}>
          +
        </button>
        <button className="pill-btn" onClick={() => zoomCenter(1.25)}>
          −
        </button>
        <button className="pill-btn" onClick={() => fitPlan(plan)}>
          Fit
        </button>
      </div>

      {/* contextual popover */}
      {popover && (selWall || selOpening) && (
        <div className="popover" style={{ position: 'absolute', left: popover.left, top: popover.top }}>
          {selWall && (
            <>
              <span>Wall · {M.fmtLen(M.wallLen(plan, selWall))}</span>
              <button
                className="danger"
                onClick={() => {
                  setPlan((p) => M.deleteWall(p, selWall.id))
                  setSel(null)
                }}
              >
                Delete
              </button>
            </>
          )}
          {selOpening && (
            <>
              <span>{selOpening.kind === 'door' ? 'Door' : 'Window'}</span>
              <select
                value={selOpening.width}
                onChange={(e) => setPlan((p) => M.setOpeningWidth(p, selOpening.id, Number(e.target.value)))}
              >
                {[60, 70, 80, 90, 100, 120, 140, 160].map((w) => (
                  <option key={w} value={w}>
                    {w} cm
                  </option>
                ))}
              </select>
              {selOpening.kind === 'door' && (
                <>
                  <button
                    className="flip"
                    title="Swap hinge side (left/right)"
                    onClick={() => setPlan((p) => M.toggleOpeningFlip(p, selOpening.id, 'flipHinge'))}
                  >
                    ⇋ Hinge
                  </button>
                  <button
                    className="flip"
                    title="Swap swing direction (inside/outside)"
                    onClick={() => setPlan((p) => M.toggleOpeningFlip(p, selOpening.id, 'flipSwing'))}
                  >
                    ⇵ Swing
                  </button>
                </>
              )}
              <button
                className="danger"
                onClick={() => {
                  setPlan((p) => M.deleteOpening(p, selOpening.id))
                  setSel(null)
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
