import { redirect } from 'next/navigation';

/**
 * /student/timetable/{classId} has never been a page: the timetable opens one
 * class from `?class=`. Bell notifications sent before that was fixed still
 * point here, so this forwards them instead of showing a 404.
 */
export default function ClassDeepLink({ params }: { params: { classId: string } }) {
  redirect(`/student/timetable?class=${encodeURIComponent(params.classId)}`);
}
