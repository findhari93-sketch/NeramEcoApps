// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listAcademicBatches,
  getCurrentBatch,
  createAcademicBatch,
  setCurrentBatch,
  createClassroom,
  updateClassroom,
  getSupabaseAdminClient,
} from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/academic-batches/rollover  ("Start New Session")
 *
 * Repeatable year-end rollover for the one-classroom-per-year model. Runs the
 * SAFE, reversible steps only:
 *   1. Ensure the next exam-year batch exists (academic_batches registry).
 *   2. Create the next-year Nexus classroom (empty; type='common', stamped with
 *      the new code). The unique-active-year index guarantees exactly one.
 *   3. Flip the current batch to the new code, so getCurrentClassroom() and every
 *      enroll chokepoint now resolve to the new classroom.
 *
 * It deliberately does NOT graduate the previous cohort or archive its classroom.
 * Graduation is destructive (revokes Nexus access, flips is_alumni) and stays a
 * separate, explicit action: call POST /api/academic-batches/graduate with the
 * PREVIOUS code, then archive that classroom (PATCH here with
 * { action: 'archive-classroom', code: <prev> }) once the cohort is graduated.
 *
 * Body: { nextCode, adminId, label?, start_date?, end_date?, classroomName?, classroomShortCode? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { nextCode, adminId, label, start_date, end_date, classroomName, classroomShortCode } = body;

    if (!nextCode || !ACADEMIC_YEAR_REGEX.test(nextCode)) {
      return NextResponse.json({ error: 'nextCode must be in YYYY-YY format, e.g. 2027-28.' }, { status: 400 });
    }
    if (adminId && !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const previous = await getCurrentBatch(supabase).catch(() => null);

    // 1. Ensure the next batch exists in the registry (idempotent).
    const existingBatches = await listAcademicBatches(supabase);
    let batch = existingBatches.find((b) => b.code === nextCode) || null;
    if (!batch) {
      batch = await createAcademicBatch(
        { code: nextCode, label: label || null, start_date: start_date || null, end_date: end_date || null, status: 'open' },
        adminId || null
      );
    }

    // 2. Ensure the next-year classroom exists (empty). The unique-active-year
    //    index enforces at most one non-archived classroom per code.
    const { data: existingClassroom } = await supabase
      .from('nexus_classrooms')
      .select('*')
      .eq('academic_year', nextCode)
      .eq('is_archived', false)
      .maybeSingle();

    let classroom = existingClassroom;
    if (!classroom) {
      classroom = await createClassroom(
        {
          name: classroomName || label || `Neram ${nextCode}`,
          type: 'common',
          description: `Current cohort classroom for ${nextCode}`,
          academic_year: nextCode,
          is_archived: false,
          created_by: adminId || undefined,
        },
        supabase
      );
      // short_code + is_active are set separately (createClassroom keeps a small shape).
      if (classroom?.id) {
        await supabase
          .from('nexus_classrooms')
          .update({ is_active: true, short_code: classroomShortCode || null })
          .eq('id', classroom.id);
      }
    }

    // 3. Flip current batch to the new code.
    await setCurrentBatch(nextCode, adminId || null);

    return NextResponse.json({
      success: true,
      previousCode: previous?.code || null,
      batch,
      classroom,
      nextSteps: [
        'Provision a Microsoft Teams team for the new classroom and re-add teachers (Nexus > Classrooms > the new classroom > Create Team).',
        previous?.code
          ? `When the ${previous.code} cohort is done, graduate it (POST /api/academic-batches/graduate with code=${previous.code}), then archive its classroom (PATCH /api/academic-batches/rollover { action: 'archive-classroom', code: '${previous.code}' }).`
          : 'Graduate the previous cohort and archive its classroom when ready.',
      ],
    });
  } catch (error: any) {
    console.error('POST /api/academic-batches/rollover error:', error);
    return NextResponse.json({ error: error.message || 'Failed to start new session' }, { status: 400 });
  }
}

/**
 * PATCH /api/academic-batches/rollover
 * Archive a past-year classroom (year-end lifecycle). Should be run AFTER the
 * cohort has been graduated (graduation deactivates their Nexus enrollments); a
 * warning is returned if the classroom still has active student enrollments.
 * Body: { action: 'archive-classroom', code, adminId?, force? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, code, force } = body;

    if (action !== 'archive-classroom') {
      return NextResponse.json({ error: "Unsupported action. Use action: 'archive-classroom'." }, { status: 400 });
    }
    if (!code || !ACADEMIC_YEAR_REGEX.test(code)) {
      return NextResponse.json({ error: 'code must be in YYYY-YY format.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('id, name, academic_year, is_archived')
      .eq('academic_year', code)
      .eq('is_archived', false)
      .maybeSingle();

    if (!classroom) {
      return NextResponse.json({ error: `No non-archived classroom found for ${code}.` }, { status: 404 });
    }

    // Guard: refuse to archive a classroom that still has active students unless forced.
    const { count: activeStudents } = await supabase
      .from('nexus_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('classroom_id', classroom.id)
      .eq('role', 'student')
      .eq('is_active', true);

    if ((activeStudents || 0) > 0 && !force) {
      return NextResponse.json(
        {
          error: `Classroom "${classroom.name}" still has ${activeStudents} active student(s). Graduate the ${code} cohort first, or pass force:true to archive anyway.`,
          activeStudents,
        },
        { status: 409 }
      );
    }

    const updated = await updateClassroom(classroom.id, { is_archived: true }, supabase);
    return NextResponse.json({ success: true, classroom: updated, archivedActiveStudents: activeStudents || 0 });
  } catch (error: any) {
    console.error('PATCH /api/academic-batches/rollover error:', error);
    return NextResponse.json({ error: error.message || 'Failed to archive classroom' }, { status: 400 });
  }
}
