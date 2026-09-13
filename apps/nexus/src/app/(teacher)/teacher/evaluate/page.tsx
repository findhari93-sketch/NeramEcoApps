import { redirect } from 'next/navigation';

/**
 * The old "Evaluate" screen, retired.
 *
 * Drawing Module V2 (604c3551, April 2026) replaced it with Drawing Reviews and
 * deleted the four /api/drawings routes it called, but left this page behind. It
 * was in no nav and linked from nowhere, yet still routable, and every request
 * it made answered 404, so anyone who reached it saw a screen that could not
 * load or save anything.
 *
 * Kept as a redirect rather than deleted because the nav linked here before V2
 * and the URL may be bookmarked.
 */
export default function EvaluateRedirect() {
  redirect('/teacher/drawing-reviews');
}
