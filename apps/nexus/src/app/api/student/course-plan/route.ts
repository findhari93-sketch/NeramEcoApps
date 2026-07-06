import { NextRequest, NextResponse } from 'next/server';
import {
  listActivePlansForStudent,
  getTeachingPlanWithEntries,
  listAssignmentsForPlan,
  getMySubmissions,
  getPublishedRecapsByScheduledClassIds,
} from '@neram/database';
import type { NexusTeachingPlanEntryDetail, AssignmentSummary } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';

/** How many upcoming classes a student sees beyond today (plans change often). */
const FUTURE_PREVIEW_DAYS = 1;

type MyStatus = 'missing' | 'submitted' | 'late' | 'reviewed' | 'redo';

function myStatus(
  assignment: AssignmentSummary,
  submission: { status: string; submitted_at: string; marks: number | null } | undefined,
): { my_status: MyStatus; marks: number | null } {
  if (!submission) return { my_status: 'missing', marks: null };
  if (submission.status === 'reviewed') return { my_status: 'reviewed', marks: submission.marks };
  if (submission.status === 'redo') return { my_status: 'redo', marks: submission.marks };
  const late =
    assignment.due_at != null &&
    new Date(submission.submitted_at).getTime() > new Date(assignment.due_at).getTime();
  return { my_status: late ? 'late' : 'submitted', marks: submission.marks };
}

/**
 * GET /api/student/course-plan
 * Per active plan across the student's enrolled classrooms: the classes that
 * have happened (plus today and one upcoming preview), each with the topic,
 * teacher, whether a gated recap is available, and the assignment + the
 * student's own submission status. Recording URLs are never exposed here;
 * recordings are watchable only through the gated recap.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const today = istToday();
    const activePlans = await listActivePlansForStudent(user.id);

    const plans = [];
    for (const { classroom, plan } of activePlans) {
      const full = await getTeachingPlanWithEntries(plan.id);
      if (!full) continue;
      const flow = computeFlow(toFlowEntries(full.entries), {
        startDate: full.start_date,
        saturdayClasses: full.saturday_classes ?? true,
        today,
      });
      const entryById = new Map(full.entries.map((e) => [e.id, e as NexusTeachingPlanEntryDetail]));

      // Days to show: everything up to and including today, plus the next N.
      const pastAndToday = flow.days.filter((d) => d.date <= today && (d.entryId || d.isTest));
      const upcomingDays = flow.days
        .filter((d) => d.date > today && (d.entryId || d.isTest))
        .slice(0, FUTURE_PREVIEW_DAYS);
      const shownDays = [...pastAndToday, ...upcomingDays];

      // Batch-enrich: assignments for the shown dates + my submissions + recaps.
      const dates = [...new Set(shownDays.map((d) => d.date))];
      const assignments = await listAssignmentsForPlan(plan.id, dates);
      const publishedOnly = assignments.filter((a) => a.status !== 'draft');
      const mySubs = await getMySubmissions(
        user.id,
        publishedOnly.map((a) => a.id),
      );

      const classIds: string[] = [];
      for (const d of shownDays) {
        const entry = d.entryId ? entryById.get(d.entryId) : null;
        const cls = entry?.classes?.find((c) => c.scheduled_date === d.date);
        if (cls) classIds.push(cls.id);
      }
      const recapByClass = await getPublishedRecapsByScheduledClassIds(classIds);

      const buildDay = (d: (typeof shownDays)[number]) => {
        const entry = d.entryId ? entryById.get(d.entryId) : null;
        const cls = entry?.classes?.find((c) => c.scheduled_date === d.date) || null;
        const recap = cls ? recapByClass.get(cls.id) : undefined;
        const hasRecording = !!(cls && (cls.recording_url || cls.youtube_url));
        const dayAssignments = publishedOnly
          .filter((a) => a.class_date === d.date)
          .map((a) => {
            const sub = mySubs.get(a.id);
            const { my_status, marks } = myStatus(a, sub);
            return {
              id: a.id,
              title: a.title,
              due_at: a.due_at,
              max_marks: a.max_marks,
              my_status,
              marks,
            };
          });
        return {
          date: d.date,
          is_today: d.date === today,
          is_test: d.isTest,
          test_title: d.isTest ? entry?.test?.title ?? entry?.label ?? 'Test' : null,
          topic: entry?.topic
            ? { title: entry.topic.title, module_color: entry.topic.module?.color ?? null }
            : null,
          session_label:
            !d.isTest && d.sessionCount > 1 ? `Day ${d.sessionIndex + 1} of ${d.sessionCount}` : null,
          teacher: cls?.teacher ? { name: cls.teacher.name } : null,
          // Recording is gated: only a published recap is watchable.
          recap: recap && recap.status === 'published' ? { id: recap.id } : null,
          recording_pending: hasRecording && !(recap && recap.status === 'published'),
          assignments: dayAssignments,
        };
      };

      plans.push({
        classroom,
        plan: {
          id: plan.id,
          title: plan.title,
          exam_type: plan.exam_type,
          start_date: plan.start_date,
          expected_end_date: plan.expected_end_date,
        },
        days: pastAndToday.map(buildDay),
        upcoming: upcomingDays.map(buildDay),
      });
    }

    return NextResponse.json({ plans });
  } catch (err) {
    return errorResponse(err, 'Failed to load course plan');
  }
}
