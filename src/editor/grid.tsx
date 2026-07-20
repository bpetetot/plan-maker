// Grid (see CONTEXT.md): the sheet's visible ruling — minor lines every
// 10 cm (the snap step), major lines every 50 cm. Purely visual; the
// show/hide choice is a per-device preference, like the Theme.
import { GRID } from '../model/types'
import { booleanPreference } from './preference'
import type { View } from './useView'

const MINOR = GRID
const MAJOR = 5 * GRID

// A line family is fully opaque while its cells are FULL_PX or wider on
// screen, gone at GONE_PX or below, linear in between — the grid stays
// legible at any zoom instead of collapsing into noise.
const GONE_PX = 4
const FULL_PX = 8

const fade = (cellPx: number) => Math.min(1, Math.max(0, (cellPx - GONE_PX) / (FULL_PX - GONE_PX)))

export function gridLevels(pxPerCm: number): { minor: number; major: number } {
  return { minor: fade(MINOR * pxPerCm), major: fade(MAJOR * pxPerCm) }
}

// Every multiple of `step` inside [from, to] — integer multipliers, so the
// positions stay exact and meter lines are recognized by modulo.
const ticks = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let i = Math.ceil(from / step); i <= Math.floor(to / step); i++) out.push(i * step)
  return out
}

function GridFamily({
  view,
  step,
  opacity,
  kind,
}: {
  view: View
  step: number
  opacity: number
  kind: 'minor' | 'major'
}) {
  const line = (key: string, x1: number, y1: number, x2: number, y2: number) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
  )
  return (
    <g
      data-grid={kind}
      opacity={opacity}
      stroke={`var(--grid-${kind})`}
      strokeWidth={1}
      // dashes are in screen px too under non-scaling-stroke — the texture
      // stays constant at any zoom
      strokeDasharray={kind === 'minor' ? '3 3' : undefined}
    >
      {ticks(view.x, view.x + view.w, step)
        .filter((x) => kind === 'major' || x % MAJOR !== 0)
        .map((x) => line(`v${x}`, x, view.y, x, view.y + view.h))}
      {ticks(view.y, view.y + view.h, step)
        .filter((y) => kind === 'major' || y % MAJOR !== 0)
        .map((y) => line(`h${y}`, view.x, y, view.x + view.w, y))}
    </g>
  )
}

export function GridLines({ view, pxPerCm }: { view: View; pxPerCm: number }) {
  const { minor, major } = gridLevels(pxPerCm)
  if (major <= 0) return null
  return (
    <g pointerEvents="none">
      {minor > 0 && <GridFamily view={view} step={MINOR} opacity={minor} kind="minor" />}
      <GridFamily view={view} step={MAJOR} opacity={major} kind="major" />
    </g>
  )
}

// Shown by default; the choice is a per-device preference (CONTEXT.md: Grid).
const pref = booleanPreference('plan-maker:grid', 'hidden')

export const loadGridVisible = pref.load
export const saveGridVisible = pref.save
