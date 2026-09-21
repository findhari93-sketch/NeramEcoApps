import { redirect } from 'next/navigation';

/**
 * The old student Drawings hub, retired September 2026.
 *
 * Its replacement is the Drawings hub at /student/sketchbook, which holds the
 * sketchbook and Inspiration as tabs. The path could not simply move here: the
 * question and submission pages under /student/drawings/ are still live, and
 * `student.drawings` gates this whole prefix, so a hub at this path would have
 * been dark from the day it shipped.
 */
export default function StudentDrawingsRedirect() {
  redirect('/student/sketchbook');
}
