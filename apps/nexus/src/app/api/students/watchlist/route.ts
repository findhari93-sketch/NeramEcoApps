import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff, isAdmin } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { sendNudge } from '@/lib/nudge-delivery';
import {
  ACTION_EVENT,
  ACTION_STAGE,
  buildTemplate,
  canTakeAction,
  sendsMessage,
  type WatchlistAction,
  type WatchlistStage,
} from '@/lib/watchlist-templates';

/**
 * POST /api/students/watchlist  (staff)
 *
 * Take one rung of the inactivity escalation ladder for one or more students,
 * and record it. The system never escalates by itself: every row written here
 * has a person's id on it.
 *
 * Body: {
 *   classroomId, studentIds[], action,
 *   reasons?: string[],      // score chips at the moment of acting, for the message
 *   score?, tier?,           // stamped onto the event so the audit shows WHY
 *   snoozeUntil?, note?
 * }
 */

const VALID_ACTIONS: WatchlistAction[] = [
  'nudge',
  'warn',
  'parent_contacted',
  'final_notice',
  'resolve',
  'snooze',
  'note',
  'removed',
];

const MAX_STUDENTS = 100;

export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(staff);
    const admin = isAdmin(staff);

    const body = await request.json();
    const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : '';
    const action = body?.action as WatchlistAction;
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: any) => typeof x === 'string')
      : [];
    const reasons: string[] = Array.isArray(body?.reasons)
      ? body.reasons.filter((x: any) => typeof x === 'string')
      : [];
    const note = typeof body?.note === 'string' ? body.note.trim() : null;
    const snoozeUntil = typeof body?.snoozeUntil === 'string' ? body.snoozeUntil : null;
    const score = typeof body?.score === 'number' ? body.score : null;
    const tier = typeof body?.tier === 'string' ? body.tier : null;

    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (studentIds.length === 0) {
      return NextResponse.json({ error: 'No students selected' }, { status: 400 });
    }
    if (studentIds.length > MAX_STUDENTS) {
      return NextResponse.json(
        { error: `Too many at once. Send at most ${MAX_STUDENTS} per request.` },
        { status: 400 },
      );
    }
    if (action === 'snooze' && !snoozeUntil) {
      return NextResponse.json({ error: 'snoozeUntil is required to snooze' }, { status: 400 });
    }
    if (action === 'note' && !note) {
      return NextResponse.json({ error: 'A note cannot be empty' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const now = new Date().toISOString();

    // Current stage per student, so we can reject a skipped rung before writing
    // anything. Missing row means stage 'none'.
    const { data: existing } = await supabase
      .from('nexus_student_watchlist')
      .select('id, student_id, stage')
      .eq('classroom_id', classroomId)
      .in('student_id', studentIds);
    const stageBy = new Map<string, { id: string; stage: WatchlistStage }>(
      ((existing || []) as any[]).map((r) => [r.student_id, { id: r.id, stage: r.stage }]),
    );

    const blocked = studentIds.filter(
      (sid) => !canTakeAction(stageBy.get(sid)?.stage ?? 'none', action, admin),
    );
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error:
            'Take the steps in order. One of these students has not reached that stage yet.',
          blocked,
        },
        { status: 400 },
      );
    }

    // Names, for the message templates.
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', studentIds);
    const nameBy = new Map<string, string>(
      ((users || []) as any[]).map((u) => [u.id, u.name || '']),
    );

    const nextStage = ACTION_STAGE[action];
    const eventAction = ACTION_EVENT[action];

    const results = await Promise.all(
      studentIds.map(async (sid) => {
        // 1) Deliver the message first when this rung sends one, so the event
        //    row can record which channel actually landed.
        let channel: string | null = null;
        if (sendsMessage(action)) {
          const tpl = buildTemplate(action, { name: nameBy.get(sid) || '', reasons });
          const sent = await sendNudge({
            studentIds: [sid],
            subject: tpl.subject,
            plain: tpl.body,
            teamsText: tpl.subject,
            eventType: 'assignment_nudge',
            metadata: { source: 'watchlist', stage: nextStage, action },
          }).catch(() => null);
          channel = sent?.results?.[0]?.channel ?? 'failed';
        }

        // 2) Upsert the ladder row.
        const patch: Record<string, unknown> = {
          classroom_id: classroomId,
          student_id: sid,
          updated_at: now,
        };
        if (nextStage) {
          patch.stage = nextStage;
          patch.stage_set_at = now;
          patch.stage_set_by = staff.id;
          // Coming back onto the ladder clears any snooze: a teacher acting on
          // a student is an explicit decision to stop ignoring them.
          patch.snoozed_until = null;
        }
        if (action === 'snooze') patch.snoozed_until = snoozeUntil;
        if (note) patch.notes = note;
        if (score !== null) patch.last_score = score;
        if (tier !== null) patch.last_tier = tier;

        const { data: upserted } = await supabase
          .from('nexus_student_watchlist')
          .upsert(patch, { onConflict: 'classroom_id,student_id' })
          .select('id')
          .single();

        const watchlistId = upserted?.id || stageBy.get(sid)?.id;
        if (!watchlistId) return { studentId: sid, ok: false, channel };

        // 3) Append the audit event, stamped with the score and tier at the
        //    moment of acting so the trail shows why, not just that.
        await supabase.from('nexus_student_watchlist_events').insert({
          watchlist_id: watchlistId,
          student_id: sid,
          action: eventAction,
          channel,
          message: note || (sendsMessage(action) ? buildTemplate(action, { name: nameBy.get(sid) || '', reasons }).subject : null),
          score_at_action: score,
          tier_at_action: tier,
          performed_by: staff.id,
        });

        return { studentId: sid, ok: true, channel };
      }),
    );

    return NextResponse.json({
      action,
      stage: nextStage,
      results,
      updated: results.filter((r) => r.ok).length,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to record the action');
  }
}
