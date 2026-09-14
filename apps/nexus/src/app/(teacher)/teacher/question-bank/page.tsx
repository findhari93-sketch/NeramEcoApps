'use client';

/**
 * The Question Bank with no exam chosen. Forwards to one; see
 * `QuestionBankRedirect`. The page itself lives at `[exam]/page.tsx`.
 *
 * Every teacher sub-page's Back link still points here, and lands on the exam
 * the teacher came from.
 */

import QuestionBankRedirect from '@/components/question-bank/QuestionBankRedirect';
import { QB_EXAM_ORDER } from '@/lib/qb-exam-routes';

export default function TeacherQuestionBankRedirectPage() {
  // Staff see every exam, so there is nothing to wait for.
  return <QuestionBankRedirect surface="teacher" available={QB_EXAM_ORDER} />;
}
