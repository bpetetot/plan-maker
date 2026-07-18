// Shared jsdom shim for editor tests — jsdom has no SVG geometry or pointer
// capture. Emulates the browser: the screen CTM is derived from the
// *committed* viewBox attribute, so a component reading it during a React
// render sees the DOM as it was before that render's commit — the exact
// semantics the zoom indicator depends on. Call from beforeAll.

// Fixed on-screen size of the SVG canvas for every test.
export const RECT = { left: 0, top: 0, width: 800, height: 600 }

export function installSvgGeometry() {
  const proto = SVGSVGElement.prototype as SVGSVGElement & Record<string, unknown>

  proto.getBoundingClientRect = function () {
    return {
      ...RECT,
      right: RECT.left + RECT.width,
      bottom: RECT.top + RECT.height,
      x: RECT.left,
      y: RECT.top,
      toJSON: () => '',
    } as DOMRect
  }

  // Default preserveAspectRatio (xMidYMid meet): uniform scale = min of the
  // two ratios, content centered on the slack axis.
  proto.getScreenCTM = function (this: SVGSVGElement) {
    const vb = this.getAttribute('viewBox')
    if (!vb) return null
    const [x, y, w, h] = vb.split(/\s+/).map(Number)
    const s = Math.min(RECT.width / w, RECT.height / h)
    const e = RECT.left + (RECT.width - w * s) / 2 - x * s
    const f = RECT.top + (RECT.height - h * s) / 2 - y * s
    return makeMatrix(s, e, f)
  }

  proto.setPointerCapture = () => {}
  proto.releasePointerCapture = () => {}

  // Minimal DOMMatrix/DOMPoint pair supporting scale+translate and inversion.
  function makeMatrix(s: number, e: number, f: number) {
    return {
      a: s,
      b: 0,
      c: 0,
      d: s,
      e,
      f,
      inverse: () => makeMatrix(1 / s, -e / s, -f / s),
    } as unknown as DOMMatrix
  }

  class FakeDOMPoint {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
    matrixTransform(m: { a: number; c: number; e: number; b: number; d: number; f: number }) {
      return new FakeDOMPoint(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f)
    }
  }
  ;(globalThis as Record<string, unknown>).DOMPoint = FakeDOMPoint
}

// Client coordinates of a plan position under the current (possibly fitted)
// viewBox — the inverse of the getScreenCTM shim above.
export function clientAt(svg: SVGSVGElement, px: number, py: number) {
  const [x, y, w, h] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number)
  const s = Math.min(RECT.width / w, RECT.height / h)
  return {
    clientX: px * s + RECT.left + (RECT.width - w * s) / 2 - x * s,
    clientY: py * s + RECT.top + (RECT.height - h * s) / 2 - y * s,
  }
}
