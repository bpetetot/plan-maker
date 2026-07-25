import { useLayoutEffect, useRef, useState } from 'react';
import type { Cm, TextNote, TextSize } from '../model/types';
import { COLORS } from './paint';

// S/M/L resolved to plan-coordinate cm (ticket 03): a real size on the sheet
// that zooms with the plan, not a screen-constant one.
export const TEXT_SIZE_CM: Record<TextSize, Cm> = { S: 8, M: 12, L: 18 };
const TEXT_LINE_HEIGHT = 1.25;
// Halo stroke as a fraction of the font size (ticket 03): a sheet-coloured
// backing that hugs the glyphs, so text stays legible where it crosses a wall.
export const TEXT_HALO_RATIO = 0.28;
// Rough system-ui advance per em — the block width is estimated from the longest
// line, the same way the dimension plate estimates its own.
const TEXT_CHAR_ADVANCE = 0.55;
// The grab zone's on-screen margin around the block (ticket 08, Grab zone rules).
const TEXT_GRAB_MARGIN_PX = 3;
// On-screen padding between the glyphs and the selection outline. Wider on the
// sides than top/bottom: glyphs carry no side bearing, so the box would crowd the
// first and last letters at an even pad.
const TEXT_SELECT_PAD_X_PX = 9;
const TEXT_SELECT_PAD_Y_PX = 4;

// The block's bounding box in plan cm, top-left anchored at the node (ticket 03).
// Width is estimated from the longest line; the grab zone (08) reuses this.
export function textNoteBox(text: TextNote): { x: number; y: number; width: number; height: number } {
  const size = TEXT_SIZE_CM[text.size];
  const lineH = size * TEXT_LINE_HEIGHT;
  const lines = text.content.split('\n');
  const cols = Math.max(1, ...lines.map((line) => line.length));
  const pad = size * 0.15;
  return {
    x: text.x - pad,
    y: text.y - pad,
    width: cols * size * TEXT_CHAR_ADVANCE + pad * 2,
    height: (lines.length - 1) * lineH + size + pad * 2,
  };
}

// The inline editor's container size in plan cm: wide enough for the longest line
// plus caret room, tall enough for every row. Grows down and to the right as the
// user types (CONTEXT.md: Text), so the editing box tracks the text, not a fixed slab.
export function textEditBox(content: string, size: TextSize): { width: number; height: number } {
  const s = TEXT_SIZE_CM[size];
  const lines = content.split('\n');
  const cols = Math.max(1, ...lines.map((line) => line.length));
  return {
    width: (cols + 1.5) * s * TEXT_CHAR_ADVANCE,
    height: lines.length * s * TEXT_LINE_HEIGHT + s * 0.5,
  };
}

// Topmost Text whose grab zone (box + constant screen margin) holds the point,
// last-rendered first to match paint order. Point-hit for the double-click
// re-edit, whose native event lands on the svg rather than the grab rect.
export function textAtPoint(texts: TextNote[], x: number, y: number, pxPerCm: number): TextNote | null {
  const margin = TEXT_GRAB_MARGIN_PX / pxPerCm;
  for (let i = texts.length - 1; i >= 0; i--) {
    const b = textNoteBox(texts[i]);
    if (
      x >= b.x - margin &&
      x <= b.x + b.width + margin &&
      y >= b.y - margin &&
      y <= b.y + b.height + margin
    ) {
      return texts[i];
    }
  }
  return null;
}

// Free-text annotation (CONTEXT.md: Text): always-visible content, left-aligned,
// top-left anchored, multi-line on hard newlines. A soft halo backing keeps it
// legible; selection draws a solid accent outline hugging the glyphs, nothing on hover.
export function TextNoteView({
  text,
  selected,
  interactive,
  pxPerCm,
  onPointerDown,
  onDoubleClick,
}: {
  text: TextNote;
  selected?: boolean;
  // The grab zone rides only under Select (08): elsewhere the sheet keeps the
  // click, so a Text never blocks placing a wall over it.
  interactive?: boolean;
  pxPerCm?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}) {
  const size = TEXT_SIZE_CM[text.size];
  const lineH = size * TEXT_LINE_HEIGHT;
  // A blank line still needs a glyph slot, or the block collapses; a space holds
  // the row without printing anything.
  const lines = text.content.split('\n');
  const bounds = textNoteBox(text);
  // The outline hugs the real glyphs, not the estimated block: measure the
  // <text> once selected so the padding reads uniform whatever the content is.
  const textRef = useRef<SVGTextElement>(null);
  const [glyphs, setGlyphs] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!selected || !textRef.current) {
      setGlyphs(null);
      return;
    }
    const b = textRef.current.getBBox();
    setGlyphs({ x: b.x, y: b.y, width: b.width, height: b.height });
  }, [selected, text.content, text.size, text.x, text.y]);
  // On-screen margins in plan units; the grab zone stays generous, the outline pad tight.
  const margin = pxPerCm ? TEXT_GRAB_MARGIN_PX / pxPerCm : 0;
  const padX = pxPerCm ? TEXT_SELECT_PAD_X_PX / pxPerCm : 0;
  const padY = pxPerCm ? TEXT_SELECT_PAD_Y_PX / pxPerCm : 0;
  return (
    <g>
      {selected && glyphs && (
        <rect
          className="text-note-box"
          x={glyphs.x - padX}
          y={glyphs.y - padY}
          width={glyphs.width + 2 * padX}
          height={glyphs.height + 2 * padY}
          fill="none"
          stroke={COLORS.wallSelected}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <text
        ref={textRef}
        className={selected ? 'text-note selected' : 'text-note'}
        x={text.x}
        y={text.y}
        fontSize={size}
        strokeWidth={size * TEXT_HALO_RATIO}
        dominantBaseline="hanging"
        onDoubleClick={onDoubleClick}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={text.x} dy={i === 0 ? 0 : lineH}>
            {line === '' ? ' ' : line}
          </tspan>
        ))}
      </text>
      {/* On top of the glyphs so the whole block is grabbable, not just the ink;
          re-editing rides it too. */}
      {interactive && (
        <rect
          className="text-grab"
          x={bounds.x - margin}
          y={bounds.y - margin}
          width={bounds.width + 2 * margin}
          height={bounds.height + 2 * margin}
          fill="transparent"
          style={{ cursor: 'move' }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      )}
    </g>
  );
}
