// PROTOTYPE — wayfinder ticket 05. Variant B: "Workbench".
// Classic app chrome: top bar, left tool rail, right properties panel.
// One wall per drag gesture (press–drag–release); chaining happens by starting
// a drag on an existing endpoint. Dimensions have an on/off toggle.
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
  | { kind: 'draw'; from: M.Snap }
  | { kind: 'point'; id: string }
  | { kind: 'wall'; id: string; start: { x: number; y: number }; orig: [M.Pt, M.Pt] }
  | { kind: 'opening'; id: string }

export default function VariantB() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { view, toPlan, pxPerCm, zoomCenter, panByPx, fitPlan } = useView(svgRef)
  const [plan, setPlan] = useState(M.samplePlan)
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Sel>(null)
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  const [showDims, setShowDims] = useState(true)
  const [snap, setSnap] = useState<M.Snap | null>(null)
  const [openPreview, setOpenPreview] = useState<{ wall: string; t: number } | null>(null)
  const [, bump] = useState(0) // re-render after drag ref changes settle
  const space = useSpaceHeld()
  const drag = useRef<Drag | null>(null)

  const tol = () => 14 / pxPerCm()

  const switchMode = (m: Mode) => {
    setMode(m)
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
      if (e.key === 'Escape') {
        if (sel) setSel(null)
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
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [sel])

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    if (drag.current) {
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
      const s = M.snapPoint(plan, c.x, c.y, { tol: tol() })
      drag.current = { kind: 'draw', from: s }
      svg.setPointerCapture(e.pointerId)
      bump((v) => v + 1)
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
      } else if (d.kind === 'draw') {
        setSnap(M.snapPoint(plan, c.x, c.y, { tol: tol(), anchor: d.from }))
      } else if (d.kind === 'point') {
        const s = M.snapPoint(plan, c.x, c.y, { tol: tol(), exclude: new Set([d.id]) })
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
      setSnap(M.snapPoint(plan, c.x, c.y, { tol: tol() }))
    } else if (mode === 'door' || mode === 'window') {
      const near = M.nearestWall(plan, c.x, c.y, 40 / pxPerCm() + M.WALL_T)
      if (near) {
        const width = mode === 'door' ? M.DOOR_W : M.WINDOW_W
        const t = M.clampOpening(plan, near.wall, near.t, width)
        setOpenPreview(t === null ? null : { wall: near.wall.id, t })
      } else setOpenPreview(null)
    }
  }

  const onSvgPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (d?.kind === 'draw' && snap) {
      const from = d.from
      if (M.dist(from.x, from.y, snap.x, snap.y) >= M.GRID) {
        let next = plan
        let aId: string
        let bId: string
        ;[next, aId] = M.ensurePoint(next, from)
        ;[next, bId] = M.ensurePoint(next, snap)
        setPlan(M.addWall(next, aId, bId))
      }
      setSnap(null)
    }
    if (d?.kind === 'point') setSnap(null)
    drag.current = null
    bump((v) => v + 1)
  }

  const selWall = sel?.type === 'wall' ? plan.walls[sel.id] : null
  const selOpening = sel?.type === 'opening' ? plan.openings[sel.id] : null
  const cursor = space ? 'grab' : mode === 'select' ? 'default' : 'crosshair'
  const drawing = drag.current?.kind === 'draw' ? drag.current : null
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
  const zoomPct = svgRef.current ? Math.round(pxPerCm() * 100) : 100

  const TOOLS = [
    ['select', 'Select', 'V'],
    ['wall', 'Wall', 'W'],
    ['door', 'Door', 'D'],
    ['window', 'Window', 'N'],
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      {/* top bar */}
      <div className="topbar">
        <strong>Plan Maker</strong>
        <span className="topbar-sep" />
        <label className="check">
          <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
          Dimensions
        </label>
        <span style={{ flex: 1 }} />
        <button className="flat" onClick={() => zoomCenter(1.25)}>
          −
        </button>
        <span className="zoom-pct">{zoomPct}%</span>
        <button className="flat" onClick={() => zoomCenter(1 / 1.25)}>
          +
        </button>
        <button className="flat" onClick={() => fitPlan(plan)}>
          Fit
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* left tool rail */}
        <div className="rail">
          {TOOLS.map(([m, label, key]) => (
            <button
              key={m}
              className={mode === m ? 'rail-btn active' : 'rail-btn'}
              title={`${label} (${key})`}
              onClick={() => switchMode(m)}
            >
              <span className="rail-icon">{label[0]}</span>
              <span className="rail-label">{label}</span>
            </button>
          ))}
        </div>

        {/* canvas */}
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          style={{ flex: 1, minWidth: 0, background: '#fff', display: 'block', cursor }}
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
              color={
                sel?.type === 'wall' && sel.id === w.id
                  ? COLORS.wallSelected
                  : hoverWall === w.id && mode === 'select'
                    ? COLORS.wallHover
                    : undefined
              }
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
          {showDims && Object.values(plan.walls).map((w) => <DimLabel key={w.id} plan={plan} wall={w} />)}
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
          {drawing && snap && <RubberWall from={drawing.from} to={snap} />}
          {ghostOpening && <OpeningGlyph plan={plan} opening={ghostOpening} ghost />}
          {mode === 'wall' && <SnapMarker snap={snap} />}
        </svg>

        {/* right properties panel */}
        <div className="panel">
          <div className="panel-title">Properties</div>
          {selWall && (
            <>
              <div className="prop">
                <span>Type</span>
                <span>Wall</span>
              </div>
              <div className="prop">
                <span>Length</span>
                <span>{M.fmtLen(M.wallLen(plan, selWall))}</span>
              </div>
              <button
                className="danger wide"
                onClick={() => {
                  setPlan((p) => M.deleteWall(p, selWall.id))
                  setSel(null)
                }}
              >
                Delete wall
              </button>
            </>
          )}
          {selOpening && (
            <>
              <div className="prop">
                <span>Type</span>
                <span>{selOpening.kind === 'door' ? 'Door' : 'Window'}</span>
              </div>
              <div className="prop">
                <span>Width</span>
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
              </div>
              <button
                className="danger wide"
                onClick={() => {
                  setPlan((p) => M.deleteOpening(p, selOpening.id))
                  setSel(null)
                }}
              >
                Delete {selOpening.kind}
              </button>
            </>
          )}
          {!selWall && !selOpening && (
            <>
              <p className="muted">Nothing selected.</p>
              <div className="prop">
                <span>Walls</span>
                <span>{Object.keys(plan.walls).length}</span>
              </div>
              <div className="prop">
                <span>Openings</span>
                <span>{Object.keys(plan.openings).length}</span>
              </div>
              <hr />
              <p className="muted">
                <b>Wall</b>: press, drag, release — one wall per drag. Start on an existing corner to chain.
                <br />
                <br />
                <b>Door/Window</b>: hover a wall, click to place.
                <br />
                <br />
                <b>Pan</b>: Space+drag or middle-drag. <b>Zoom</b>: scroll.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
