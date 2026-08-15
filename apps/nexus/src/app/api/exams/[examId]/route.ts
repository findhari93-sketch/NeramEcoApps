import { NextRequest, NextResponse } from 'next/server';
import { cancelExam, updateExam, getExamPlacement, getSupabaseAdminClient } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { extractBearerToken } from '@/lib/ms-verify';
import { announceCancellationToTeams, announceRescheduleToTeams } from '@/lib/teams-class-announcements';

/** A delegated token only, same rule as api/exams/route.ts and .../publish/route.ts. */
function delegatedGraphToken(request: NextRequest): string | null {
  const token = extractBearerToken(request.headers.get('Authorization'));
  return token && !/^(test_|imp_|par_)/.test(token) ? token : null;
}

interface ScheduledClassTeamsSnapshot {
  scheduled_date: string;
  start_time: string;
  end_time: string;
  teams_channel_id: string | null;
  teams_channel_message_id: string | null;
  teams_group_chat_message_id: string | null;
}

/** Read, change or cancel one exam. */

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const placement = await getExamPlacement(params.examId);
    return NextResponse.json({ data: { exam: access.exam, placement } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;
    const examBefore = access.exam;

    const body = await request.json().catch(() => ({}));
    const windowChanged = body?.opens_at !== undefined || body?.closes_at !== undefined;

    // Snapshot the OLD window + Teams refs before syncExamWindow (inside
    // updateExam) overwrites the scheduled-class row's date/time -- the
    // repost needs both the "Was:" line and the prior card to soft-delete.
    const supabase = getSupabaseAdminClient();
    let clsBefore: ScheduledClassTeamsSnapshot | null = null;
    if (windowChanged) {
      const { data } = await supabase
        .from('nexus_scheduled_classes' as any)
        .select('scheduled_date, start_time, end_time, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id')
        .eq('id', examBefore.scheduled_class_id)
        .maybeSingle();
      clsBefore = data as ScheduledClassTeamsSnapshot | null;
    }

    const exam = await updateExam(params.examId, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      opensAt: body?.opens_at ?? undefined,
      closesAt: body?.closes_at ?? undefined,
      durationMinutes: body?.duration_minutes ?? undefined,
      passingPct: body?.passing_pct ?? undefined,
      testId: typeof body?.test_id === 'string' ? body.test_id : undefined,
    });

    // Repost, best-effort: a window change has already taken effect in Nexus
    // by the time this runs, so a Graph hiccup here must not undo it.
    if (windowChanged && clsBefore) {
      const graphToken = delegatedGraphToken(request);
      if (graphToken) {
        try {
          const { data: clsAfter } = await supabase
            .from('nexus_scheduled_classes' as any)
            .select('scheduled_date, start_time, end_time')
            .eq('id', examBefore.scheduled_class_id)
            .maybeSingle();
          if (clsAfter) {
            const posted = await announceRescheduleToTeams(
              graphToken,
              supabase,
              exam.classroom_id,
              clsBefore,
              {
                title: exam.title || 'Exam',
                scheduled_date: (clsAfter as any).scheduled_date,
                start_time: (clsAfter as any).start_time,
                end_time: (clsAfter as any).end_time,
              },
              { scheduled_date: clsBefore.scheduled_date, start_time: clsBefore.start_time },
            );
            if (posted) {
              await supabase
                .from('nexus_scheduled_classes' as any)
                .update({
                  teams_channel_message_id: posted.channelMessageId,
                  teams_group_chat_message_id: posted.chatMessageId,
                })
                .eq('id', examBefore.scheduled_class_id);
            }
          }
        } catch (teamsErr) {
          console.error('[Exam API] Teams reschedule announcement failed (non-blocking):', teamsErr);
        }
      }
    }

    return NextResponse.json({ data: { exam } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] PATCH Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;
    const exam = access.exam;

    // Snapshot before cancelExam deletes the scheduled-class row: the
    // announcement's own refs (to soft-delete) and the window shown on "Was:".
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from('nexus_scheduled_classes' as any)
      .select('scheduled_date, start_time, end_time, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id')
      .eq('id', exam.scheduled_class_id)
      .maybeSingle();
    const clsBefore = data as ScheduledClassTeamsSnapshot | null;

    await cancelExam(params.examId);

    // Best-effort, after the cancel has already taken effect in Nexus.
    if (clsBefore) {
      const graphToken = delegatedGraphToken(request);
      if (graphToken) {
        try {
          await announceCancellationToTeams(graphToken, supabase, exam.classroom_id, clsBefore, {
            title: exam.title || 'Exam',
            scheduled_date: clsBefore.scheduled_date,
            start_time: clsBefore.start_time,
            end_time: clsBefore.end_time,
          });
        } catch (teamsErr) {
          console.error('[Exam API] Teams cancellation announcement failed (non-blocking):', teamsErr);
        }
      }
    }

    return NextResponse.json({ data: { cancelled: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
