import { describe, expect, it } from 'vitest'
import { buildPlan } from '../model/testHelpers'
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
    const svg = buildExportSvg(squarePlan())!
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="1000"')
    expect(svg).toContain('height="800"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('4,00 m')
    expect(svg).toContain('3,00 m')
    expect(svg).toContain('12,00 m²')
  })

  it('returns null for an empty plan', () => {
    expect(buildExportSvg(buildPlan(() => {}))).toBeNull()
  })

  // Theme (CONTEXT.md): exports always render light, as a document. The scene
  // paints with CSS variables, so the standalone SVG must pin their light values.
  it('always renders light, whatever theme the editor is in', () => {
    const svg = buildExportSvg(squarePlan())!
    expect(svg).toContain('var(--wall)')
    expect(svg).toContain('--wall: #2f2f2f')
    expect(svg).toContain('--sheet: #ffffff')
  })
})
