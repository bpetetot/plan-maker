import { describe, expect, it } from 'vitest';
import { buildPlan, namedRoomPlan } from '../helpers';
import { ROOM_TEXT_HIT } from '../../src/sheet/rooms';
import { buildExportSvg, computeExportFrame } from '../../src/transfer/png';

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

// Every family of the sheet at once: walls, a room, a Ruler, a Text.
const fullPlan = () => {
  const plan = rulerPlan();
  plan.texts.t1 = { id: 't1', x: 100, y: 120, content: 'Salon', size: 'M' };
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

  // ADR 0005: the export prints the drawing, never what manipulates it. The
  // screen's chrome rides a slot the export leaves empty (ADR 0024).
  it('leaves the editor chrome out of the export', () => {
    const svg = buildExportSvg(fullPlan(), { measuresVisible: true })!;
    // The drawn elements only: the inlined stylesheet legitimately mentions a
    // cursor and the chrome's own classes.
    const drawn = svg.slice(svg.indexOf('</style>'));
    expect(drawn).toContain('1,37 m');
    expect(drawn).toContain('Salon');
    // grab zones, of every family, and the Dimension's own drag rect
    expect(drawn).not.toContain('transparent');
    expect(drawn).not.toContain('cursor');
    expect(drawn).not.toContain('ruler-grab');
    expect(drawn).not.toContain('text-grab');
    expect(drawn).not.toContain(ROOM_TEXT_HIT);
    // tints, chips and handles: chrome that never enters the sheet at all
    expect(drawn).not.toContain('room-fill');
    expect(drawn).not.toContain('placement-chip');
    expect(drawn).not.toContain('point-handle');
    expect(drawn).not.toContain('alignment-guide');
  });

  // Free-standing 1,20 m wall: extent -5..125, a 6-character plate 40 wide at
  // 10 px, so the Rail stops its centre at 125-7-20 = 98 (CONTEXT.md: Rail).
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

  // An undefined var rasterizes black, and this ink is defined through another
  // one: the whole chain has to arrive, not just its first link.
  it('carries the free-text ink and what it resolves to', () => {
    const svg = buildExportSvg(textPlan(), { measuresVisible: true })!;
    expect(svg).toContain('--text-note: var(--label)');
    expect(svg).toContain('--label: #334155');
  });
});
