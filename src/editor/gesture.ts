// The screen-space constants every pointer gesture reads. Screen px, not cm:
// they hold their size whatever the Zoom, which is why they live outside the model.

/** Below this a gesture was a click, not a drag. */
export const CLICK_PX = 4;

// The snap ladder's reach, constant whatever the zoom.
const SNAP_PX = 14;

/** Shared by the Plan drags and the tools, which aim through the same ladder. */
export const snapTolerance = (pxPerCm: number) => SNAP_PX / pxPerCm;
