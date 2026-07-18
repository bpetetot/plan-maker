import { useEffect, useState } from 'react'
import { planBBox } from '../model/geometry'
import type { Plan } from '../model/types'

export interface View {
  x: number
  y: number
  w: number
  h: number
}

const DEFAULT_VIEW: View = { x: -80, y: -80, w: 820, h: 620 }

// Zoom/pan via the SVG viewBox (spec §3): scroll zooms toward the cursor,
// callers pan by screen pixels, Fit frames the plan's bounding box.
export function useView(svgRef: React.RefObject<SVGSVGElement | null>) {
  const [view, setView] = useState<View>(DEFAULT_VIEW)

  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }

  // screen pixels per plan cm at the current zoom
  const pxPerCm = () => svgRef.current?.getScreenCTM()?.a ?? 1

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const c = toPlan(clientX, clientY)
    setView((v) => ({
      x: c.x - (c.x - v.x) * factor,
      y: c.y - (c.y - v.y) * factor,
      w: v.w * factor,
      h: v.h * factor,
    }))
  }

  const zoomCenter = (factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  const panByPx = (dxPx: number, dyPx: number) => {
    const scale = pxPerCm()
    setView((v) => ({ ...v, x: v.x - dxPx / scale, y: v.y - dyPx / scale }))
  }

  const fitPlan = (plan: Plan) => {
    const box = planBBox(plan)
    if (!box) {
      setView(DEFAULT_VIEW)
      return
    }
    const margin = 120
    setView({ x: box.x - margin, y: box.y - margin, w: box.width + 2 * margin, h: box.height + 2 * margin })
  }

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

  return { view, toPlan, pxPerCm, zoomCenter, panByPx, fitPlan }
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
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return held
}
