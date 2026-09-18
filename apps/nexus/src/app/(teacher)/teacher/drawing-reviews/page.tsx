import { redirect } from 'next/navigation';

/**
 * The Drawing Reviews queue, retired in September 2026.
 *
 * Every drawing now lives in a student's Sketchbook on its date and opens in the
 * one review screen at /teacher/drawing-reviews/[id], which stays. Owed work has
 * its own homes: assignment drawings on the assignment, test drawings on the
 * exam results sheet. Kept as a redirect because the queue was in the nav and
 * may be bookmarked.
 */
export default function DrawingReviewsRedirect() {
  redirect('/teacher/sketchbook');
}
