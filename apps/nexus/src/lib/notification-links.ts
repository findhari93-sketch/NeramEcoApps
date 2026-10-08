/**
 * Where a notification goes when it is opened, decided in one place.
 *
 * The Nexus bell and the Neram Assistant's Teams tab both open notifications.
 * The map used to live inside NotificationBell.tsx, so a Teams Activity click
 * had no way to reach it and opened the Assistant's generic home instead of the
 * page the notification was about.
 *
 * A Nexus-relative `metadata.href` wins for every event type: the sender knew
 * exactly which page it meant, and every case below is only a fallback for
 * rows that did not say. PURE and client safe.
 */
import { tellWhyPath } from '@/lib/tell-why-link';

export interface NotificationLinkRow {
  event_type: string;
  metadata: Record<string, unknown> | null;
}

/** A path on this Nexus, never another host: `//evil.com` is not relative. */
export function isNexusPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export function notificationHref(notification: NotificationLinkRow, nexusRole: string | null): string | null {
  const href = notification.metadata?.href;
  if (isNexusPath(href)) return href;
  return mappedHref(notification, nexusRole);
}

function mappedHref(
  notification: { event_type: string; metadata: Record<string, unknown> | null },
  nexusRole: string | null,
): string | null {
  switch (notification.event_type) {
    case 'classroom_enrolled': {
      const classroomId = notification.metadata?.classroom_id as string | undefined;
      if (classroomId) return `/${nexusRole || 'student'}/classrooms/${classroomId}`;
      return `/${nexusRole || 'student'}/classrooms`;
    }
    case 'batch_assigned':
    case 'batch_changed': {
      const classroomId = notification.metadata?.classroom_id as string | undefined;
      if (classroomId) return `/${nexusRole || 'student'}/classrooms/${classroomId}`;
      return `/${nexusRole || 'student'}/classrooms`;
    }
    // A reply on a ticket, in either direction. metadata.href is written by the
    // route from issue-link.ts, so the student lands on /student/issues and the
    // staff member on /teacher/issues from the SAME event type, each with the
    // ticket already open. The fallback is the bare list, never null: an
    // unmapped row renders and then does nothing when tapped.
    case 'foundation_issue_comment':
    case 'foundation_issue_recheck_requested':
    case 'foundation_issue_info_requested': {
      const href = notification.metadata?.href as string | undefined;
      if (href && href.startsWith('/')) return href;
      return `/${nexusRole || 'student'}/issues`;
    }
    // Foundation issue notifications → navigate to issues page
    case 'foundation_issue_resolved':
    case 'foundation_issue_awaiting_confirmation':
    case 'foundation_issue_in_progress':
    case 'foundation_issue_assigned':
    case 'foundation_issue_delegated':
    case 'foundation_issue_reopened':
    case 'foundation_issue_closed': {
      const href = notification.metadata?.href as string | undefined;
      if (href && href.startsWith('/')) return href;
      return `/${nexusRole || 'student'}/issues`;
    }
    case 'foundation_issue_reported':
      return `/${nexusRole || 'teacher'}/issues`;
    // A student asking about their own published result. Staff only: it lands
    // on the ticket, which carries the working behind that result.
    case 'result_dispute_raised': {
      const issueId = notification.metadata?.issue_id as string | undefined;
      return issueId ? `/teacher/issues?issue=${issueId}` : '/teacher/issues';
    }
    // A reported mistake: staff land on the question in its paper (Videos mode
    // for a video), the student on the question they reported. Both hrefs are
    // written by the routes; the fallbacks are the two report lists.
    case 'qb_solution_reported': {
      const href = notification.metadata?.href as string | undefined;
      return href && href.startsWith('/') ? href : '/teacher/question-bank/reports';
    }
    case 'qb_report_resolved': {
      const href = notification.metadata?.href as string | undefined;
      return href && href.startsWith('/') ? href : '/student/question-bank/reports';
    }
    // Assignment reminder → open the assignment it was about.
    case 'assignment_nudge': {
      const ids = notification.metadata?.assignment_ids as string[] | undefined;
      const assignmentId = Array.isArray(ids) ? ids[0] : undefined;
      return assignmentId
        ? `/${nexusRole || 'student'}/assignments/${assignmentId}`
        : `/${nexusRole || 'student'}/assignments`;
    }
    // The three raised by the test results screen. All land on the test itself:
    // a message about a paper, a reopened window and a corrected score are only
    // actionable next to the paper they are about. Without these cases the row
    // renders and then does nothing when tapped, which is how class_test_due sat
    // inert for a whole release.
    case 'test_result_message':
    case 'test_reopened':
    case 'test_regraded': {
      const testId = notification.metadata?.test_id as string | undefined;
      const placementId = notification.metadata?.placement_id as string | undefined;
      // "Tell me why" asks a question the take page cannot answer. It opens the
      // student's tests with the "Tell your teacher why" sheet on that run, the
      // same address the Teams chat link carries.
      if (
        notification.event_type === 'test_result_message' &&
        notification.metadata?.template === 'why' &&
        placementId &&
        nexusRole !== 'teacher'
      ) {
        return tellWhyPath(placementId);
      }
      if (!testId) return `/${nexusRole || 'student'}/tests`;
      const run = placementId ? `&placement_id=${encodeURIComponent(placementId)}` : '';
      // A teacher lands on the results they were working from; a student lands
      // in the paper itself, because being told to redo a test and then having
      // to find it is how a reopened window goes unused.
      return nexusRole === 'teacher'
        ? `/teacher/tests/${testId}?tab=results${run}`
        : `/student/tests/take?test_id=${testId}${run}`;
    }
    // Study-material reminder → open the study materials space.
    case 'study_material_nudge':
      return `/${nexusRole || 'student'}/study-materials`;
    // Assignment reviewed → open the graded assignment.
    case 'assignment_reviewed': {
      const assignmentId = notification.metadata?.assignment_id as string | undefined;
      return assignmentId
        ? `/${nexusRole || 'student'}/assignments/${assignmentId}`
        : `/${nexusRole || 'student'}/assignments`;
    }
    // The daily staff roll-up. Reasons now sit on each student and each class
    // (the separate Reasons feed was folded in, 2026-10), so the page itself.
    case 'catchup_digest':
      return '/teacher/catch-up';
    // Congratulations: a cleared class, a clean slate, or a teacher's note.
    // All land on the student's own list, where the win is visible.
    case 'catchup_item_cleared':
    case 'catchup_all_clear':
    case 'catchup_note':
      return '/student/catch-up';
    // A teacher (or the weekly cron) asking a student to catch up. The per-class
    // nudge stamps the class it is about, so land on that class's catch-up page;
    // the pace nudge names no class and opens the backlog instead. Without this
    // case the row was inert, and the message named a class with no way to reach it.
    case 'catchup_behind_pace': {
      const classId = notification.metadata?.scheduled_class_id as string | undefined;
      return classId ? `/student/timetable/${classId}/catch-up` : '/student/catch-up';
    }
    // A class test is due. This case was missing since the event type was added,
    // so every one of those rows was inert: it told a student to finish a paper
    // and then did nothing when they tapped it.
    case 'class_test_due': {
      const classId = notification.metadata?.class_id as string | undefined;
      return classId
        ? `/${nexusRole || 'student'}/timetable/${classId}`
        : `/${nexusRole || 'student'}/tests`;
    }
    // Exams. All three land on the class the exam is scheduled on, which is
    // where the lobby, the countdown and afterwards the result all live.
    case 'exam_scheduled':
    case 'exam_result':
    case 'exam_makeup_granted': {
      const classId = notification.metadata?.class_id as string | undefined;
      return classId
        ? `/${nexusRole || 'student'}/timetable/${classId}/exam`
        : `/${nexusRole || 'student'}/tests`;
    }
    // Both land on the sketch itself. A student taps through to see the
    // reaction next to the drawing; a staff viewer (impersonation) gets the
    // teacher route for the same sketch.
    case 'sketch_reaction':
    case 'sketch_featured': {
      // A featured drawing is now on the Inspiration shelf, so send the student
      // to where it is being looked at rather than back to their own sketchbook.
      // Only featuring writes this key, and only when the drawing actually
      // reached the shelf, so a reaction and a private student's feature both
      // fall through to the sketch itself.
      const itemId = notification.metadata?.inspiration_item_id as string | undefined;
      if (itemId && nexusRole === 'student') return `/student/inspiration/${itemId}`;
      const submissionId = notification.metadata?.submission_id as string | undefined;
      if (!submissionId) return '/student/sketchbook';
      return nexusRole === 'student' ? `/student/sketchbook/${submissionId}` : '/teacher/sketchbook';
    }
    // "Time for a quick sketch": straight into adding one, not onto a page to find the button.
    case 'sketch_rhythm_nudge':
    case 'sketch_milestone':
      return notification.event_type === 'sketch_rhythm_nudge' ? '/student/sketchbook?add=1' : '/student/sketchbook';
    // The teacher's evening digest opens Class rhythm on whoever needs a call, else the new sketches.
    case 'sketch_digest': {
      if (notification.metadata?.teams_sender_problem) return '/teacher/sketchbook?view=rhythm';
      const needsCall = Number(notification.metadata?.needs_call || 0);
      return needsCall > 0 ? '/teacher/sketchbook?view=rhythm&status=needs_call' : '/teacher/sketchbook';
    }
    case 'scorecard_reminder':
    case 'scorecard_released':
      return `/${nexusRole || 'student'}/documents`;
    case 'exam_date_reminder':
      return `/${nexusRole || 'student'}/exam-schedule`;
    // Class notices, now on the main bell too. Each opens the class it is about.
    case 'class_cancelled':
    case 'class_rescheduled':
    case 'class_created':
    case 'recording_available': {
      const classId = notification.metadata?.class_id as string | undefined;
      return classId ? `/${nexusRole || 'student'}/timetable/${classId}` : `/${nexusRole || 'student'}/timetable`;
    }
    case 'week_published':
      return `/${nexusRole || 'student'}/timetable`;
    case 'absence_reason_needed': {
      const classId = notification.metadata?.class_id as string | undefined;
      return classId ? `/student/timetable/${classId}/catch-up` : '/student/catch-up';
    }
    case 'test_scheduled':
      return `/${nexusRole || 'student'}/tests`;
    case 'recap_ready': {
      // Straight into the catch-up workspace for that class, which is where the
      // recap plays. Landing them on the timetable instead would mean the
      // message said "it is ready" and then made them go and find it.
      const classId = notification.metadata?.scheduled_class_id as string | undefined;
      return classId ? `/student/timetable/${classId}/catch-up` : '/student/catch-up';
    }
    case 'assignment_published':
    case 'assignment_linked': {
      const assignmentId = notification.metadata?.assignment_id as string | undefined;
      return assignmentId ? `/${nexusRole || 'student'}/assignments/${assignmentId}` : `/${nexusRole || 'student'}/assignments`;
    }
    case 'test_access_granted':
    case 'test_access_declined': {
      const testId = notification.metadata?.test_id as string | undefined;
      const placementId = notification.metadata?.placement_id as string | undefined;
      if (!testId) return '/student/tests';
      return `/student/tests/take?test_id=${testId}${placementId ? `&placement_id=${encodeURIComponent(placementId)}` : ''}`;
    }
    case 'application_details_needed':
      // The whole point of the ping is getting them to the form, so an unmapped
      // event type (a non-clickable row) would waste the one message that reaches
      // a student who barely opens Nexus.
      return '/student/complete-profile';
    case 'catchup_overdue':
    case 'prework_reason_needed':
    case 'recap_needs_review': {
      const href = notification.metadata?.href as string | undefined;
      if (href && href.startsWith('/')) return href;
      const classId = (notification.metadata?.scheduled_class_id || notification.metadata?.class_id) as string | undefined;
      return classId ? `/${nexusRole || 'student'}/timetable/${classId}` : null;
    }
    default:
      return null;
  }
}
