import { page } from 'vitest/browser'

// Shared helpers for the browser-mode editor tests. Successor to the jsdom
// shim: nothing is emulated here, the real browser provides the geometry.

// React commits on its scheduler (a MessageChannel task), not inside
// dispatchEvent — so nothing is rendered when the dispatch returns. This is
// what @testing-library's fireEvent used to hide behind act(), which browser
// mode does not export. Yielding a macrotask is enough, and it is a yield
// rather than a delay: no duration is being guessed at.
//
// Discrete events (pointerdown/up, keydown, click) commit on the first yield —
// React flushes them at the end of the dispatch. Continuous ones (pointermove,
// wheel) are scheduled instead, and the scheduler's task is queued behind the
// yield we already made: their commit lands on the second one. This is not a
// nicety for assertions only — an event whose handler reads what the previous
// pointermove wrote (placing an opening on its preview) needs it too.
const CONTINUOUS = new Set(['pointermove', 'wheel'])
const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async (type: string) => {
  await yieldTask()
  if (CONTINUOUS.has(type)) await yieldTask()
}

// Vitest browser mode has no fireEvent, and userEvent has no pointer
// primitives — pointer gestures are dispatched by hand. This is deliberate
// but not endorsed by the docs: an official `pointer` API is in draft
// upstream (vitest#10780, targeting v5). When it lands, this helper is the
// single place to swap.
//
// pointerId 1 is mandatory: Chromium reserves it for the mouse and treats it
// as permanently active — the only id setPointerCapture accepts without
// throwing. bubbles is mandatory too: React delegates at the root.
export const pointer = (el: Element, type: string, init: PointerEventInit = {}) => {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }))
  return settle(type)
}

// Global shortcuts listen on window — a target no user could name, so the
// keystroke is dispatched by hand too, on the same terms as pointer().
export const key = (el: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }))
  return settle('keydown')
}

// Releasing a held modifier — the other half of key(), for the handful of
// shortcuts whose effect lasts only as long as the key is down.
export const keyUp = (el: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, ...init }))
  return settle('keyup')
}

// Losing the window: the keyup that never arrives after an Alt+Tab. Does not
// bubble — the real focus event does not either.
export const blur = (el: EventTarget) => {
  el.dispatchEvent(new FocusEvent('blur'))
  return settle('blur')
}

// Zoom rides a native, non-passive listener on the svg (useView) — a target
// no user could name either, so it is dispatched by hand on the same terms.
export const wheel = (el: Element, init: WheelEventInit = {}) => {
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }))
  return settle('wheel')
}

// Double-click and right-click land on a point of the canvas, not on anything
// a user could name — dispatched by hand like pointer(), and generic over the
// type for the same reason. Returns dispatchEvent's own verdict: false when a
// handler called preventDefault (the native context menu being suppressed).
export const mouse = (el: Element, type: string, init: MouseEventInit = {}) => {
  const notCancelled = el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
  return settle(type).then(() => notCancelled)
}

// Client coordinates of a plan position, read off the live screen CTM.
export const clientAt = (svg: SVGSVGElement, px: number, py: number) => {
  const p = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!)
  return { clientX: p.x, clientY: p.y }
}

// The committed viewBox as numbers [x, y, w, h].
export const viewBoxOf = (container: HTMLElement) =>
  container.querySelector('svg')!.getAttribute('viewBox')!.split(/\s+/).map(Number)

// Text of the zoom percentage indicator (the Fit button doubles as it).
export const zoomLabel = () => page.getByTitle('Fit to plan').element().textContent
