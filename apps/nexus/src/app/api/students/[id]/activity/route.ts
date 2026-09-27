import { NextRequest, NextResponse } from 'next/server';
import { EVENT_LABELS, getUserTimeline } from '@neram/database';
import { ApiError, describeError, errorResponse } from '@/lib/api-errors';
import { hasCapability } from '@/lib/study-materials';
import { authoriseStudentLifecycleRead } from '@/lib/student-lifecycle-server';
import { presentTimeline, type RawTimelineEntry } from '@/lib/lifecycle-display';

/**
 * GET /api/students/[id]/activity?classroom={id}&before={iso}&limit={n}
 *
 * One page of the student's history across every app (sign-ins, tools, the
 * application, calls, messages, classroom changes, feedback, merges), newest
 * first, from get_user_timeline via getUserTimeline. Pass the `nextBefore` of
 * the previous page as `before` to load older rows.
 *
 * Same gate as the core profile route (coord.student.view plus a student
 * enrolled in `classroom`). Payment rows only reach a caller who also holds
 * coord.student.finance; see presentTimeline.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: studentId } = await params;
    const { caller } = await authoriseStudentLifecycleRead(request, studentId);

    const sp = request.nextUrl.searchParams;
    const beforeParam = sp.get('before');
    const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? beforeParam : null;
    const limit = Math.min(50, Math.max(5, parseInt(sp.get('limit') || '25', 10) || 25));

    let page: Awaited<ReturnType<typeof getUserTimeline>>;
    try {
      page = await getUserTimeline(studentId, { before, limit });
    } catch (err) {
      console.error(`[students/activity] timeline read failed: ${describeError(err)}`);
      throw new ApiError('Could not load the activity history. Try again in a moment.', 503);
    }

    const entries = presentTimeline(page.entries as RawTimelineEntry[], {
      canSeeFinance: hasCapability(caller, 'coord.student.finance'),
      eventLabels: EVENT_LABELS,
    });

    return NextResponse.json(
      { entries, nextBefore: page.nextBefore },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Failed to load activity');
  }
}
