import { NextRequest, NextResponse } from 'next/server';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import { loadParentWork, type ParentAssignmentListItem } from '@/lib/parent-work';
import type { EnrollmentNotice, ParentChildRef } from '@/lib/parent-view-types';
import type { ParentAssignmentSummary } from '@/lib/parent-assignments';

/**
 * GET /api/parent/assignments?student=
 *
 * Every published assignment for the child, bucketed by who has to act next.
 *
 * The buckets are the point. A chronological list answers "what was set", which
 * is not a parent's question. "What does he still have to do, what is sitting
 * with the teacher, and how did the marked work go" maps onto the three things a
 * parent can actually do: nudge, wait, or discuss.
 *
 * Each item carries an anonymous class total so a parent can tell an outstanding
 * assignment nobody has started from one everybody else has handed in. Never a
 * name, never an id, and nothing at all below five eligible students. See
 * lib/parent-aggregate.ts.
 *
 * No window parameter: the classroom's published set is bounded by the term, and
 * a parent scrolling back through the year is a normal thing to do.
 */

export interface ParentAssignmentsResponse {
  child: ParentChildRef;
  notice: EnrollmentNotice | null;
  summary: ParentAssignmentSummary;
  buckets: {
    needsDoing: ParentAssignmentListItem[];
    waitingOnTeacher: ParentAssignmentListItem[];
    marked: ParentAssignmentListItem[];
  };
}

export async function GET(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));
    const { child, classroomId } = await resolveChildContext(
      parent.id,
      request.nextUrl.searchParams.get('student')
    );

    const { notice } = await loadEnrollmentContext(child.id, classroomId, child.name);
    const { items, summary } = await loadParentWork(child.id, classroomId);

    // Newest first within each bucket: recent work is what a conversation at
    // home is actually going to be about.
    const byNewest = (a: ParentAssignmentListItem, b: ParentAssignmentListItem) =>
      b.classDate.localeCompare(a.classDate);

    const body: ParentAssignmentsResponse = {
      child: {
        id: child.id,
        name: child.name,
        avatar_url: child.avatar_url,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      notice,
      summary,
      buckets: {
        // Overdue first inside "still to do", because that is the one thing on
        // this page a parent might act on tonight.
        needsDoing: items
          .filter((i) => i.bucket === 'needs_doing')
          .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || byNewest(a, b)),
        waitingOnTeacher: items
          .filter((i) => i.bucket === 'waiting_on_teacher')
          .sort(byNewest),
        marked: items.filter((i) => i.bucket === 'marked').sort(byNewest),
      },
    };

    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Could not load the assignments');
  }
}
