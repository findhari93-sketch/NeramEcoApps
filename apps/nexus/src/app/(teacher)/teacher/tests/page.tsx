import { redirect } from 'next/navigation';

/**
 * Legacy flat "Tests" page. Folded into the unified Question Bank hub, its
 * categorized replacement lives at /teacher/question-bank/tests (tests grouped
 * by Study chapter / Recap / Foundation / Module / Classroom / Practice).
 */
export default function TeacherTestsRedirect() {
  redirect('/teacher/question-bank/tests');
}
