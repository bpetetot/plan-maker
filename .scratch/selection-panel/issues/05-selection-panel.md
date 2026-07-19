# 05 — Selection panel replacing the popover

Status: resolved

Implements [spec](../spec.md) §1–§3 except the wall measure rows
([06 — Wall measure rows](06-wall-measure-rows.md)).

## Scope

- New selection panel component (floating card, left 16 / top 72, 232px):
  header with tinted icon badge + type title, sectioned body, full-width
  danger Delete at the bottom. Chrome and dark theme via the existing CSS
  variables; icons from `lucide-react`.
- Content: door (Width preset select, Options Hinge/Swing, Delete), window
  (Width, Delete), multi-selection (count + Delete). Wall shows its
  `Dimensions` section shell with a temporary single `Length` row (axis +
  thickness, as the popover shows today) until 06 lands the semantics.
- Hidden on empty selection; instant show/hide; content switches instantly.
- No focus steal on selection; Tab in DOM order; `isTypingTarget` untouched.
- Height capped above the bottom-left controls, internal scroll beyond.
- Remove the popover: rendering block and anchoring code in
  `src/editor/Editor.tsx`, `.popover` CSS in `src/styles.css`.
- Update the tests that relied on popover anchoring; keep the existing
  assertions on content ("Door", Delete button) passing against the panel.

## Reference

Retained variant A on branch `prototype/selection-panel` (commit f3c1b29) —
rewrite properly, do not promote the prototype code as-is.
