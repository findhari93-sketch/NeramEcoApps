import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { loadAllClearStudents, type AllClearStudent } from '@/lib/catchup-cohort';
import { sendNudge, plainToHtmlWithLink } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';

/**
 * POST /api/catchup/celebrate   (staff)
 * body { classroomId, mode: 'note'|'mark'|'unmark', studentIds?, message?, celebrationIds? }
 *
 * A teacher's own congratulation for students who have nothing left to catch
 * up on. Recorded in `nexus_catchup_celebrations`, so the All clear list can
 * tell who has already heard it.
 *
 *   note    a personal note, one to one, sent by Neram Assistant with
 *           "From <teacher>" and a "Message <teacher>" button. One 'note' row
 *           per student.
 *   mark    records students as congratulated without sending anything, for a
 *           congratulation that happened outside Nexus.
 *   unmark  undoes a mark. Only 'marked' rows are deleted.
 *
 * The class-group Teams post ('post') was retired in 2026-10. Students are now
 * congratulated automatically and individually as they clear each class (see
 * lib/catchup-congrats.ts), and naming the same students in front of the whole
 * batch every week had become repetitive. Nothing is sent from a teacher's own
 * Teams (founder rule, 2026-09-24).
 *
 * The recipient list is never taken from the browser. `studentIds` narrows the
 * students who are clear right now (re-derived here, from the same rule the
 * teacher's screen renders); it can never widen it.
 */

/** One press cannot become a broadcast to a school. */
const MAX_NAMES = 100;

const DEFAULT_NOTE =
  'Well done, {firstName}. You have caught up on every class you missed. That takes real discipline. Keep it going.';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const { data: staff } = await supabase
      .from('users')
      .select('id, name, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.nudge')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const classroomId: string | null =
      typeof body?.classroomId === 'string' ? body.classroomId : null;
    if (!classroomId) return NextResponse.json({ error: 'Missing classroomId' }, { status: 400 });

    const mode = String(body?.mode || 'note');
    if (mode === 'post') {
      return NextResponse.json(
        { error: 'The class group post was retired. Send a personal note instead.' },
        { status: 410 },
      );
    }
    if (!['note', 'mark', 'unmark'].includes(mode)) {
      return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
    }

    if (mode === 'unmark') {
      const ids: string[] = Array.isArray(body?.celebrationIds)
        ? body.celebrationIds.filter((x: any) => typeof x === 'string')
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Nothing to undo' }, { status: 400 });
      }
      const { data: removed, error: removeError } = await supabase
        .from('nexus_catchup_celebrations')
        .delete()
        .in('id', ids)
        .eq('classroom_id', classroomId)
        .eq('source', 'marked')
        .select('id');
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, removed: (removed || []).length });
    }

    if (mode === 'mark') {
      const named = await deriveNamed(supabase, classroomId, body?.studentIds);
      if (named.length === 0) {
        return NextResponse.json(
          { error: 'None of these students are completely clear right now.' },
          { status: 400 },
        );
      }
      const { data: inserted, error: insertError } = await supabase
        .from('nexus_catchup_celebrations')
        .insert(celebrationRows(named, classroomId, staff.id, 'marked'))
        .select('id');
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        named: named.map(displayName),
        celebrationIds: (inserted || []).map((r: any) => r.id),
      });
    }

    // ── note ────────────────────────────────────────────────────────────────
    const named = await deriveNamed(supabase, classroomId, body?.studentIds);
    if (named.length === 0) {
      return NextResponse.json(
        { error: 'None of these students are completely clear right now.' },
        { status: 400 },
      );
    }

    const text = String(body?.message || '').trim() || DEFAULT_NOTE;
    const url = `${shareBaseUrl(request.nextUrl.origin)}/student/catch-up`;
    const { counts } = await sendNudge({
      // Names the teacher on the Assistant card ("From Hari", "Message Hari").
      // It is still Neram Assistant that sends it.
      teacher: { authHeader: request.headers.get('Authorization'), userId: staff.id },
      studentIds: named.map((s) => s.id),
      subject: 'A note from your teacher',
      plain: text,
      html: plainToHtmlWithLink(text, url, 'Open my catch-up list'),
      teamsText: 'A note from your teacher',
      eventType: 'catchup_note',
      metadata: { sent_by: staff.id, classroom_id: classroomId },
      // The teacher picked these people by hand and can see who they picked.
      respectDormancy: false,
      source: { kind: 'catchup_note', refId: classroomId },
    });

    const { error: recordError } = await supabase
      .from('nexus_catchup_celebrations')
      .insert(celebrationRows(named, classroomId, staff.id, 'note'));
    if (recordError) {
      // Sent, so never an error: pressing again would send it twice.
      console.error('[catchup/celebrate] sent but could not record', recordError);
    }

    return NextResponse.json({
      ok: true,
      named: named.map(displayName),
      counts,
      recorded: !recordError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send the congratulation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function displayName(s: AllClearStudent): string {
  return s.name || s.email || 'Student';
}

/**
 * The students this request may name: whoever is clear right now, narrowed to
 * the ids the teacher selected. An intersection, so the browser can only ever
 * remove people.
 */
async function deriveNamed(
  supabase: any,
  classroomId: string,
  studentIds: unknown,
): Promise<AllClearStudent[]> {
  const allClear = await loadAllClearStudents(supabase, classroomId);
  const narrowTo: Set<string> | null = Array.isArray(studentIds)
    ? new Set(studentIds.filter((x: any): x is string => typeof x === 'string'))
    : null;
  return (narrowTo ? allClear.filter((s) => narrowTo.has(s.id)) : allClear).slice(0, MAX_NAMES);
}

/**
 * One row per student, carrying their standing as it was at this moment. That
 * snapshot is what later tells "already congratulated" from "cleared another
 * class since". See lib/catchup-celebration.ts.
 */
function celebrationRows(
  named: AllClearStudent[],
  classroomId: string,
  celebratedBy: string,
  source: 'marked' | 'note',
) {
  return named.map((s) => ({
    classroom_id: classroomId,
    student_id: s.id,
    celebrated_by: celebratedBy,
    source,
    cleared_total: s.standing.clearedTotal,
    last_cleared_at: s.standing.lastClearedAt,
  }));
}
