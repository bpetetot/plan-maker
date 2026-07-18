# Dimension placement is stored as a ratio, not centimeters

A wall's dimension label can be dragged along the wall's axis and flipped to
either side, and that placement is part of the plan (persisted, exported,
undoable). The position along the axis is stored as a ratio (0–1) of the wall's
length, even though openings on the same wall store their position as an
absolute centimeter offset. A dimension label has no metric reality on the
wall — "near that end" is a proportional intent — so a ratio stays valid no
matter how the wall is stretched or shortened, whereas an absolute offset
would need re-clamping in every operation that moves a point. Absence of a
stored placement means the default rendering (midpoint, upper side); the
fields only appear once the label is first dragged.

## Considered Options

- Absolute cm offset from the wall's start (the `Opening.offset` convention) —
  rejected: it can point past the end of a shortened wall, forcing a clamping
  invariant across all point-moving operations, for no metric benefit.
