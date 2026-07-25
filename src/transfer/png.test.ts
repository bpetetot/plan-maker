import { describe, expect, it } from 'vitest';
import { buildPlan, namedRoomPlan } from '../model/testHelpers';
import { buildExportSvg, computeExportFrame } from './png';

const squarePlan = () =>
  buildPlan((b) => {
    const a = b.point(0, 0);
    const c = b.point(400, 0);
    const d = b.point(400, 300);
    const e = b.point(0, 300);
    b.wall(a, c);
    b.wall(c, d);
    b.wall(d, e);
    b.wall(e, a);
  });

// A 137 cm Ruler laid inside the room: its value "1,37 m" collides with no
// wall dimension or area of squarePlan.
const rulerPlan = () => {
  const plan = squarePlan();
  plan.rulers.r1 = { id: 'r1', a: { x: 50, y: 150 }, b: { x: 187, y: 150 }, t: 0.5 };
  return plan;
};

// A multi-line accented-French Text inside the room: its lines collide with no
// wall dimension or area of squarePlan.
const textPlan = () => {
  const plan = squarePlan();
  plan.texts.t1 = { id: 't1', x: 100, y: 120, content: 'Salon\néclairé', size: 'M' };
  return plan;
};

describe('computeExportFrame', () => {
  it('returns null for a plan without points', () => {
    expect(computeExportFrame(buildPlan(() => {}))).toBeNull();
  });

  it('frames the bounding box plus a 50 cm margin at 2 px/cm', () => {
    const frame = computeExportFrame(squarePlan())!;
    expect(frame).toMatchObject({ x: -50, y: -50, widthCm: 500, heightCm: 400, pxPerCm: 2 });
    expect(frame.pxWidth).toBe(1000);
    expect(frame.pxHeight).toBe(800);
  });

  it('reduces density so very large plans fit the 4096 px cap', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(3000, 0);
      b.wall(a, c);
    });
    const frame = computeExportFrame(plan)!;
    expect(frame.widthCm).toBe(3100);
    expect(frame.pxPerCm).toBeLessThan(2);
    expect(frame.pxWidth).toBe(4096);
    expect(frame.pxHeight).toBeLessThanOrEqual(4096);
  });

  it('is independent of any view state (same plan → same frame)', () => {
    expect(computeExportFrame(squarePlan())).toEqual(computeExportFrame(squarePlan()));
  });
});

describe('buildExportSvg', () => {
  it('renders a standalone SVG with white background, walls, and dimensions', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: true })!;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1000"');
    expect(svg).toContain('height="800"');
    expect(svg).toContain('fill="#ffffff"');
    // 4×3 m axis rectangle, 10 cm walls: dimensions run along a face, area is interior.
    expect(svg).toContain('4,10 m');
    expect(svg).toContain('3,90 m');
    expect(svg).toContain('3,10 m');
    expect(svg).toContain('2,90 m');
    expect(svg).toContain('11,31 m²');
  });

  it('returns null for an empty plan', () => {
    expect(
      buildExportSvg(
        buildPlan(() => {}),
        { measuresVisible: true },
      ),
    ).toBeNull();
  });

  // ADR 0008: hidden measures stay hidden in the export.
  it('omits wall dimensions and room areas when measures are hidden', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: false })!;
    expect(svg).not.toContain('4,10 m');
    expect(svg).not.toContain('3,90 m');
    expect(svg).not.toContain('11,31 m²');
    expect(svg).toContain('var(--wall)');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('keeps room names when measures are hidden — a name is not a measure', () => {
    const svg = buildExportSvg(namedRoomPlan(), { measuresVisible: false })!;
    expect(svg).toContain('Kitchen');
    expect(svg).not.toContain('11,31 m²');
  });

  // CONTEXT.md: Theme — exports render light, so the SVG pins the var values.
  it('always renders light, whatever theme the editor is in', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: true })!;
    expect(svg).toContain('var(--wall)');
    expect(svg).toContain('--wall: #1e293b');
    expect(svg).toContain('--sheet: #ffffff');
    expect(svg).toContain('--dim-line: #93c9c3');
  });

  // A Ruler follows the Measures toggle like a wall dimension (ADR 0008, ticket 10).
  it('renders a Ruler value when measures are shown', () => {
    const svg = buildExportSvg(rulerPlan(), { measuresVisible: true })!;
    expect(svg).toContain('1,37 m');
  });

  it('omits the Ruler value when measures are hidden', () => {
    const svg = buildExportSvg(rulerPlan(), { measuresVisible: false })!;
    expect(svg).not.toContain('1,37 m');
  });

  // Rasterized through an <img>, which loads no external resource: without the
  // embedded subset the mono font silently falls back.
  it('embeds the measure font as a data URI', () => {
    const svg = buildExportSvg(squarePlan(), { measuresVisible: true })!;
    expect(svg).toContain('@font-face');
    expect(svg).toContain("font-family: 'JetBrains Mono'");
    expect(svg).toContain('data:font/woff2;base64,');
  });

  // CONTEXT.md: Text is always-visible content, not a Measure — it renders
  // whatever the toggle, unlike the Ruler above (the contrast this map turns on).
  it('renders a Text, and its accented multi-line content, when measures are shown', () => {
    const svg = buildExportSvg(textPlan(), { measuresVisible: true })!;
    expect(svg).toContain('text-note');
    expect(svg).toContain('Salon');
    expect(svg).toContain('éclairé');
  });

  it('renders a Text even when measures are hidden — a Text is not a measure', () => {
    const svg = buildExportSvg(textPlan(), { measuresVisible: false })!;
    expect(svg).toContain('Salon');
    expect(svg).toContain('éclairé');
    expect(svg).not.toContain('4,10 m');
  });

  // A stored placement is a wish, the Rail is the law — and the Rail is shorter
  // at the export's wider font. Free-standing 1,20 m wall: extent -5..125, and a
  // 6-character plate at 10 px is 40 wide, so its centre stops at 125-7-20 = 98.
  it('holds a dimension plate on the rail of the size it is drawn at', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(120, 0);
      b.wall(a, c);
    });
    Object.values(plan.walls)[0].dimPlacement = { t: 1, side: -1 };
    const svg = buildExportSvg(plan, { measuresVisible: true })!;
    expect(svg).toContain('1,30 m');
    const x = Number(/translate\(([-\d.]+),/.exec(svg)![1]);
    expect(x).toBeCloseTo(98, 3);
  });

  // Without the pinned ink the export <style> gives text.text-note no fill and
  // it rasterizes black instead of the label slate.
  it('pins the free-text ink so it does not fall back to black', () => {
    const svg = buildExportSvg(textPlan(), { measuresVisible: true })!;
    expect(svg).toContain('--text-note: #334155');
  });
});
