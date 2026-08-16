/**
 * Fixtures for the exam eligibility E2E spec.
 *
 * Deliberately NOT createTestAdminClient() from ./supabase.ts: that helper
 * reads SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_KEY, which nothing in this
 * repo actually sets, and falls back to a local Supabase instance nobody has
 * running against this dev setup. Local Nexus dev points at the STAGING
 * project (apps/nexus/.env.local), and playwright.config.ts already loads
 * that file for exactly this reason ("seed their own fixtures need them") --
 * so this uses the real @neram/database admin client instead, which reads
 * the same NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the app
 * itself uses.
 *
 * Every fixture lives inside a throwaway classroom created fresh per test and
 * deleted afterwards. Deleting the classroom is sufficient cleanup: every
 * table this factory writes to (enrollments, scheduled classes, attendance,
 * absences, exams and everything exam-eligibility adds) cascades off either
 * classroom_id or a chain that ends at it.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { STUDENT_ACCOUNT, TEACHER_ACCOUNT } from './credentials';

export interface EligibilityFixture {
  classroomId: string;
  /** Two lecture classes, oldest first. */
  lectureClassIds: [string, string];
  studentUserId: string;
  teacherUserId: string;
}

async function requireUserId(email: string): Promise<string> {
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No users row for ${email} -- is the E2E account provisioned in this environment?`);
  return data.id as string;
}

/**
 * A throwaway classroom with two past lecture classes four and two days ago,
 * the real E2E teacher enrolled as teacher, and the real E2E student enrolled
 * at a caller-controlled `studentEnrolledAt` -- backdate it (before both
 * lectures) to test attended/caught-up scenarios, or postdate it (after both)
 * to test the new-joiner bucket.
 */
export async function seedEligibilityFixture(opts: {
  studentEnrolledAt: string;
}): Promise<EligibilityFixture> {
  const supabase = getSupabaseAdminClient() as any;

  const [studentId, teacherId] = await Promise.all([
    requireUserId(STUDENT_ACCOUNT.email),
    requireUserId(TEACHER_ACCOUNT.email),
  ]);

  const { data: classroom, error: clsErr } = await supabase
    .from('nexus_classrooms')
    .insert({ name: `E2E Eligibility ${Date.now()}`, type: 'other', created_by: teacherId })
    .select('id')
    .single();
  if (clsErr) throw clsErr;
  const classroomId = classroom.id as string;

  const { error: enrollErr } = await supabase.from('nexus_enrollments').insert([
    { user_id: teacherId, classroom_id: classroomId, role: 'teacher' },
    { user_id: studentId, classroom_id: classroomId, role: 'student', enrolled_at: opts.studentEnrolledAt },
  ]);
  if (enrollErr) throw enrollErr;

  const day1 = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  const day2 = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

  const { data: classes, error: classErr } = await supabase
    .from('nexus_scheduled_classes')
    .insert([
      {
        classroom_id: classroomId,
        title: 'E2E Lecture 1',
        kind: 'lecture',
        scheduled_date: day1,
        start_time: '10:00',
        end_time: '11:00',
        status: 'completed',
        publish_state: 'published',
        teacher_id: teacherId,
      },
      {
        classroom_id: classroomId,
        title: 'E2E Lecture 2',
        kind: 'lecture',
        scheduled_date: day2,
        start_time: '10:00',
        end_time: '11:00',
        status: 'completed',
        publish_state: 'published',
        teacher_id: teacherId,
      },
    ])
    .select('id, scheduled_date')
    .order('scheduled_date', { ascending: true });
  if (classErr) throw classErr;

  return {
    classroomId,
    lectureClassIds: [classes[0].id, classes[1].id],
    studentUserId: studentId,
    teacherUserId: teacherId,
  };
}

export async function markAttended(scheduledClassId: string, studentId: string): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  const { error } = await supabase
    .from('nexus_attendance')
    .upsert(
      { scheduled_class_id: scheduledClassId, student_id: studentId, attended: true, source: 'manual' },
      { onConflict: 'scheduled_class_id,student_id' },
    );
  if (error) throw error;
}

/** Missed the class, and either still catching up (default) or already caught up. */
export async function markAbsence(
  scheduledClassId: string,
  classroomId: string,
  studentId: string,
  opts: { caughtUp?: boolean } = {},
): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  const { error } = await supabase.from('nexus_class_absences').upsert(
    {
      scheduled_class_id: scheduledClassId,
      classroom_id: classroomId,
      student_id: studentId,
      kind: 'no_show',
      caught_up_at: opts.caughtUp ? new Date().toISOString() : null,
    },
    { onConflict: 'scheduled_class_id,student_id' },
  );
  if (error) throw error;
}

/** Deletes the classroom; every fixture row this factory wrote cascades from it. */
export async function cleanupEligibilityFixture(classroomId: string): Promise<void> {
  const supabase = getSupabaseAdminClient() as any;
  await supabase.from('nexus_classrooms').delete().eq('id', classroomId);
}
