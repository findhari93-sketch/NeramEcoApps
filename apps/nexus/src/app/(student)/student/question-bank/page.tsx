'use client';

/**
 * The Question Bank with no exam chosen. Forwards to one; see
 * `QuestionBankRedirect`. The page itself lives at `[exam]/page.tsx`.
 */

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useStudentZoneContext } from '@/components/StudentZoneProvider';
import QuestionBankRedirect from '@/components/question-bank/QuestionBankRedirect';
import { QB_EXAM_ORDER } from '@/lib/qb-exam-routes';

/** Module-level so its identity is stable and the redirect effect runs once. */
const FIRST_EXAM_ONLY = QB_EXAM_ORDER.slice(0, 1);

export default function StudentQuestionBankRedirectPage() {
  const { activeClassroom, loading } = useNexusAuthContext();
  const { qbExams } = useStudentZoneContext();

  // With no classroom there is nothing to wait for: the exam page itself
  // explains "No classroom yet".
  const noClassroom = !loading && !activeClassroom;
  const available = noClassroom ? FIRST_EXAM_ONLY : qbExams;

  return <QuestionBankRedirect surface="student" available={available} />;
}
