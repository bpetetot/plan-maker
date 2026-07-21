import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { planBBox } from '../model/geometry';
import type { Plan } from '../model/types';

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_FRAME: View = { x: -80, y: -80, w: 820, h: 620 };

// Camera (plan point at screen top-left + scale), not a stored viewBox: a
// resize then reveals plan instead of panning or rescaling it.
interface Camera {
  x: number;
  y: number;
  scale: number;
}

// Ratios of the reference framing (glossary: Zoom): a bound is reached exactly
// when the indicator reads 10% or 3000%. Fit is exempt (ADR 0013).
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 30;

// Float round-trip: ZOOM_MIN * ref / ref need not be exactly ZOOM_MIN. Single
// path, so the clamp and the greyed-out state cannot disagree.
const atOrBelowFloor = (scale: number, ref: number) => scale <= ZOOM_MIN * ref * (1 + 1e-9);
const atOrAboveCeiling = (scale: number, ref: number) => scale >= ZOOM_MAX * ref * (1 - 1e-9);

// Each side yields to `from` when `from` is already past it: a bound stops a
// step, never pushes one.
const clampScale = (scale: number, ref: number, from: number) =>
  Math.min(Math.max(scale, Math.min(ZOOM_MIN * ref, from)), Math.max(ZOOM_MAX * ref, from));

const frameScale = (rect: View, w: number, h: number) => Math.min(w / rect.w, h / rect.h);

function frameCamera(rect: View, w: number, h: number): Camera {
  const scale = frameScale(rect, w, h);
  if (!(scale > 0)) return { x: rect.x, y: rect.y, scale: 1 };
  return {
    x: rect.x + rect.w / 2 - w / (2 * scale),
    y: rect.y + rect.h / 2 - h / (2 * scale),
    scale,
  };
}

// Zoom/pan via the SVG viewBox (spec §3).
export function useView(svgRef: React.RefObject<SVGSVGElement | null>) {
  const [camera, setCamera] = useState<Camera>({ x: DEFAULT_FRAME.x, y: DEFAULT_FRAME.y, scale: 1 });
  // Captured at the last framing event, not derived from the live window size:
  // a resize must change neither the view nor the percentage (glossary: Zoom).
  const [refScale, setRefScale] = useState(1);
  // The wheel listener subscribes once, so a closure `refScale` would go stale
  // on Fit. Ref for the clamp, state for the render.
  const refScaleRef = useRef(1);
  const setReference = (scale: number) => {
    refScaleRef.current = scale;
    setRefScale(scale);
  };

  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };

  const pxPerCm = () => camera.scale;

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    setCamera((c) => {
      // Clamp before the anchor math, or the last step of a run drags the plan
      // under the cursor.
      const scale = clampScale(c.scale / factor, refScaleRef.current, c.scale);
      if (scale === c.scale) return c;
      const px = clientX - r.left;
      const py = clientY - r.top;
      return { x: c.x + px / c.scale - px / scale, y: c.y + py / c.scale - py / scale, scale };
    });
  };

  const zoomCenter = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  const panByPx = (dxPx: number, dyPx: number) =>
    setCamera((c) => ({ ...c, x: c.x - dxPx / c.scale, y: c.y - dyPx / c.scale }));

  const fitPlan = (plan: Plan) => {
    const r = svgRef.current?.getBoundingClientRect();
    const w = r?.width ?? 0;
    const h = r?.height ?? 0;
    const box = planBBox(plan);
    const margin = 120;
    const target = box
      ? { x: box.x - margin, y: box.y - margin, w: box.width + 2 * margin, h: box.height + 2 * margin }
      : DEFAULT_FRAME;
    // No clamp: Fit's framing outranks the zoom bounds (ADR 0013).
    setCamera(frameCamera(target, w, h));
    // Unmeasurable screen: frameCamera fell back to scale 1, keep 100% coherent.
    const ref = frameScale(DEFAULT_FRAME, w, h);
    setReference(ref > 0 ? ref : 1);
  };

  // Layout effect: the first measure must commit before the first paint, or the
  // unmeasured fallback frame flashes.
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    // flushSync, not an async commit: ResizeObserver fires before paint, and one
    // frame of the old viewBox reads as jitter while the window edge is dragged.
    const ro = new ResizeObserver(() => flushSync(measure));
    ro.observe(svg);
    return () => ro.disconnect();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The viewBox matches the screen's aspect ratio, so "meet" leaves no slack.
  const view: View =
    size.w > 0 && size.h > 0
      ? { x: camera.x, y: camera.y, w: size.w / camera.scale, h: size.h / camera.scale }
      : DEFAULT_FRAME;

  const zoomScale = camera.scale;
  const zoomRatio = camera.scale / refScale;
  const canZoomOut = !atOrBelowFloor(camera.scale, refScale);
  const canZoomIn = !atOrAboveCeiling(camera.scale, refScale);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.08 : 1 / 1.08);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    view,
    toPlan,
    pxPerCm,
    zoomScale,
    zoomRatio,
    canZoomIn,
    canZoomOut,
    zoomCenter,
    panByPx,
    fitPlan,
  };
}

export function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setHeld(false);
    };
    // Pan is a mode: a keyup the window never receives (Alt+Tab while holding)
    // would strand the editor in it.
    const clear = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);
  return held;
}
