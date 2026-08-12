/**
 * The contract between the player and anything drawn on top of it.
 *
 * While the player is fullscreen the checkpoint quiz is portalled *into* the
 * player's own container, because the browser paints nothing outside the
 * fullscreen element's subtree. That makes the quiz a DOM descendant of the
 * player, which the body portal never was, and the player's input handlers
 * suddenly see every key and every touch the student aims at the quiz. Space
 * would toggle playback while they answer, a swipe across the panel would seek.
 *
 * The fix has to live on the player's side. Stopping propagation from the
 * overlay would work for the player and break the quiz: React delegates its
 * listeners to the root container, so an event stopped on the way up never
 * reaches React at all and the radio buttons stop responding. So the overlay
 * only declares itself, and the player declines events that came from inside it.
 */

export const VIDEO_OVERLAY_DIALOG_ATTR = 'data-video-overlay-dialog';

/** Spread onto the root of anything portalled into the player container. */
export const videoOverlayDialogProps = { [VIDEO_OVERLAY_DIALOG_ATTR]: 'true' } as const;

/** True when the event came from inside an overlay that owns its own input. */
export function isInsideVideoOverlayDialog(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`);
}
