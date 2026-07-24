# Fit outranks the Zoom bounds

The Zoom is bounded to 10%–3000%. Every step obeys: buttons, shortcuts, and
the wheel all clamp on the bound rather than cross it. **Fit does not.** A plan
wider than ten default framings is framed at 7%, below the floor, and that is
the intended outcome.

The two are not the same kind of operation, which is what settles it. A zoom
step is a *relative* move with no destination of its own — clamping it costs
the user nothing but the tail of one step, and the bound is the whole point.
Fit is an *absolute* framing whose entire contract is stated in its name: the
plan is visible. Clamping Fit does not shorten it, it makes it fail — the
result is a plan cropped by the screen edge, with no signal that a bound was
the cause, and no other control that gets the user out of it in one gesture.

The bounds stop a step; they never push one. From a Fit at 7%, a zoom in moves
by its own factor to 8.75% rather than snapping up to 10%. A bound that pushed
would make Fit's framing unrecoverable in the other direction too.

## Considered Options

- **Clamp Fit like everything else.** Rejected: it trades a visible, explicable
  state (7%, Zoom out greyed out) for an invisible failure (the plan overflows
  the screen and nothing says why). It also breaks the only operation that
  guarantees the user can find their plan again.
- **Widen the bounds until Fit always fits.** Rejected: the bound would have to
  follow the largest plan a user might draw, which is unbounded — that is not a
  bound, it is a bound-shaped constant that never fires.
- **Let Fit clamp and warn.** Rejected: a notification to explain a self-
  inflicted cropping is worse than not cropping. The exemption needs no
  explanation at the moment it happens; the greyed-out button already says
  "this is as far out as it goes".

## Consequences

- `canZoomOut` is a comparison (`scale <= floor`), never an equality — it is
  true both *on* the floor and below it, which is what keeps the greyed-out
  state honest after an exempt Fit.
- 100% is inside the range, so Reset zoom is reachable from anywhere and is
  never greyed out. It is the way back from a below-floor Fit.
- The greyed-out state tracks the exact bound, while the indicator rounds to a
  whole percent, so a narrow window exists where the indicator reads 10% and
  Zoom out is still live — reachable by Ctrl + wheel, whose step is a notch of
  10% at most and a hair of finger travel on a trackpad, not by the buttons
  (factor 1.25 skips it). The alternative, greying out on the rounded reading,
  would disable a control that still has travel left, which is the thing the
  bounds are there to avoid saying.
- The bounds live in `useView`, which exposes `canZoomIn`/`canZoomOut` rather
  than the constants. The clamp and the greyed-out state are then the same
  expression, and cannot drift apart — including across the float round-trip
  that makes `ZOOM_MIN * ref / ref === ZOOM_MIN` unreliable.
