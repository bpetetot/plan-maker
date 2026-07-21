// CONTEXT.md: Grid — minor lines every 10 cm (the snap step), major every 50 cm.
import { GRID } from '../model/types'
import { booleanPreference } from './preference'
import type { View } from './useView'

const MINOR = GRID
const MAJOR = 5 * GRID

const GONE_PX = 4
const FULL_PX = 8

const fade = (cellPx: number) => Math.min(1, Math.max(0, (cellPx - GONE_PX) / (FULL_PX - GONE_PX)))

export function gridLevels(pxPerCm: number): { minor: number; major: number } {
  return { minor: fade(MINOR * pxPerCm), major: fade(MAJOR * pxPerCm) }
}

// Integer multipliers, not accumulated addition: exact positions for the modulo test.
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
      // non-scaling-stroke puts dashes in screen px: constant texture at any zoom.
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

// CONTEXT.md: Grid — visibility is a per-device preference, shown by default.
const pref = booleanPreference('plan-maker:grid', 'hidden')

export const loadGridVisible = pref.load
export const saveGridVisible = pref.save
