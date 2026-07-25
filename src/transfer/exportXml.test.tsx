import { describe, expect, it } from 'vitest';
import { buildPlan } from '../model/testHelpers';
import { buildExportSvg } from './png';

// Only a real parser catches a "<" in the borrowed stylesheet, hence the one
// export test in the browser; every other lives in node.
describe('the exported SVG', () => {
  it('parses as XML, borrowed stylesheet included', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const e = b.point(0, 300);
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
    });
    plan.texts.t1 = { id: 't1', x: 100, y: 120, content: 'Salon', size: 'M' };
    const svg = buildExportSvg(plan, { measuresVisible: true })!;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName).toBe('svg');
    // The stylesheet survived the parse rather than being cut short by it.
    expect(doc.querySelector('style')!.textContent).toContain('--wall: #1e293b');
  });
});
