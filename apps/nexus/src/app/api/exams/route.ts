import { NextRequest, NextResponse } from 'next/server';
import {
  createExamSeries,
  listExamsForClassroom,
  getSupabaseAdminClient,
  EXAM_ATTEMPT_LIMIT,
} from '@neram/database';
import { resolveExamCaller, isStaff } from '@/lib/exam-access';
import { extractBearerToken } from '@/lib/ms-verify';
import { announceScheduledTestToTeams } from '@/lib/teams-class-announcements';
import { notifyStudents } from '@/lib/notify-students';

/**
 * Schedule an exam, or list the ones a classroom has.
 *
 * One press can schedule the same paper across several classrooms. Each gets
 * its own timetable row, its own exam and its own placement, all sharing one
 * series_id and one test, so each classroom's Teams post can carry its own
 * podium while the teacher still gets a cross-classroom comparison.
 */

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const classroomId = new URL(request.url).searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const exams = await listExamsForClassroom(classroomId);
    return NextResponse.json({ data: { exams } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exams API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const classroomIds: string[] = Array.isArray(body?.classroom_ids)
      ? body.classroom_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    const testId = typeof body?.test_id === 'string' ? body.test_id : '';
    const title = typeof body?.title === 'string' ? body.title : '';

    if (classroomIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one classroom' }, { status: 400 });
    }
    if (!testId) {
      return NextResponse.json({ error: 'Pick the paper this exam sits' }, { status: 400 });
    }
    if (!body?.opens_at || !body?.closes_at) {
      return NextResponse.json({ error: 'An exam needs a window' }, { status: 400 });
    }

    const coveredClassIds: string[] = Array.isArray(body?.covered_class_ids)
      ? body.covered_class_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    // Each classroom has its own lecture instances, so "which class(es) does
    // this cover" only makes sense scoped to one classroom at a time.
    if (coveredClassIds.length > 0 && classroomIds.length > 1) {
      return NextResponse.json(
        { error: 'Pick one classroom to link this exam to specific classes' },
        { status: 400 },
      );
    }

    // The paper has to exist and be usable before N timetable rows are created
    // for it: failing after the third classroom would leave a half-scheduled
    // exam nobody asked for.
    const supabase = getSupabaseAdminClient();
    const { data: test } = await supabase
      .from('nexus_tests' as any)
      .select('id, title, duration_minutes, is_active')
      .eq('id', testId)
      .maybeSingle();
    if (!test || (test as any).is_active === false) {
      return NextResponse.json({ error: 'That paper no longer exists' }, { status: 404 });
    }

    const mode = body?.mode === 'practice' ? 'practice' : undefined;
    // Distinguish "not sent" (undefined, keeps the ranked-exam default) from
    // an explicit null ("unlimited", practice mode only) from a chosen number.
    const attemptLimit =
      typeof body?.attempt_limit === 'number'
        ? body.attempt_limit
        : body?.attempt_limit === null
          ? null
          : undefined;

    const result = await createExamSeries({
      classroomIds,
      testId,
      title: title || (test as any).title || 'Exam',
      opensAt: body.opens_at,
      closesAt: body.closes_at,
      durationMinutes:
        body?.duration_minutes ?? (test as any).duration_minutes ?? null,
      passingPct: body?.passing_pct ?? null,
      teacherId: resolved.caller.id,
      createdBy: resolved.caller.id,
      mode,
      attemptLimit,
      proctoringEnabled: body?.proctoring_enabled === true,
      violationLimit: typeof body?.violation_limit === 'number' ? body.violation_limit : undefined,
      coveredClassIds,
    });

    // Announce + notify, best-effort: a Graph hiccup here must never fail an
    // exam that has already been created. One classroom's failure must not
    // stop the next one's announcement either, so each exam gets its own
    // try/catch rather than one around the whole loop.
    const effectiveMode = mode ?? 'ranked';
    const effectiveAttemptLimit =
      effectiveMode === 'practice' ? (attemptLimit === undefined ? EXAM_ATTEMPT_LIMIT : attemptLimit) : null;

    // The caller's own bearer token IS the delegated Graph token needed to
    // post a channel/chat message (an app-only token cannot), same reasoning
    // as api/exams/[examId]/publish/route.ts. Test/impersonation/parent
    // tokens are never real Microsoft tokens, so the channel post is skipped
    // for them -- the in-app/Teams-activity student notify below still runs,
    // since that goes through app-level credentials, not this token.
    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    const canPostToChannel = Boolean(graphToken) && !/^(test_|imp_|par_)/.test(graphToken || '');

    for (const exam of result.exams) {
      const { data: cls } = await supabase
        .from('nexus_scheduled_classes' as any)
        .select('scheduled_date, start_time, end_time')
        .eq('id', exam.scheduled_class_id)
        .maybeSingle();
      const clsRow = cls as { scheduled_date: string; start_time: string; end_time: string } | null;

      if (canPostToChannel && clsRow) {
        try {
          const posted = await announceScheduledTestToTeams(graphToken as string, supabase, exam.classroom_id, {
            title: exam.title || 'Exam',
            scheduled_date: clsRow.scheduled_date,
            start_time: clsRow.start_time,
            end_time: clsRow.end_time,
            duration_minutes: exam.duration_minutes,
            mode: effectiveMode,
            attempt_limit: effectiveAttemptLimit,
          });
          if (posted) {
            await supabase
              .from('nexus_scheduled_classes' as any)
              .update({
                teams_channel_id: posted.channelId,
                teams_channel_message_id: posted.channelMessageId,
                teams_group_chat_message_id: posted.chatMessageId,
              })
              .eq('id', exam.scheduled_class_id);
          }
        } catch (teamsErr) {
          console.error('[Exams API] Teams announcement failed (non-blocking):', teamsErr);
        }
      }

      try {
        const when = clsRow ? `${clsRow.scheduled_date}, ${clsRow.start_time}-${clsRow.end_time} IST` : 'soon';
        await notifyStudents({
          classroomId: exam.classroom_id,
          eventType: 'test_scheduled',
          title: `${effectiveMode === 'practice' ? 'Practice test' : 'Exam'} scheduled: ${exam.title || 'Exam'}`,
          message: `Opens ${when}.`,
        });
      } catch (notifyErr) {
        console.error('[Exams API] Student notify failed (non-blocking):', notifyErr);
      }
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exams API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
