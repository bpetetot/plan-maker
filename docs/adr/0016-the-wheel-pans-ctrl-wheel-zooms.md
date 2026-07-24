# The wheel pans, Ctrl + wheel zooms

A bare `wheel` pans the view; `Ctrl`/`Cmd` + `wheel` zooms at the cursor;
`Shift` + `wheel` pans sideways. The editor never asks whether the event came
from a mouse or a trackpad, **because the browser does not say.**

The wheel used to zoom, by a fixed factor of 1.08 per event. That reads as a
sensible step only because a mouse wheel emits roughly one event per notch. A
trackpad emits dozens per gesture, and the same code turned a single pinch into
1.08³⁰ ≈ ×10 — the zoom was not badly tuned, it was not tuned at all. The
magnitude of `deltaY`, the one number that separates a notch from a hair of
finger travel, was discarded.

The fix has two halves, and only the second one is a judgement call.

**The dosage** is arithmetic: the factor now follows the delta,
`exp(clamp(delta, ±10) × ln(1.1)/10)`, so a notch is 10% and a burst of small
deltas adds up to a fine step. The clamp is what makes a single event unable to
outrun one notch. The model stays multiplicative, so the step feels the same at
20% as at 2000% — Excalidraw's `log10` correction compensates for the
irregularity of an *additive* zoom, and has nothing to correct here.

**The gesture** is the judgement call, and the reason this ADR exists. The
sensible-looking alternative is to keep the mouse wheel zooming and only pan for
the trackpad. That requires guessing the device, and the browser exposes no such
field. The guess would rest on `deltaMode` (only Firefox distinguishes) and on
the shape of the deltas — integers near ±100 with no `deltaX` for a mouse,
small fractional bursts for a trackpad. It is wrong for free-spinning wheels and
for smooth-scroll drivers, and worse, it can be wrong *mid-gesture*: one event
misread inside a trackpad burst is a visible jump. The rule that never misfires
is the one that never guesses.

The cost is real and is accepted: a mouse wheel no longer zooms on its own.
`Ctrl` + wheel, the +/− buttons and `Mod+=` / `Mod+−` all still do.

## Considered Options

- **Heuristic device detection.** Rejected: an invisible rule the user cannot
  learn, cannot see fail, and cannot correct — and the failure mode is a jump
  in the middle of their gesture, not a wrong preference they could adjust.
- **Heuristic plus a lock on the first event of a burst.** Rejected: it fixes
  the mid-gesture jump but keeps the invisible rule, and buys back a habit at
  the price of a stateful timer whose behaviour no test can pin to a device.
- **Keep the wheel zooming, only fix the dosage.** Rejected: it leaves the
  trackpad with no way to pan at all — the two-finger gesture every other canvas
  reserves for exactly that.
- **A sensitivity setting in the UI.** Rejected: it answers "too sensitive" by
  asking the user to solve it, and CONTEXT.md rules out the panel that would
  hold it. The constant is one line in `useView`.
- **Excalidraw's additive zoom, transposed literally.** Rejected: a four-term
  formula to reproduce a curve our multiplicative camera already gives for
  free.

## Consequences

- `deltaMode` is normalised to pixels before anything reads it (16px per line).
  Firefox sends lines for a mouse wheel — Excalidraw does not convert, which
  makes its wheel nearly immobile there. Page mode gets no branch: no browser
  in use emits it, and the conversion would need a layout read per event.
- The pinch needs no code of its own: macOS and Windows deliver it as a `wheel`
  with `ctrlKey: true`, so it lands on the zoom branch by construction. The
  `preventDefault` that was already there for zooming is now also what keeps the
  browser from zooming the page.
- The wheel keeps working while a wall chain or a drag is in progress — that is
  how a point off screen gets reached without breaking the chain. The preview
  re-anchors on the next pointer move. The one exception is a Pan drag already
  under way: zooming under a held pointer would rescale the very gesture in
  flight, so `useView` takes a predicate from `Editor` and stands aside.
- The gesture catalogue (ADR 0011) carries the change: `Scroll` now reads
  "Pan the view top-down", set apart from the sideways "Shift + scroll" and from
  the "Pan the view" that still merges Space + drag with middle-click + drag.
