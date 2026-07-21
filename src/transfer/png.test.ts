import { describe, expect, it } from 'vitest'
import { buildPlan, namedRoomPlan } from '../model/testHelpers'
import { buildExportSvg, computeExportFrame } from './png'

const squarePlan = () =>
  buildPlan((b) => {
    const a = b.point(0, 0)
    const c = b.point(400, 0)
    const d = b.point(400, 300)
    const e = b.point(0, 300)
    b.wall(a, c)
    b.wall(c, d)
    b.wall(d, e)
    b.wall(e, a)
  })

describe('computeExportFrame', () => {
  it('returns null for a plan without points', () => {
    expect(computeExportFrame(buildPlan(() => {}))).toBeNull()
  })

  it('frames the bounding box plus a 50 cm margin at 2 px/cm', () => {
    const frame = computeExportFrame(squarePlan())!
    expect(frame).toMatchObject({ x: -50, y: -50, widthCm: 500, heightCm: 400, pxPerCm: 2 })
    expect(frame.pxWidth).toBe(1000)
    expect(frame.pxHeight).toBe(800)
  })

  it('reduces density so very large plans fit the 4096 px cap', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0)
      const c = b.point(3000, 0)
      b.wall(a, c)
    })
    const frame = computeExportFrame(plan)!
    expect(frame.widthCm).toBe(3100)
    expect(frame.pxPerCm).toBeLessThan(2)
    expect(frame.pxWidth).toBe(4096)
    expect(frame.pxHeight).toBeLessThanOrEqual(4096)
  })

  it('is independent of any view state (same plan → same frame)', () => {
    expect(computeExportFrame(squarePlan())).toEqual(computeExportFrame(squarePlan()))
  })
})

describe('buildExportSvg', () => {
  it('renders a standalone SVG with white background, walls, and dimensions', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: true })!
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="1000"')
    expect(svg).toContain('height="800"')
    expect(svg).toContain('fill="#ffffff"')
    // dimensions measure the face they run along (default sides), the room
    // area its interior faces: a 4×3 m axis rectangle with 10 cm walls
    expect(svg).toContain('4,10 m')
    expect(svg).toContain('3,90 m')
    expect(svg).toContain('3,10 m')
    expect(svg).toContain('2,90 m')
    expect(svg).toContain('11,31 m²')
  })

  it('returns null for an empty plan', () => {
    expect(
      buildExportSvg(
        buildPlan(() => {}),
        { measuresVisible: true },
      ),
    ).toBeNull()
  })

  // Hidden measures are hidden from the export too (ADR 0008) — hiding them
  // is how you get a clean sheet to share.
  it('omits wall dimensions and room areas when measures are hidden', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: false })!
    expect(svg).not.toContain('4,10 m')
    expect(svg).not.toContain('3,90 m')
    expect(svg).not.toContain('11,31 m²')
    // the plan itself is untouched
    expect(svg).toContain('var(--wall)')
    expect(svg).toContain('fill="#ffffff"')
  })

  it('keeps room names when measures are hidden — a name is not a measure', () => {
    const svg = buildExportSvg(namedRoomPlan(), { measuresVisible: false })!
    expect(svg).toContain('Kitchen')
    expect(svg).not.toContain('11,31 m²')
  })

  // Theme (CONTEXT.md): exports always render light, as a document. The scene
  // paints with CSS variables, so the standalone SVG must pin their light values.
  it('always renders light, whatever theme the editor is in', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: true })!
    expect(svg).toContain('var(--wall)')
    expect(svg).toContain('--wall: #1e293b')
    expect(svg).toContain('--sheet: #ffffff')
    // the dimension extent lines paint with --rail — pinned too
    expect(svg).toContain('--rail: #cbd5e1')
  })
})
