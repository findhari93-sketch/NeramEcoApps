/**
 * What the student slides reader shows for an answer from
 * GET /api/study-materials/files/[id]/slides.
 *
 * Pure, so every state is tested without a browser. The words a student reads
 * live here too, beside the states that use them.
 */

export type SlidesUnavailableReason = 'problem' | 'removed';

export type SlidesView =
  | { phase: 'loading' }
  | { phase: 'ready'; url: string }
  | { phase: 'unavailable'; reason: SlidesUnavailableReason }
  | { phase: 'error'; message: string };

/** How long the skeleton waits before saying why it is still waiting. */
export const SLIDES_SLOW_NOTICE_MS = 4000;

export const SLIDES_SLOW_NOTICE = "Updating to your teacher's latest slides. This can take up to a minute.";

export const SLIDES_OPEN_FAILED = 'The slides could not be opened right now. Check your connection and try again.';

export function slidesViewFromResponse(ok: boolean, body: unknown): SlidesView {
  if (!body || typeof body !== 'object') return { phase: 'error', message: SLIDES_OPEN_FAILED };
  const b = body as { slides?: unknown; error?: unknown };

  if (!ok) {
    return { phase: 'error', message: typeof b.error === 'string' && b.error ? b.error : SLIDES_OPEN_FAILED };
  }
  // The teacher removed the deck after the chapter list was loaded.
  if (b.slides === null) return { phase: 'unavailable', reason: 'removed' };

  const s = (b.slides && typeof b.slides === 'object' ? b.slides : {}) as { status?: unknown; url?: unknown };
  if (s.status === 'ready' && typeof s.url === 'string' && s.url) return { phase: 'ready', url: s.url };
  return { phase: 'unavailable', reason: 'problem' };
}

export function slidesUnavailableText(reason: SlidesUnavailableReason): string {
  return reason === 'removed'
    ? 'This chapter has no slides any more. The PDF has everything you need.'
    : "These slides can't be shown right now. You can keep studying from the PDF.";
}
