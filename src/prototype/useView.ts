// PROTOTYPE — wayfinder ticket 05. Shared viewBox zoom/pan hook.
import { useEffect, useState } from 'react'
import type { Plan } from './model'
import { planBBox } from './model'

export type View = { x: number; y: number; w: number; h: number }

export function useView(svgRef: React.RefObject<SVGSVGElement | null>) {
  const [view, setView] = useState<View>({ x: -80, y: -80, w: 820, h: 620 })

  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    if (!svg || !m) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  // screen pixels per plan cm at the current zoom
  const pxPerCm = () => svgRef.current?.getScreenCTM()?.a ?? 1

  const zoomAt = (clientX: number, clientY: number, f: number) => {
    const c = toPlan(clientX, clientY)
    setView((v) => ({ x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w: v.w * f, h: v.h * f }))
  }

  const zoomCenter = (f: number) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, f)
  }

  const panByPx = (dxPx: number, dyPx: number) => {
    const s = pxPerCm()
    setView((v) => ({ ...v, x: v.x - dxPx / s, y: v.y - dyPx / s }))
  }

  const fitPlan = (plan: Plan) => {
    const b = planBBox(plan)
    const m = 120
    setView({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { view, setView, toPlan, pxPerCm, zoomAt, zoomCenter, panByPx, fitPlan }
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
