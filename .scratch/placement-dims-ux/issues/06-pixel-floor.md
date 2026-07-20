# 06 — The pixel floor: how the chip behaves as the plan zooms out

Type: grilling
Status: resolved
Blocked by: 02

Graduated from the map's fog once [02 — The visual register of placement
dimensions](02-visual-register-prototype.md) settled the register on a chip:
the question could only be phrased sharply once there was a chip to phrase it
about.

## Question

Placement dims are short by nature, so the register has to survive zooming out.
Ticket 01 supplies the mechanism and a shipped precedent; this ticket picks the
shape and the numbers.

- **Floor or lock?** The prototype **pins** the chip to screen pixels outright
  (Sweet Home 3D's `fontSize / scale`), so it is the same physical size at
  every zoom. Chief Architect instead ships a **floor**: the thing scales with
  the plan normally, and only stops shrinking once it would fall below a pixel
  threshold. The floor avoids the "text stays huge while the plan shrinks"
  artefact a pure lock produces at high zoom — but the lock is simpler, and
  simplicity beats precision here. Which one?
- **What obeys it — the whole chip, or only its text?** A chip that keeps its
  padding while the text floors reads differently from one that scales whole.
- **What is the threshold**, in screen pixels? Chief Architect does not
  document its default, so this is ours to pick.
- **Does the chip disappear below some zoom** rather than flooring forever? At
  a far-out zoom two chips on a short wall will collide with each other and
  with the opening glyph regardless of how legible each one is.
- **Does the same rule reach the wall Dimension?** Today it scales with the
  plan. If the floor is right for the contextual register, state explicitly why
  the permanent one keeps scaling — ticket 01 gives the rationale (the
  contextual register is chrome, not content, so it may disobey drawing scale),
  and the spec should carry it.

Chief Architect's framing is the one to test against: the floor "governs the
on-screen size and does not affect printed or exported output". Our placement
dims never reach PNG export at all, so that constraint is free — but the
reasoning is what ticket 04 needs to write down.

## Answer

**A lock, not a floor** — and the lock is what separates the two registers
rather than a legibility patch bolted onto small zoom.

**Lock, not floor.** The chip keeps the same physical size at every zoom, as
the ticket-02 prototype already rendered it (`scale(1/pxPerCm)`, Sweet Home
3D's approach). The floor was the more precise answer and lost to the simpler
one: it needs a threshold nobody can derive, it gives the chip two regimes
instead of one, and — decisive — it makes the chip obey drawing scale over most
of the zoom range, which is exactly the property this map is trying to deny it.
The accepted cost is the artefact the floor exists to avoid: at high zoom a 9px
chip sits inside a wall rendered far thicker. It reads as chrome, which is what
it is.

**The whole chip obeys, and only its size.** One `scale(1/pxPerCm)` wrapper
around the group, padding included — padding that scaled around frozen text has
no defensible reading. The chip's *centre* stays in plan coordinates, on the
wall axis, centred on its clearance: ticket 03 forbids it from shifting, and
the lock does not touch position.

**No threshold to pick** — the lock has none. The size is the one the prototype
was judged at: 9px text plus its padding, the value `.dim` already carries.

**The chip never disappears.** Zooming out is the short clearance in disguise —
the same phenomenon, so the same rule as ticket 03: it shows and overflows.
One rule covers both cases, no threshold is invented, and the feedback does not
blink out during a continuous zoom, at the very moment the user is moving an
opening. Two chips colliding on a short wall far out stays the accepted ugly
case, consistent with two near-abutting openings at normal zoom.

**The wall Dimension is unchanged — it keeps scaling with the plan.** This is
the line ticket 01 surfaced, and ticket 04 must carry it into the spec as the
*reason*, not as an exception: the wall Dimension is **drawing** — it belongs to
the sheet and it is what leaves through PNG export — so it obeys drawing scale.
The placement chip is **interaction chrome**, never exported (`measure-semantics`),
which is precisely what entitles it to disobey. Locking both would detach the
wall Dimension from the sheet it annotates and make it render differently on
screen and in the export.
