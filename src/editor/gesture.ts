// The screen-space constants every pointer gesture reads. Screen px, not cm:
// they hold their size whatever the Zoom, which is why they live outside the model.

/** Below this a gesture was a click, not a drag. */
export const CLICK_PX = 4;

// The snap ladder's reach, constant whatever the zoom.
const SNAP_PX = 14;

/** Shared by the Plan drags and the tools, which aim through the same ladder. */
export const snapTolerance = (pxPerCm: number) => SNAP_PX / pxPerCm;

// Tighter than the ladder's on purpose: a guide is a band across the whole
// sheet, not a disc, so at the ladder's reach it would be sticky everywhere.
const GUIDE_PX = 4;

/** The alignment rung's own reach (ADR 0037). */
export const guideTolerance = (pxPerCm: number) => GUIDE_PX / pxPerCm;
