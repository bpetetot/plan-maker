import { page } from 'vitest/browser'

// React commits on its scheduler, not inside dispatchEvent; browser mode has no act().
// Discrete events commit on the first yield, continuous ones on the second.
const CONTINUOUS = new Set(['pointermove', 'wheel'])
const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async (type: string) => {
  await yieldTask()
  if (CONTINUOUS.has(type)) await yieldTask()
}

// pointerId 1: the only id Chromium's setPointerCapture accepts without throwing.
// bubbles: React delegates at the root.
export const pointer = (el: Element, type: string, init: PointerEventInit = {}) => {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }))
  return settle(type)
}

// Not window: only bubbling from the focus puts the guards (typing, Escape) on the path.
const focused = () => document.activeElement ?? document.body

export const key = (k: string, init: KeyboardEventInit = {}) => {
  focused().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
  return settle('keydown')
}

export const keyUp = (k: string, init: KeyboardEventInit = {}) => {
  focused().dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true, ...init }))
  return settle('keyup')
}

// Not bubbling: the real blur event does not either.
export const blur = (el: EventTarget) => {
  el.dispatchEvent(new FocusEvent('blur'))
  return settle('blur')
}

// Zoom rides a native non-passive listener on the svg (useView).
export const wheel = (el: Element, init: WheelEventInit = {}) => {
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }))
  return settle('wheel')
}

// Returns false when a handler called preventDefault.
export const mouse = (el: Element, type: string, init: MouseEventInit = {}) => {
  const notCancelled = el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
  return settle(type).then(() => notCancelled)
}

export const clientAt = (svg: SVGSVGElement, px: number, py: number) => {
  const p = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!)
  return { clientX: p.x, clientY: p.y }
}

export const viewBoxOf = (container: HTMLElement) =>
  container.querySelector('svg')!.getAttribute('viewBox')!.split(/\s+/).map(Number)

// The Fit button doubles as the zoom indicator.
export const zoomLabel = () => page.getByTitle('Fit to plan').element().textContent
