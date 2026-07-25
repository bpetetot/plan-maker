// Values live in theme/light.css, which the PNG export inlines: the standalone
// SVG resolves them without the document (ADR 0024).
export const COLORS = {
  wall: 'var(--wall)',
  wallHover: 'var(--wall-hover)',
  wallSelected: 'var(--accent)',
  snap: 'var(--snap)',
  preview: 'var(--accent)',
};

// The browser anti-aliases each shared edge separately: background bleeds
// through as a hairline. A self-colored screen-pixel stroke closes it.
export const seamStroke = (paint: string) =>
  ({
    stroke: paint,
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
    strokeLinejoin: 'round',
  }) as const;
