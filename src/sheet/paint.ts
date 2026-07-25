// Values live in styles.css; the PNG export pins the light ones in its own
// <style>, so the standalone SVG resolves them without the document.
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
