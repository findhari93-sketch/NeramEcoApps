import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * PATCH /api/students/classification  (manager or admin)
 *
 * Set the two orthogonal classification axes on one or more enrolments:
 *
 *   studyStage           where the student is in their studies. Drives priority.
 *   participationStatus  whether they are still engaging. Drives whether every
 *                        metric and every automated reminder counts them.
 *
 * One route rather than two because both writes land on the SAME
 * (classroom_id, user_id) row, both need the same capability, both need the same
 * classroom scoping, and both need the same audit write. Splitting them would
 * duplicate all four for no gain, and the primary gesture in the UI sets a stage
 * for seventeen students at once.
 *
 * Body: {
 *   classroomId: string,
 *   studentIds: string[],                              // 1..100
 *   studyStage?: '10th'|'11th'|'12th'|'gap_year'|null, // omit = unchanged, null = clear
 *   participationStatus?: 'active'|'dormant',          // omit = unchanged
 *   reason?: string                                    // REQUIRED when going dormant
 * }
 */

const MAX_STUDENTS = 100;
const MAX_REASON = 500;

const VALID_STAGES = ['10th', '11th', '12th', 'gap_year'] as const;
type Stage = (typeof VALID_STAGES)[number];

export async function PATCH(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    // Before any body parsing. Marking a student dormant removes them from
    // attendance %, submission rates, the watchlist and every reminder, so a
    // visiting teacher must not be able to do it. Manager and admin only.
    assertCapability(staff, 'coord.student.classify');

    const body = await request.json();
    const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : '';
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? Array.from(new Set(body.studentIds.filter((x: any) => typeof x === 'string' && x)))
      : [];
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '';

    const hasStage = Object.prototype.hasOwnProperty.call(body, 'studyStage');
    const hasParticipation = Object.prototype.hasOwnProperty.call(body, 'participationStatus');
    const studyStage: Stage | null = hasStage ? (body.studyStage ?? null) : null;
    const participationStatus: string | null = hasParticipation
      ? body.participationStatus
      : null;

    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }
    if (!studentIds.length) {
      return NextResponse.json({ error: 'No students selected' }, { status: 400 });
    }
    if (studentIds.length > MAX_STUDENTS) {
      return NextResponse.json(
        { error: `Too many at once. Send at most ${MAX_STUDENTS} per request.` },
        { status: 400 },
      );
    }
    if (!hasStage && !hasParticipation) {
      return NextResponse.json(
        { error: 'Nothing to change: send studyStage, participationStatus, or both.' },
        { status: 400 },
      );
    }
    if (hasStage && studyStage !== null && !VALID_STAGES.includes(studyStage)) {
      return NextResponse.json({ error: 'Unknown study stage' }, { status: 400 });
    }
    if (
      hasParticipation &&
      participationStatus !== 'active' &&
      participationStatus !== 'dormant'
    ) {
      return NextResponse.json({ error: 'Unknown participation status' }, { status: 400 });
    }
    // Making a student invisible to every metric without saying why is exactly
    // what this refusal prevents. The reason ends up in the audit trail and on
    // the dormant chip's tooltip.
    if (hasParticipation && participationStatus === 'dormant' && !reason) {
      return NextResponse.json(
        { error: 'A reason is required when marking a student dormant.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;

    // Read the current values first: they become `previous` in the response,
    // which is what powers Undo, and from_value in the audit rows.
    //
    // This is also the security boundary. The route accepts client-supplied ids,
    // so scoping the read AND the write to (classroom, role=student, is_active)
    // is what stops a caller touching an enrolment in someone else's classroom.
    const { data: existing, error: readError } = await supabase
      .from('nexus_enrollments')
      .select('id, user_id, current_standard, current_standard_source, participation_status')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .in('user_id', studentIds);

    if (readError) throw readError;

    const rows = (existing || []) as any[];
    const found = new Set(rows.map((r) => r.user_id));
    const skipped = studentIds
      .filter((id) => !found.has(id))
      .map((studentId) => ({
        studentId,
        reason: 'Not an active student enrolment in this classroom',
      }));

    if (!rows.length) {
      return NextResponse.json({ updated: 0, skipped, students: [] });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};

    if (hasStage) {
      patch.current_standard = studyStage;
      // Clearing a stage clears its provenance too: "set by nobody, on no date"
      // is the honest record for a value that no longer exists.
      patch.current_standard_source = studyStage === null ? null : 'staff';
      patch.current_standard_set_at = studyStage === null ? null : now;
      patch.current_standard_set_by = studyStage === null ? null : staff.id;
    }

    if (hasParticipation) {
      patch.participation_status = participationStatus;
      if (participationStatus === 'dormant') {
        patch.dormant_since = now;
        patch.dormant_by = staff.id;
        patch.dormant_reason = reason;
      } else {
        // Returning is a fresh start. A stale dormant_since would corrupt "how
        // long were they away" the next time they pause; the history that
        // answers that lives in the events table.
        patch.dormant_since = null;
        patch.dormant_by = null;
        patch.dormant_reason = null;
      }
    }

    const targetIds = rows.map((r) => r.user_id);

    const { data: updatedRows, error: writeError } = await supabase
      .from('nexus_enrollments')
      .update(patch)
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .in('user_id', targetIds)
      .select(
        'id, user_id, current_standard, current_standard_source, participation_status, dormant_since, dormant_reason',
      );

    if (writeError) throw writeError;

    // Audit: one row per CHANGED axis, so a no-op write leaves no noise and the
    // trail reads as a list of real decisions.
    const before = new Map(rows.map((r) => [r.user_id, r]));
    const events: Record<string, unknown>[] = [];

    for (const row of rows) {
      if (hasStage && (row.current_standard ?? null) !== studyStage) {
        events.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: row.user_id,
          axis: 'study_stage',
          from_value: row.current_standard ?? null,
          to_value: studyStage,
          reason: reason || null,
          performed_by: staff.id,
        });
      }
      const wasParticipation = row.participation_status ?? 'active';
      if (hasParticipation && wasParticipation !== participationStatus) {
        events.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: row.user_id,
          axis: 'participation',
          from_value: wasParticipation,
          to_value: participationStatus,
          reason: reason || null,
          performed_by: staff.id,
        });
      }
    }

    if (events.length) {
      // Never let a failed audit insert roll back a successful classification:
      // the user was told it worked, and it did. Log loudly instead.
      const { error: auditError } = await supabase
        .from('nexus_enrollment_classification_events')
        .insert(events);
      if (auditError) console.error('Classification audit insert failed:', auditError);
    }

    const students = ((updatedRows || []) as any[]).map((row) => {
      const prev = before.get(row.user_id);
      return {
        id: row.user_id,
        study_stage: row.current_standard ?? null,
        study_stage_source: row.current_standard_source ?? null,
        participation_status: row.participation_status ?? 'active',
        dormant_since: row.dormant_since ?? null,
        dormant_reason: row.dormant_reason ?? null,
        // What Undo sends back. Only the axes this request actually touched,
        // so undoing a stage change cannot accidentally reactivate someone.
        previous: {
          ...(hasStage ? { study_stage: prev?.current_standard ?? null } : {}),
          ...(hasParticipation
            ? { participation_status: prev?.participation_status ?? 'active' }
            : {}),
        },
      };
    });

    return NextResponse.json({
      updated: students.length,
      changed: events.length,
      skipped,
      students,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to update student classification');
  }
}
