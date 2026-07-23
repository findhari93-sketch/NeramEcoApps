import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { isRsvpReasonCode } from '@/lib/rsvp-reasons';

/**
 * Catching up on a class you missed.
 *
 * The student's half of the absence loop: say why you missed it, watch the
 * recording, finish the work, and say you are done. Everything here is scoped
 * to the calling student's own absence row, so there is nothing to authorise
 * beyond "is this yours".
 *
 * "Caught up" is only ever set by the student pressing the button. A heuristic
 * that decided for them would be wrong in both directions: it would mark
 * someone done who skimmed the video, and leave someone open who learned the
 * material from a friend.
 */

interface Ctx {
  params: { classId: string };
}

async function resolveStudent(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msOid).single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, title, description, scheduled_date, start_time, end_time, recording_url, youtube_url')
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  return { userId: user.id as string, cls };
}

/**
 * GET /api/timetable/[classId]/catch-up
 *
 * The checklist: what is still outstanding, and what is available to do it with.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStudent(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    const [{ data: absence }, { data: assignments }, { data: recap }] = await Promise.all([
      supabase
        .from('nexus_class_absences')
        .select('*')
        .eq('scheduled_class_id', params.classId)
        .eq('student_id', access.userId)
        .maybeSingle(),
      supabase
        .from('nexus_class_assignments')
        .select('id, title, assignment_type, due_at, max_marks')
        .eq('scheduled_class_id', params.classId)
        .eq('status', 'published'),
      // A guided recap is the gated way to watch: checkpoints and a quiz. When
      // one exists it is a better answer than a bare video link.
      supabase
        .from('nexus_class_recaps')
        .select('id, status')
        .eq('scheduled_class_id', params.classId)
        .eq('status', 'published')
        .maybeSingle(),
    ]);

    // Completion is derived, never stored twice: documents land in
    // nexus_assignment_submissions, drawings in drawing_submissions.
    const assignmentIds = (assignments || []).map((a: any) => a.id);
    const done = new Set<string>();
    if (assignmentIds.length > 0) {
      const [{ data: docs }, { data: draws }] = await Promise.all([
        supabase
          .from('nexus_assignment_submissions')
          .select('assignment_id')
          .eq('student_id', access.userId)
          .in('assignment_id', assignmentIds),
        supabase
          .from('drawing_submissions')
          .select('assignment_id')
          .eq('student_id', access.userId)
          .in('assignment_id', assignmentIds),
      ]);
      for (const r of [...(docs || []), ...(draws || [])]) done.add(r.assignment_id);
    }

    const work = (assignments || []).map((a: any) => ({ ...a, submitted: done.has(a.id) }));

    return NextResponse.json({
      class: access.cls,
      absence: absence || null,
      assignments: work,
      recap: recap || null,
      steps: {
        reasonGiven: !!absence?.reason_code,
        watched: !!absence?.recording_watched_at,
        workDone: work.length === 0 || work.every((a: any) => a.submitted),
        caughtUp: !!absence?.caught_up_at,
      },
      hasRecording: !!(access.cls.recording_url || access.cls.youtube_url) || !!recap,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the catch-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/[classId]/catch-up
 * body { action: 'give_reason', reason_code, reason_note? }
 * body { action: 'mark_watched' }
 * body { action: 'mark_caught_up' }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStudent(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    const { data: absence } = await supabase
      .from('nexus_class_absences')
      .select('*')
      .eq('scheduled_class_id', params.classId)
      .eq('student_id', access.userId)
      .maybeSingle();

    if (!absence) {
      return NextResponse.json(
        { error: 'You are not marked absent for this class.' },
        { status: 404 },
      );
    }

    const patch: Record<string, unknown> = {};

    switch (body.action) {
      case 'give_reason': {
        if (!isRsvpReasonCode(body.reason_code)) {
          return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
        }
        const note = typeof body.reason_note === 'string' ? body.reason_note.trim() : '';
        if (body.reason_code === 'other' && !note) {
          return NextResponse.json(
            { error: 'Tell us briefly what happened.' },
            { status: 400 },
          );
        }
        patch.reason_code = body.reason_code;
        patch.reason_note = note || null;
        patch.reason_submitted_at = new Date().toISOString();
        break;
      }

      case 'mark_watched': {
        // Idempotent: re-watching should not move the first-watched timestamp.
        if (!absence.recording_watched_at) {
          patch.recording_watched_at = new Date().toISOString();
        }
        break;
      }

      case 'mark_caught_up': {
        // The gate. Enforced here and not only in the UI, because a disabled
        // button is a suggestion, not a rule.
        if (!absence.recording_watched_at) {
          return NextResponse.json(
            { error: 'Watch the recording first.' },
            { status: 400 },
          );
        }
        const { data: work } = await supabase
          .from('nexus_class_assignments')
          .select('id')
          .eq('scheduled_class_id', params.classId)
          .eq('status', 'published');

        const ids = (work || []).map((w: any) => w.id);
        if (ids.length > 0) {
          const [{ data: docs }, { data: draws }] = await Promise.all([
            supabase
              .from('nexus_assignment_submissions')
              .select('assignment_id')
              .eq('student_id', access.userId)
              .in('assignment_id', ids),
            supabase
              .from('drawing_submissions')
              .select('assignment_id')
              .eq('student_id', access.userId)
              .in('assignment_id', ids),
          ]);
          const done = new Set([...(docs || []), ...(draws || [])].map((r: any) => r.assignment_id));
          if (done.size < ids.length) {
            return NextResponse.json(
              { error: 'Finish the assignment from this class first.' },
              { status: 400 },
            );
          }
        }
        patch.caught_up_at = new Date().toISOString();
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('nexus_class_absences')
        .update(patch)
        .eq('id', absence.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, absence: { ...absence, ...patch } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
