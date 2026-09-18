import { NextRequest, NextResponse } from 'next/server';
import {
  ACADEMIC_YEAR_REGEX,
  examYearFromAcademicYear,
  getCurrentBatch,
  getSupabaseAdminClient,
  recordUserHistory,
  startYearOf,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { isKnowsTamilValue, languageAuditValue } from '@/lib/student-language';

/**
 * PATCH /api/students/classification
 *
 * Set the classification fields on one or more students:
 *
 *   studyStage           where the student is in their studies. Drives priority.
 *   academicYear         the exam-year cohort. Drives which exam they sit.
 *   knowsTamil           whether they can follow a class taught in Tamil
 *                        (users.knows_tamil). Drives the த avatar badge.
 *   participationStatus  whether they are still engaging. Drives whether every
 *                        metric and every automated reminder counts them.
 *
 * Two capabilities, not one. `coord.student.stage` covers the first three, because
 * they are data entry a teacher does after speaking to a student and a wrong
 * value is visible and self-correcting. `coord.student.dormancy` covers the
 * third, because marking someone dormant removes them from attendance %,
 * submission rates, prep readiness, the watchlist and every reminder with nothing
 * on screen turning red. Still one route: the classroom scoping, the audit write
 * and the Undo payload are identical, and the UI puts them on one screen.
 *
 * studyStage and academicYear are INDEPENDENT. Nothing here derives one from the
 * other, because a repeater or an early attempt is legitimate. The app flags a
 * pair that disagrees and lets staff decide.
 *
 * Two body shapes, mutually exclusive:
 *
 *   Uniform, one value for many students (the bulk-fix gesture):
 *     { classroomId, studentIds: string[],                 // 1..100
 *       studyStage?: '10th'|'11th'|'12th'|'gap_year'|null, // omit = unchanged, null = clear
 *       academicYear?: 'YYYY-YY'|null,                     // omit = unchanged, null = clear
 *       knowsTamil?: true|false|null,                      // omit = unchanged, null = clear
 *       participationStatus?: 'active'|'dormant',          // omit = unchanged
 *       reason?: string }                                  // REQUIRED going dormant
 *
 *   Per student, different values each (the application-form prefill review):
 *     { classroomId, assignments: [{ studentId, studyStage?, academicYear?, knowsTamil? }] }
 *
 * knowsTamil is on the per-student shape because Undo needs it: a bulk "Knows
 * Tamil" over students who held different values can only be reverted per student.
 *
 * The per-student shape deliberately cannot set participationStatus: bulk
 * dormancy is always one decision applied uniformly, and allowing it here would
 * let a prefill review quietly hide people.
 */

const MAX_STUDENTS = 100;
const MAX_REASON = 500;

const VALID_STAGES = ['10th', '11th', '12th', 'gap_year'] as const;
type Stage = (typeof VALID_STAGES)[number];

/** One student's requested edit, normalised from either body shape. */
interface Change {
  studentId: string;
  hasStage: boolean;
  stage: Stage | null;
  hasYear: boolean;
  academicYear: string | null;
  hasLanguage: boolean;
  /** The raw body value until validated, so a bad value is refused, not coerced. */
  knowsTamil: unknown;
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  try {
    // Authentication first, always. Authorisation has to wait until we know which
    // fields the body touches, because the two axes need different capabilities.
    const staff = await getRequestUser(request.headers.get('Authorization'));

    const body = await request.json();
    const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '';

    if (!classroomId) return bad('classroomId is required');

    const usesAssignments = Array.isArray(body?.assignments);
    const usesFlat =
      Array.isArray(body?.studentIds) ||
      Object.prototype.hasOwnProperty.call(body ?? {}, 'studyStage') ||
      Object.prototype.hasOwnProperty.call(body ?? {}, 'academicYear') ||
      Object.prototype.hasOwnProperty.call(body ?? {}, 'knowsTamil') ||
      Object.prototype.hasOwnProperty.call(body ?? {}, 'participationStatus');

    if (usesAssignments && usesFlat) {
      return bad(
        'Send either assignments (per student) or studentIds with values (uniform), not both.',
      );
    }

    const hasParticipation = Object.prototype.hasOwnProperty.call(body ?? {}, 'participationStatus');
    const participationStatus: string | null = hasParticipation ? body.participationStatus : null;

    // ── Normalise both shapes into one list ──────────────────────────────────
    const changes: Change[] = [];

    if (usesAssignments) {
      if (hasParticipation) {
        return bad('participationStatus cannot be set per student. Send it with studentIds.');
      }
      const raw = body.assignments as unknown[];
      if (!raw.length) return bad('No students selected');
      if (raw.length > MAX_STUDENTS) {
        return bad(`Too many at once. Send at most ${MAX_STUDENTS} per request.`);
      }
      const seen = new Set<string>();
      for (const item of raw) {
        const entry = item as Record<string, unknown>;
        const studentId = typeof entry?.studentId === 'string' ? entry.studentId : '';
        if (!studentId) return bad('Every assignment needs a studentId.');
        // A duplicate id with conflicting values has no defined outcome, so say so
        // rather than silently letting one of them win.
        if (seen.has(studentId)) return bad(`Duplicate studentId in assignments: ${studentId}`);
        seen.add(studentId);

        const hasStage = Object.prototype.hasOwnProperty.call(entry, 'studyStage');
        const hasYear = Object.prototype.hasOwnProperty.call(entry, 'academicYear');
        const hasLanguage = Object.prototype.hasOwnProperty.call(entry, 'knowsTamil');
        if (!hasStage && !hasYear && !hasLanguage) {
          return bad(
            `Nothing to change for ${studentId}: send studyStage, academicYear, knowsTamil, or a combination.`,
          );
        }
        changes.push({
          studentId,
          hasStage,
          stage: hasStage ? ((entry.studyStage ?? null) as Stage | null) : null,
          hasYear,
          academicYear: hasYear ? ((entry.academicYear ?? null) as string | null) : null,
          hasLanguage,
          knowsTamil: hasLanguage ? entry.knowsTamil : null,
        });
      }
    } else {
      const studentIds: string[] = Array.isArray(body?.studentIds)
        ? Array.from(new Set(body.studentIds.filter((x: any) => typeof x === 'string' && x)))
        : [];
      if (!studentIds.length) return bad('No students selected');
      if (studentIds.length > MAX_STUDENTS) {
        return bad(`Too many at once. Send at most ${MAX_STUDENTS} per request.`);
      }

      const hasStage = Object.prototype.hasOwnProperty.call(body, 'studyStage');
      const hasYear = Object.prototype.hasOwnProperty.call(body, 'academicYear');
      const hasLanguage = Object.prototype.hasOwnProperty.call(body, 'knowsTamil');
      if (!hasStage && !hasYear && !hasLanguage && !hasParticipation) {
        return bad(
          'Nothing to change: send studyStage, academicYear, knowsTamil, participationStatus, or a combination.',
        );
      }
      for (const studentId of studentIds) {
        changes.push({
          studentId,
          hasStage,
          stage: hasStage ? ((body.studyStage ?? null) as Stage | null) : null,
          hasYear,
          academicYear: hasYear ? ((body.academicYear ?? null) as string | null) : null,
          hasLanguage,
          knowsTamil: hasLanguage ? body.knowsTamil : null,
        });
      }
    }

    const touchesStage = changes.some((c) => c.hasStage);
    const touchesYear = changes.some((c) => c.hasYear);
    const touchesLanguage = changes.some((c) => c.hasLanguage);

    // ── Authorisation, per axis, before any database access ─────────────────
    // Language is data entry of the same kind as a class: a teacher learns it by
    // talking to the student, and a wrong value is visible and self-correcting.
    if (touchesStage || touchesYear || touchesLanguage) {
      assertCapability(staff, 'coord.student.stage');
    }
    if (hasParticipation) assertCapability(staff, 'coord.student.dormancy');

    // ── Value validation ────────────────────────────────────────────────────
    for (const change of changes) {
      if (change.hasStage && change.stage !== null && !VALID_STAGES.includes(change.stage)) {
        return bad('Unknown study stage');
      }
      if (
        change.hasYear &&
        change.academicYear !== null &&
        !ACADEMIC_YEAR_REGEX.test(change.academicYear)
      ) {
        return bad('academicYear must be in YYYY-YY format, e.g. 2027-28');
      }
      // Validated raw: 'yes', 'true' or 1 must be refused, not read as Knows Tamil.
      if (change.hasLanguage && !isKnowsTamilValue(change.knowsTamil)) {
        return bad('knowsTamil must be true, false or null');
      }
    }

    if (hasParticipation && participationStatus !== 'active' && participationStatus !== 'dormant') {
      return bad('Unknown participation status');
    }
    // Making a student invisible to every metric without saying why is exactly
    // what this refusal prevents. The reason ends up in the audit trail and on
    // the dormant chip's tooltip.
    if (hasParticipation && participationStatus === 'dormant' && !reason) {
      return bad('A reason is required when marking a student dormant.');
    }

    // A cohort earlier than the current one hides the student from the default
    // "Current + upcoming" view, which looks like they vanished. Graduating is the
    // intended way to retire a finished batch, and it revokes access properly.
    const currentCode = (await getCurrentBatch())?.code ?? null;
    const currentStart = startYearOf(currentCode);
    if (touchesYear && currentStart !== null) {
      for (const change of changes) {
        const start = startYearOf(change.academicYear);
        if (start !== null && start < currentStart) {
          return bad(
            `${change.academicYear} is before the current batch (${currentCode}), which would hide the student from the default view. Use Graduate Batch if their course is finished.`,
          );
        }
      }
    }

    const supabase = getSupabaseAdminClient() as any;
    const requestedIds = changes.map((c) => c.studentId);

    // Read the current values first: they become `previous` in the response, which
    // is what powers Undo, and from_value in the audit rows.
    //
    // This is also the security boundary. The route accepts client-supplied ids,
    // so scoping to (classroom, role=student, is_active) is what stops a caller
    // touching an enrolment in someone else's classroom. It matters even more for
    // the academicYear axis, whose effect is global: only ids that survive THIS
    // read are ever passed to the users update below.
    const { data: existing, error: readError } = await supabase
      .from('nexus_enrollments')
      .select(
        'id, user_id, current_standard, current_standard_source, participation_status, dormant_since, dormant_reason, dormant_source',
      )
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .in('user_id', requestedIds);

    if (readError) throw readError;

    const rows = (existing || []) as any[];
    const found = new Set<string>(rows.map((r) => r.user_id));
    const skipped = requestedIds
      .filter((id) => !found.has(id))
      .map((studentId) => ({
        studentId,
        reason: 'Not an active student enrolment in this classroom',
      }));

    if (!rows.length) {
      return NextResponse.json({ updated: 0, changed: 0, skipped, students: [] });
    }

    const applicable = changes.filter((c) => found.has(c.studentId));
    const enrollmentByUser = new Map<string, any>(rows.map((r) => [r.user_id, r]));

    // Prior per-user values (exam year, language), read only for the axes in play.
    // The column list follows the axes too, so a year-only edit never names
    // knows_tamil and keeps working on a database that has not been migrated yet.
    const yearBefore = new Map<string, string | null>();
    const languageBefore = new Map<string, boolean | null>();
    if (touchesYear || touchesLanguage) {
      const columns = [
        'id',
        touchesYear ? 'academic_year' : null,
        touchesLanguage ? 'knows_tamil' : null,
      ]
        .filter(Boolean)
        .join(', ');
      const { data: users, error: userReadError } = await supabase
        .from('users')
        .select(columns)
        .in('id', Array.from(found));
      if (userReadError) throw userReadError;
      for (const user of (users || []) as any[]) {
        if (touchesYear) yearBefore.set(user.id, user.academic_year ?? null);
        if (touchesLanguage) {
          languageBefore.set(user.id, typeof user.knows_tamil === 'boolean' ? user.knows_tamil : null);
        }
      }
    }

    const now = new Date().toISOString();

    // ── Write the enrolment axes ────────────────────────────────────────────
    // Grouped by identical patch so the uniform shape stays a single UPDATE and
    // the per-student shape costs one UPDATE per distinct stage (at most four).
    const enrollmentGroups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();

    for (const change of applicable) {
      if (!change.hasStage && !hasParticipation) continue;
      const key = `${change.hasStage ? String(change.stage) : '-'}`;
      let group = enrollmentGroups.get(key);
      if (!group) {
        const patch: Record<string, unknown> = {};
        if (change.hasStage) {
          patch.current_standard = change.stage;
          // Clearing a stage clears its provenance too: "set by nobody, on no
          // date" is the honest record for a value that no longer exists.
          patch.current_standard_source = change.stage === null ? null : 'staff';
          patch.current_standard_set_at = change.stage === null ? null : now;
          patch.current_standard_set_by = change.stage === null ? null : staff.id;
        }
        if (hasParticipation) {
          patch.participation_status = participationStatus;
          if (participationStatus === 'dormant') {
            patch.dormant_since = now;
            patch.dormant_by = staff.id;
            patch.dormant_reason = reason;
            // Anything a person decides is a staff pause, including "Pause with a
            // reason" on a Not started student: from here only staff bring them back,
            // and entering Nexus no longer lifts them (lib/not-started.ts).
            patch.dormant_source = 'staff';
          } else {
            // Returning is a fresh start. A stale dormant_since would corrupt
            // "how long were they away" the next time they pause; the history
            // that answers that lives in the events table.
            patch.dormant_since = null;
            patch.dormant_by = null;
            patch.dormant_reason = null;
            patch.dormant_source = null;
          }
        }
        group = { patch, ids: [] };
        enrollmentGroups.set(key, group);
      }
      group.ids.push(change.studentId);
    }

    for (const group of enrollmentGroups.values()) {
      const { error: writeError } = await supabase
        .from('nexus_enrollments')
        .update(group.patch)
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .eq('is_active', true)
        .in('user_id', group.ids);
      if (writeError) throw writeError;
    }

    // ── Write the exam year ─────────────────────────────────────────────────
    // users.academic_year is per-USER and global: it is visible in the admin CRM
    // and narrows every exam-year filter across the ecosystem. Only ids that
    // passed the classroom-scoped read above reach this loop.
    const yearGroups = new Map<string, string[]>();
    for (const change of applicable) {
      if (!change.hasYear) continue;
      const key = change.academicYear ?? '';
      const ids = yearGroups.get(key) ?? [];
      ids.push(change.studentId);
      yearGroups.set(key, ids);
    }

    for (const [key, ids] of yearGroups) {
      const value = key === '' ? null : key;
      // Skip the students already on this year: a no-op UPDATE would still bump
      // updated_at and write a history row saying nothing changed.
      const toWrite = ids.filter((id) => (yearBefore.get(id) ?? null) !== value);
      if (!toWrite.length) continue;

      const { error: yearError } = await supabase
        .from('users')
        .update({ academic_year: value, updated_at: now })
        .in('id', toWrite);
      if (yearError) throw yearError;

      // Keep the admin CRM's history timeline honest: a cohort that changed in
      // Nexus must not look like it changed by itself. recordUserHistory swallows
      // its own errors, so this never blocks the write it describes.
      for (const id of toWrite) {
        await recordUserHistory(
          supabase,
          id,
          'academic_year',
          yearBefore.get(id) ?? null,
          value,
          staff.id,
        );
      }

      // Batch and target exam year are one concept, so keep the mirror in step
      // (2027-28 -> 2028), matching what the admin route does. Best effort: a
      // failure here must not fail the classification.
      try {
        await supabase
          .from('lead_profiles')
          .update({ target_exam_year: value === null ? null : examYearFromAcademicYear(value) })
          .in('user_id', toWrite);
      } catch {
        /* non-blocking */
      }
    }

    // ── Write the language ──────────────────────────────────────────────────
    // users.knows_tamil is per-USER and global, like the exam year, and guarded
    // the same way: only ids that passed the classroom-scoped read reach here.
    const languageGroups = new Map<string, { value: boolean | null; ids: string[] }>();
    for (const change of applicable) {
      if (!change.hasLanguage) continue;
      const value = change.knowsTamil as boolean | null;
      const group = languageGroups.get(String(value)) ?? { value, ids: [] };
      group.ids.push(change.studentId);
      languageGroups.set(String(value), group);
    }

    for (const { value, ids } of languageGroups.values()) {
      // A no-op UPDATE would still bump updated_at and write a history row.
      const toWrite = ids.filter((id) => (languageBefore.get(id) ?? null) !== value);
      if (!toWrite.length) continue;

      const { error: languageError } = await supabase
        .from('users')
        .update({ knows_tamil: value, updated_at: now })
        .in('id', toWrite);
      if (languageError) throw languageError;

      for (const id of toWrite) {
        await recordUserHistory(
          supabase,
          id,
          'knows_tamil',
          languageBefore.get(id) ?? null,
          value,
          staff.id,
        );
      }
    }

    // ── Audit: one row per CHANGED field ────────────────────────────────────
    // A no-op write leaves no noise, so the trail reads as a list of real
    // decisions rather than a list of times someone opened the sheet.
    const events: Record<string, unknown>[] = [];
    // Kept apart and inserted on their own: if the 'language' axis CHECK has not
    // reached this database yet, only these rows are lost, not the stage and year
    // rows the same request wrote.
    const languageEvents: Record<string, unknown>[] = [];

    for (const change of applicable) {
      const row = enrollmentByUser.get(change.studentId);
      if (!row) continue;

      if (change.hasStage && (row.current_standard ?? null) !== change.stage) {
        events.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: change.studentId,
          axis: 'study_stage',
          from_value: row.current_standard ?? null,
          to_value: change.stage,
          reason: reason || null,
          performed_by: staff.id,
        });
      }

      if (change.hasYear && (yearBefore.get(change.studentId) ?? null) !== change.academicYear) {
        events.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: change.studentId,
          axis: 'academic_year',
          from_value: yearBefore.get(change.studentId) ?? null,
          to_value: change.academicYear,
          reason: reason || null,
          performed_by: staff.id,
        });
      }

      if (
        change.hasLanguage &&
        (languageBefore.get(change.studentId) ?? null) !== (change.knowsTamil as boolean | null)
      ) {
        languageEvents.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: change.studentId,
          axis: 'language',
          from_value: languageAuditValue(languageBefore.get(change.studentId) ?? null),
          to_value: languageAuditValue(change.knowsTamil as boolean | null),
          reason: reason || null,
          performed_by: staff.id,
        });
      }

      // A Not started student is already 'dormant', so "Pause with a reason" does
      // not change the status column. It is still a decision somebody made, so the
      // audit reads it as not_started -> dormant rather than recording nothing.
      const wasNotStarted = row.participation_status === 'dormant' && row.dormant_source === 'auto';
      const wasParticipation = wasNotStarted ? 'not_started' : (row.participation_status ?? 'active');
      if (hasParticipation && wasParticipation !== participationStatus) {
        events.push({
          enrollment_id: row.id,
          classroom_id: classroomId,
          student_id: change.studentId,
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

    if (languageEvents.length) {
      const { error: languageAuditError } = await supabase
        .from('nexus_enrollment_classification_events')
        .insert(languageEvents);
      if (languageAuditError) {
        console.error('Classification language audit insert failed:', languageAuditError);
      }
    }

    // ── Response ────────────────────────────────────────────────────────────
    const students = applicable.map((change) => {
      const row = enrollmentByUser.get(change.studentId);
      const nextStage = change.hasStage ? change.stage : (row?.current_standard ?? null);
      const nextYear = change.hasYear
        ? change.academicYear
        : (yearBefore.get(change.studentId) ?? null);

      return {
        id: change.studentId,
        study_stage: nextStage,
        study_stage_source: change.hasStage
          ? change.stage === null
            ? null
            : 'staff'
          : (row?.current_standard_source ?? null),
        academic_year: nextYear,
        // Only reported when this request read it; otherwise the key is omitted.
        ...(touchesLanguage
          ? {
              knows_tamil: change.hasLanguage
                ? (change.knowsTamil as boolean | null)
                : (languageBefore.get(change.studentId) ?? null),
            }
          : {}),
        participation_status: hasParticipation
          ? participationStatus
          : (row?.participation_status ?? 'active'),
        dormant_since: hasParticipation
          ? participationStatus === 'dormant'
            ? now
            : null
          : (row?.dormant_since ?? null),
        dormant_reason: hasParticipation
          ? participationStatus === 'dormant'
            ? reason
            : null
          : (row?.dormant_reason ?? null),
        dormant_source: hasParticipation
          ? participationStatus === 'dormant'
            ? 'staff'
            : null
          : (row?.dormant_source ?? null),
        // What Undo sends back. Only the fields this request actually touched, so
        // undoing a stage change cannot accidentally reactivate someone or move
        // their exam year.
        previous: {
          ...(change.hasStage ? { study_stage: row?.current_standard ?? null } : {}),
          ...(change.hasYear
            ? { academic_year: yearBefore.get(change.studentId) ?? null }
            : {}),
          ...(change.hasLanguage
            ? { knows_tamil: languageBefore.get(change.studentId) ?? null }
            : {}),
          ...(hasParticipation
            ? { participation_status: row?.participation_status ?? 'active' }
            : {}),
        },
      };
    });

    return NextResponse.json({
      updated: students.length,
      changed: events.length + languageEvents.length,
      skipped,
      students,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to update student classification');
  }
}
