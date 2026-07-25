import { renderToStaticMarkup } from 'react-dom/server';
import SHEET_STYLE from '../sheet/sheet.css?inline';
import { PlanScene } from '../sheet/scene';
import LIGHT_PALETTE from '../theme/light.css?inline';
import { planBBox } from '../model/geometry';
import { detectRooms } from '../model/rooms';
import type { Plan } from '../model/types';
import { MEASURE_FONT_DATA_URI } from './measureFont';

// PNG export (spec §7): frames the plan bbox, independent of current zoom/pan.

const MARGIN_CM = 50;
const PX_PER_CM = 2;
const MAX_PX = 4096;

export interface ExportFrame {
  x: number;
  y: number;
  widthCm: number;
  heightCm: number;
  pxPerCm: number;
  pxWidth: number;
  pxHeight: number;
}

export function computeExportFrame(plan: Plan): ExportFrame | null {
  const box = planBBox(plan);
  if (!box) return null;
  const x = box.x - MARGIN_CM;
  const y = box.y - MARGIN_CM;
  const widthCm = box.width + 2 * MARGIN_CM;
  const heightCm = box.height + 2 * MARGIN_CM;
  const longSideCm = Math.max(widthCm, heightCm);
  const pxPerCm = Math.min(PX_PER_CM, MAX_PX / longSideCm);
  return {
    x,
    y,
    widthCm,
    heightCm,
    pxPerCm,
    pxWidth: Math.round(widthCm * pxPerCm),
    pxHeight: Math.round(heightCm * pxPerCm),
  };
}

// Borrowed whole, never restated (ADR 0024): `:root` resolves to the exported
// svg, so the palette lands and the dark override cannot.
// The font is the export's own: rasterizing through an <img> loads no external
// resource, so the subset is inlined.
// CDATA because this is XML: one "<" in the borrowed CSS would close the style
// element. The markers sit in CSS comments, which the stylesheet ignores.
const EXPORT_STYLE = `/* <![CDATA[ */
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url(${MEASURE_FONT_DATA_URI}) format('woff2'); }
  ${LIGHT_PALETTE}
  ${SHEET_STYLE}
/* ]]> */`;

// Measures mirror the editor (ADR 0008).
export interface ExportOptions {
  measuresVisible: boolean;
}

export function buildExportSvg(plan: Plan, { measuresVisible }: ExportOptions): string | null {
  const frame = computeExportFrame(plan);
  if (!frame) return null;
  const rooms = detectRooms(plan);
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
  );
}

export function renderPlanPng(plan: Plan, options: ExportOptions): Promise<Blob | null> {
  const svg = buildExportSvg(plan, options);
  const frame = computeExportFrame(plan);
  if (!svg || !frame) return Promise.resolve(null);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(svgUrl);
      const canvas = document.createElement('canvas');
      canvas.width = frame.pxWidth;
      canvas.height = frame.pxHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to rasterize the plan'));
    };
    image.src = svgUrl;
  });
}
