import { redirect } from 'next/navigation';

/**
 * Tests moved out of the Question Bank into their own section. The grouped
 * tests overview now lives at /teacher/tests.
 */
export default function QuestionBankTestsRedirect() {
  redirect('/teacher/tests');
}
