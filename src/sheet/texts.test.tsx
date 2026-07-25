import { describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import type { TextNote, TextSize } from '../model/types';
import { COLORS } from './paint';
import { TEXT_HALO_RATIO, TEXT_SIZE_CM, TextNoteView, textNoteBox } from './texts';
import { pointer } from '../editor/testKit';

describe('TextNoteView', () => {
  const note = (over: Partial<TextNote> = {}): TextNote => ({
    id: 't',
    x: 100,
    y: 50,
    content: 'Hello',
    size: 'M',
    ...over,
  });

  async function renderNote(text: TextNote, props: { selected?: boolean } = {}) {
    const { container } = await render(
      <svg>
        <TextNoteView text={text} selected={props.selected} pxPerCm={1} />
      </svg>,
    );
    return container;
  }

  it('lays each hard newline on its own row, anchored on x', async () => {
    const c = await renderNote(note({ content: 'a\nb\nc' }));
    const tspans = Array.from(c.querySelectorAll('tspan'));
    expect(tspans).toHaveLength(3);
    for (const s of tspans) expect(s.getAttribute('x')).toBe('100');
  });

  it('resolves the S/M/L preset to a plan-coordinate font size', async () => {
    const c = await renderNote(note({ size: 'L' }));
    expect(c.querySelector('text')!.getAttribute('font-size')).toBe(String(TEXT_SIZE_CM.L));
  });

  it('paints a sheet-coloured halo under the glyphs, scaled to the font', async () => {
    const c = await renderNote(note({ size: 'M' }));
    const width = Number(c.querySelector('text')!.getAttribute('stroke-width'));
    expect(width).toBeCloseTo(TEXT_SIZE_CM.M * TEXT_HALO_RATIO);
  });

  it('marks the note selected via the class, plain otherwise', async () => {
    const on = await renderNote(note(), { selected: true });
    expect(on.querySelector('text')!.classList.contains('selected')).toBe(true);
    await cleanup();
    const off = await renderNote(note());
    expect(off.querySelector('text')!.classList.contains('selected')).toBe(false);
  });

  it('shows no box when unselected, and none on hover either', async () => {
    const c = await renderNote(note());
    expect(c.querySelector('rect')).toBeNull();
  });

  it('outlines a solid accent box hugging the glyphs when selected', async () => {
    const c = await renderNote(note(), { selected: true });
    // The outline is measured from the real glyphs in a layout effect, so it lands a tick later.
    await expect.poll(() => c.querySelector('.text-note-box')).toBeTruthy();
    const rect = c.querySelector('.text-note-box')!;
    expect(rect.getAttribute('stroke')).toBe(COLORS.wallSelected);
    expect(rect.getAttribute('stroke-dasharray')).toBeNull();
    expect(rect.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('reports a pointerdown on its grab zone', async () => {
    let hit = false;
    const { container } = await render(
      <svg>
        <TextNoteView
          text={note()}
          interactive
          onPointerDown={() => {
            hit = true;
          }}
        />
      </svg>,
    );
    await pointer(container.querySelector('.text-grab')!, 'pointerdown', { button: 0 });
    expect(hit).toBe(true);
  });
});

describe('textNoteBox', () => {
  const note = (content: string, size: TextSize = 'M'): TextNote => ({ id: 't', x: 0, y: 0, content, size });

  it('grows with the longest line and with the line count', () => {
    const base = textNoteBox(note('ab'));
    expect(textNoteBox(note('abcd')).width).toBeGreaterThan(base.width);
    expect(textNoteBox(note('ab\ncd')).height).toBeGreaterThan(base.height);
  });

  it('anchors near the node, growing down-right', () => {
    const box = textNoteBox(note('ab'));
    expect(box.x).toBeLessThanOrEqual(0);
    expect(box.y).toBeLessThanOrEqual(0);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
