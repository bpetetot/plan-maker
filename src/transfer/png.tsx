import { renderToStaticMarkup } from 'react-dom/server'
import { PlanScene } from '../editor/render'
import { planBBox } from '../model/geometry'
import { detectRooms } from '../model/rooms'
import type { Plan } from '../model/types'
import { MEASURE_FONT_DATA_URI } from './measureFont'

// PNG export (spec §7): frames the plan bbox, independent of current zoom/pan.

const MARGIN_CM = 50
const PX_PER_CM = 2
const MAX_PX = 4096

export interface ExportFrame {
  x: number
  y: number
  widthCm: number
  heightCm: number
  pxPerCm: number
  pxWidth: number
  pxHeight: number
}

export function computeExportFrame(plan: Plan): ExportFrame | null {
  const box = planBBox(plan)
  if (!box) return null
  const x = box.x - MARGIN_CM
  const y = box.y - MARGIN_CM
  const widthCm = box.width + 2 * MARGIN_CM
  const heightCm = box.height + 2 * MARGIN_CM
  const longSideCm = Math.max(widthCm, heightCm)
  const pxPerCm = Math.min(PX_PER_CM, MAX_PX / longSideCm)
  return {
    x,
    y,
    widthCm,
    heightCm,
    pxPerCm,
    pxWidth: Math.round(widthCm * pxPerCm),
    pxHeight: Math.round(heightCm * pxPerCm),
  }
}

// Every var PlanScene consumes must be pinned here, or it falls back to black.
// Font inlined: rasterization goes through an <img>, which loads no external resource.
const EXPORT_STYLE = `
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url(${MEASURE_FONT_DATA_URI}) format('woff2'); }
  svg { --wall: #1e293b; --sheet: #ffffff; --dim-line: #93c9c3; }
  text.dim { font-family: 'JetBrains Mono', ui-monospace, monospace; fill: #1d7d74; }
  text.room-name { font: 600 11px system-ui, sans-serif; fill: #334155; }
  text.room-area { font: 9px 'JetBrains Mono', ui-monospace, monospace; fill: #64748b; }
`

// Measures mirror the editor (ADR 0008).
export interface ExportOptions {
  measuresVisible: boolean
}

export function buildExportSvg(plan: Plan, { measuresVisible }: ExportOptions): string | null {
  const frame = computeExportFrame(plan)
  if (!frame) return null
  const rooms = detectRooms(plan)
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={frame.pxWidth}
      height={frame.pxHeight}
      viewBox={`${frame.x} ${frame.y} ${frame.widthCm} ${frame.heightCm}`}
    >
      <style>{EXPORT_STYLE}</style>
      <rect x={frame.x} y={frame.y} width={frame.widthCm} height={frame.heightCm} fill="#ffffff" />
      {/* 10px, not the editor's 8px: the export rasterizes small */}
      <PlanScene plan={plan} rooms={rooms} measuresVisible={measuresVisible} dimFontPx={10} />
    </svg>,
  )
}

export function renderPlanPng(plan: Plan, options: ExportOptions): Promise<Blob | null> {
  const svg = buildExportSvg(plan, options)
  const frame = computeExportFrame(plan)
  if (!svg || !frame) return Promise.resolve(null)
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(svgUrl)
      const canvas = document.createElement('canvas')
      canvas.width = frame.pxWidth
      canvas.height = frame.pxHeight
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error('Failed to rasterize the plan'))
    }
    image.src = svgUrl
  })
}
