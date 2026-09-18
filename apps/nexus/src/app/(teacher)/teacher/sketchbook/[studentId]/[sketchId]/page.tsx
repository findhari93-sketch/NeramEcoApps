import { redirect } from 'next/navigation';
import { sketchbookReviewHref } from '@/lib/review-context';

/**
 * The old one-sketch page. Every drawing now opens in the one review screen,
 * which carries the reactions, Feature and optional marking this page had.
 * Kept as a redirect because Teams feature cards and digests link here.
 */
export default function TeacherSketchRedirect({ params }: { params: { studentId: string; sketchId: string } }) {
  redirect(sketchbookReviewHref(params.sketchId, params.studentId));
}
