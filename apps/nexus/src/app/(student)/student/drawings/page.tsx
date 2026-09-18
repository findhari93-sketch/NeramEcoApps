import { redirect } from 'next/navigation';

/**
 * The student Drawings hub, replaced by Inspiration (September 2026). Its
 * question and submission pages under /student/drawings/ stay, because
 * notifications and older links point at them.
 */
export default function StudentDrawingsRedirect() {
  redirect('/student/inspiration');
}
