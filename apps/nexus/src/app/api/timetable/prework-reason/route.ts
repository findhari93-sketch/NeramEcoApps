import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { isPreworkReasonCode, preworkReasonRequiresNote } from '@/lib/prework-reasons';
import { classEndIso } from '@/lib/prework';

/**
 * POST /api/timetable/prework-reason
 *
 * A student saying why they have not done the work set before a class.
 *
 * This is the whole point of pre-class work. Most students who have not done it
 * will give a reason rather than finish it, and that is fine: a reason three
 * hours before the class is something the teacher can act on IN the class, which
 * a blank submission list never is.
 *
 * This route still touches nothing. It records the reason for ONE assignment and
 * that is all it does.
 *
 * The class prep gate, which does withhold the join URL, has its own reason
 * endpoint at /api/student/class-prep/[classId]/reason, because a gate is per
 * class while this table is per assignment: nexus_prework_reasons.assignment_id
 * is NOT NULL, so the test half of the gate has nothing to hang a reason on here.
 * The two share the same reason VOCABULARY so a teacher's tally stays one set of
 * words.
 *
 * Body: { assignment_id, reason_code, note?, started? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const assignmentId = String(body?.assignment_id || '').trim();
    const reasonCode = body?.reason_code;
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    const started = body?.started === true;

    if (!assignmentId) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: assignment } = await supabase
      .from('nexus_class_assignments')
      .select('id, classroom_id, scheduled_class_id, status, timing, due_at')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    if (assignment.status !== 'published' || assignment.timing !== 'prework') {
      return NextResponse.json({ error: 'That work is not pre-class work.' }, { status: 400 });
    }

    // Enrollment, not staffness: this is the student's own row.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', assignment.classroom_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment || enrollment.role !== 'student') {
      return NextResponse.json({ error: 'You are not enrolled in this class.' }, { status: 403 });
    }

    if (!isPreworkReasonCode(reasonCode)) {
      return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
    }
    if (preworkReasonRequiresNote(reasonCode) && !note) {
      return NextResponse.json({ error: 'Add a short note so your teacher knows.' }, { status: 400 });
    }

    // Once the class has finished, the answer the teacher acted on is locked.
    // Rewriting it afterwards would let a student change the record of a
    // conversation that has already happened.
    let classEndMs = NaN;
    if (assignment.scheduled_class_id) {
      const { data: cls } = await supabase
        .from('nexus_scheduled_classes')
        .select('scheduled_date, end_time, status')
        .eq('id', assignment.scheduled_class_id)
        .maybeSingle();
      if (cls) {
        if (cls.status === 'cancelled') {
          return NextResponse.json({ error: 'That class was cancelled.' }, { status: 409 });
        }
        classEndMs = Date.parse(classEndIso(cls.scheduled_date, cls.end_time || '23:59'));
      }
    }
    if (!Number.isNaN(classEndMs) && Date.now() > classEndMs) {
      return NextResponse.json(
        { error: 'That class has finished. Your teacher will follow up.' },
        { status: 409 },
      );
    }

    // Whether they answered in time is stored, not derived: due_at moves when the
    // class moves, and an answer given in time must not become "late" later.
    const dueMs = assignment.due_at ? Date.parse(assignment.due_at) : NaN;
    const answeredBeforeClass = Number.isNaN(dueMs) ? true : Date.now() < dueMs;

    const { data: saved, error } = await supabase
      .from('nexus_prework_reasons')
      .upsert(
        {
          assignment_id: assignment.id,
          student_id: user.id,
          classroom_id: assignment.classroom_id,
          scheduled_class_id: assignment.scheduled_class_id,
          reason_code: reasonCode,
          reason_note: note || null,
          started,
          reason_submitted_at: new Date().toISOString(),
          answered_before_class: answeredBeforeClass,
        },
        { onConflict: 'assignment_id,student_id' },
      )
      .select('reason_code, reason_note, started, reason_submitted_at, answered_before_class')
      .single();

    if (error) throw error;

    return NextResponse.json({ reason: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save your reason';
    console.error('Prework reason error:', message);
    return NextResponse.json({ error: 'Could not save your reason. Please try again.' }, { status: 500 });
  }
}
