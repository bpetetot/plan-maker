import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { planBBox } from '../model/geometry'
import type { Plan } from '../model/types'

export interface View {
  x: number
  y: number
  w: number
  h: number
}

// The framing an empty plan opens with, in plan cm.
const DEFAULT_FRAME: View = { x: -80, y: -80, w: 820, h: 620 }

// The camera is the stable view state, Excalidraw-style: the plan point at the
// screen's top-left corner plus the scale (screen px per plan cm). The viewBox
// is derived from camera + measured screen size, so resizing the window is a
// state no-op: it reveals or hides plan, never pans or rescales it.
interface Camera {
  x: number
  y: number
  scale: number
}

// Zoom bounds, as ratios of the reference framing — the same quantity the
// indicator shows (glossary: Zoom), so a bound is reached exactly when the
// button reads 10% or 3000%. Fit is deliberately exempt (ADR 0013).
const ZOOM_MIN = 0.1
const ZOOM_MAX = 30

// Comparing a clamped scale back against its own bound is a float round-trip:
// ZOOM_MIN * ref / ref need not be exactly ZOOM_MIN. Every bound test goes
// through these two, so the clamp and the greyed-out state cannot disagree.
const atOrBelowFloor = (scale: number, ref: number) => scale <= ZOOM_MIN * ref * (1 + 1e-9)
const atOrAboveCeiling = (scale: number, ref: number) => scale >= ZOOM_MAX * ref * (1 - 1e-9)

// A bound stops a step, it never pushes one: starting outside the range (Fit
// framed a huge plan at 7%) a zoom in still moves by its own factor to 8.75%
// instead of snapping to 10%. So each side of the clamp yields to `from`
// whenever `from` is already past it.
const clampScale = (scale: number, ref: number, from: number) =>
  Math.min(Math.max(scale, Math.min(ZOOM_MIN * ref, from)), Math.max(ZOOM_MAX * ref, from))

// The "meet" scale framing `rect` on a w×h screen (screen px per plan cm).
const frameScale = (rect: View, w: number, h: number) => Math.min(w / rect.w, h / rect.h)

// The camera centering `rect` on a w×h screen at that scale.
function frameCamera(rect: View, w: number, h: number): Camera {
  const scale = frameScale(rect, w, h)
  if (!(scale > 0)) return { x: rect.x, y: rect.y, scale: 1 }
  return {
    x: rect.x + rect.w / 2 - w / (2 * scale),
    y: rect.y + rect.h / 2 - h / (2 * scale),
    scale,
  }
}

// Zoom/pan via the SVG viewBox (spec §3): scroll zooms toward the cursor,
// callers pan by screen pixels, Fit frames the plan's bounding box.
export function useView(svgRef: React.RefObject<SVGSVGElement | null>) {
  const [camera, setCamera] = useState<Camera>({ x: DEFAULT_FRAME.x, y: DEFAULT_FRAME.y, scale: 1 })
  // Scale of the default framing at the last framing event (mount, Fit) — the
  // Zoom reference (glossary: Zoom). Captured, not derived from the live
  // window size, so a resize changes neither the view nor the percentage.
  const [refScale, setRefScale] = useState(1)
  // The wheel listener subscribes once, so the clamp inside it cannot read
  // `refScale` from the closure — a Fit would leave it stale and the wheel
  // would enforce the bounds of a framing two loads old. The ref is the value
  // the clamp reads; the state is the value the render reads.
  const refScaleRef = useRef(1)
  const setReference = (scale: number) => {
    refScaleRef.current = scale
    setRefScale(scale)
  }

  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }

  // screen pixels per plan cm at the current zoom
  const pxPerCm = () => camera.scale

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    setCamera((c) => {
      // clamped first: the anchor math has to run on the scale that will be
      // committed, or the last step of a run drags the plan under the cursor
      const scale = clampScale(c.scale / factor, refScaleRef.current, c.scale)
      if (scale === c.scale) return c
      const px = clientX - r.left
      const py = clientY - r.top
      // the plan point under the cursor stays under the cursor
      return { x: c.x + px / c.scale - px / scale, y: c.y + py / c.scale - py / scale, scale }
    })
  }

  const zoomCenter = (factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  const panByPx = (dxPx: number, dyPx: number) =>
    setCamera((c) => ({ ...c, x: c.x - dxPx / c.scale, y: c.y - dyPx / c.scale }))

  const fitPlan = (plan: Plan) => {
    const r = svgRef.current?.getBoundingClientRect()
    const w = r?.width ?? 0
    const h = r?.height ?? 0
    const box = planBBox(plan)
    const margin = 120
    const target = box
      ? { x: box.x - margin, y: box.y - margin, w: box.width + 2 * margin, h: box.height + 2 * margin }
      : DEFAULT_FRAME
    // No clamp here: Fit's promise is that the whole plan is framed, and it
    // outranks the zoom bounds (ADR 0013). A plan wider than ten default
    // framings lands below 10%, with Zoom out greyed out — still true, since
    // from there the view cannot go further out.
    setCamera(frameCamera(target, w, h))
    // unmeasurable screen: frameCamera fell back to scale 1, keep 100% coherent
    const ref = frameScale(DEFAULT_FRAME, w, h)
    setReference(ref > 0 ? ref : 1)
  }

  // On-screen size of the SVG, tracked as state so the viewBox and the zoom
  // percentage derive from it during render. A size change re-renders with the
  // same camera: that is the whole resize behavior. Layout effect: the first
  // measure must commit before the first paint, or the unmeasured fallback
  // frame flashes for one frame.
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const r = svg.getBoundingClientRect()
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
    }
    measure()
    // ResizeObserver fires after layout, before paint. Committing synchronously
    // paints the new size and its viewBox in the same frame; an async commit
    // paints one frame with the old viewBox — "meet" recenters it, which reads
    // as jitter while the window edge is dragged.
    const ro = new ResizeObserver(() => flushSync(measure))
    ro.observe(svg)
    return () => ro.disconnect()
    // svgRef is stable; the ref is filled by the time effects run
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The viewBox always matches the screen's aspect ratio, so "meet" leaves no
  // slack: what the viewBox frames is exactly what is on screen.
  const view: View =
    size.w > 0 && size.h > 0
      ? { x: camera.x, y: camera.y, w: size.w / camera.scale, h: size.h / camera.scale }
      : DEFAULT_FRAME

  const zoomScale = camera.scale
  const zoomRatio = camera.scale / refScale
  const canZoomOut = !atOrBelowFloor(camera.scale, refScale)
  const canZoomIn = !atOrAboveCeiling(camera.scale, refScale)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.08 : 1 / 1.08)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // zoomAt reads refs and functional state only; subscribing once is intended
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    view,
    toPlan,
    pxPerCm,
    zoomScale,
    zoomRatio,
    canZoomIn,
    canZoomOut,
    zoomCenter,
    panByPx,
    fitPlan,
  }
}

export function useSpaceHeld() {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault()
        setHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setHeld(false)
    }
    // Pan is a mode, so a keyup the window never receives (Alt+Tab away while
    // holding) would strand the editor in it — the tool would stay suspended
    // with no key left to release.
    const clear = () => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return held
}
