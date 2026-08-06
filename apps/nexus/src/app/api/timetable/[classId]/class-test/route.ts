import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  attachClassTest,
  detachClassTest,
  getClassTest,
  updateClassTest,
  getClassTestRoster,
  listRepositoryTests,
  CLASS_TEST_DEFAULT_PASSING_PCT,
  CLASS_TEST_DEFAULT_DUE_DAYS,
  CLASS_TEST_MAX_QUESTIONS,
} from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { classStartIso } from '@/lib/prework';

/**
 * The test one timetable class sets for afterwards.
 *
 * Sibling of [classId]/prep-test, and the differences are the point:
 *
 *   * NO "the class has started" GUARD. The prep route refuses every change once
 *     the class has begun, because there is nothing left to prepare for. Setting
 *     a test from the class you have just finished teaching is the NORMAL path
 *     here, so copying that guard across would make the feature unusable.
 *
 *   * It carries a due date and a Required switch, both of which live on the
 *     placement's gating so the paper itself stays reusable at a different
 *     deadline on another class.
 *
 * One class holds at most one active class test, enforced by the partial unique
 * index on nexus_test_placements, so POST replaces rather than accumulating.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS = 'id, classroom_id, teacher_id, title, scheduled_date, start_time, status';

interface TestClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  status: string | null;
}

async function access(supabase: any, msOid: string, classId: string) {
  return resolveClassStaffAccess<TestClass>(supabase, msOid, classId, CLASS_COLS);
}

/**
 * GET /api/timetable/[classId]/class-test
 *
 * Staff also get `linkable` (repository tests they could reuse) and `roster`
 * (who has done it), so the section renders from one request rather than three.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;

    const classTest = await getClassTest(params.classId, supabase);

    if (!acc.canEdit) {
      // A student reading their own class. They get whether a test exists, when
      // it is due and where they stand, never the questions: those come from the
      // take engine, which enforces the placement window itself.
      if (!classTest) return NextResponse.json({ class_test: null, canEdit: false });

      const roster = await getClassTestRoster(params.classId, [acc.userId], supabase);
      const mine = roster.get(acc.userId) ?? null;

      return NextResponse.json({
        class_test: {
          placement_id: classTest.placement_id,
          test_id: classTest.test_id,
          title: classTest.title,
          passing_pct: classTest.passing_pct,
          question_count: classTest.question_count,
          must_get_right: classTest.must_get_right,
          due_at: classTest.due_at,
          required: classTest.required,
          best_pct: mine?.best_pct ?? null,
          attempts: mine?.attempts ?? 0,
          passed: !!mine?.passed_at,
        },
        canEdit: false,
      });
    }

    const [linkable, roster] = await Promise.all([
      listRepositoryTests(undefined, supabase),
      classTest ? loadStaffRoster(supabase, params.classId, acc.cls.classroom_id) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      class_test: classTest,
      linkable,
      canEdit: true,
      default_passing_pct: CLASS_TEST_DEFAULT_PASSING_PCT,
      default_due_days: CLASS_TEST_DEFAULT_DUE_DAYS,
      max_questions: CLASS_TEST_MAX_QUESTIONS,
      class_topic: acc.cls.title ?? null,
      class_start: classStartIso(acc.cls.scheduled_date, acc.cls.start_time || '00:00'),
      roster,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load the class test');
  }
}

/** Who owes it, for the teacher's summary line. Only read when a test exists. */
async function loadStaffRoster(supabase: any, classId: string, classroomId: string) {
  const { data: enrolments } = await supabase
    .from('nexus_enrollments')
    .select('user_id, user:users(id, name, avatar_url)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);

  const students = (enrolments || []) as any[];
  const ids = students.map((e) => e.user_id);
  const standing = await getClassTestRoster(classId, ids, supabase);

  const rows = students.map((e) => {
    const s = standing.get(e.user_id);
    return {
      student_id: e.user_id,
      name: e.user?.name ?? null,
      avatar_url: e.user?.avatar_url ?? null,
      best_pct: s?.best_pct ?? null,
      attempts: s?.attempts ?? 0,
      passed: !!s?.passed_at,
    };
  });

  const done = rows.filter((r) => r.passed).length;
  return { rows, done, total: rows.length };
}

/**
 * POST /api/timetable/[classId]/class-test   (staff)
 * Body: { question_ids?, test_id?, title?, passing_pct?, due_at?, required? }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}) as any);
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can set a class test' }, { status: 403 });
    }

    const questionIds: string[] | undefined = Array.isArray(body.question_ids)
      ? body.question_ids.filter((q: unknown) => typeof q === 'string')
      : undefined;
    const testId: string | undefined = typeof body.test_id === 'string' ? body.test_id : undefined;

    if (!testId && !(questionIds && questionIds.length > 0)) {
      return NextResponse.json(
        { error: 'Pick at least one question, or choose an existing test.' },
        { status: 400 },
      );
    }

    const info = await attachClassTest(
      {
        scheduledClassId: params.classId,
        classroomId: acc.cls.classroom_id,
        testId,
        questionIds,
        title: typeof body.title === 'string' ? body.title : `${acc.cls.title || 'Class'}: test`,
        passingPct: Number(body.passing_pct) || CLASS_TEST_DEFAULT_PASSING_PCT,
        // undefined and null mean different things here: undefined asks for the
        // default deadline, null asks for no deadline at all.
        dueAt: body.due_at === undefined ? undefined : (body.due_at || null),
        required: body.required !== false,
        classDateIso: classStartIso(acc.cls.scheduled_date, acc.cls.start_time || '00:00'),
        createdBy: acc.userId,
      },
      supabase,
    );

    return NextResponse.json({ class_test: info }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set the class test';
    // A backstop, not the main path: attachClassTest revives an existing
    // placement rather than inserting a duplicate triple. If this fires the
    // teacher is told to reload rather than shown a Postgres constraint name.
    if (/duplicate key|uq_placement/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (/only hold MCQ|tops out at|Provide|belongs to another class|no longer exists/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return errorResponse(err, 'Failed to set the class test');
  }
}

/**
 * PATCH /api/timetable/[classId]/class-test   (staff)
 * Body: { passing_pct?, due_at?, required? }  — change the terms, not the paper.
 *
 * The pass mark lives on the placement, never on nexus_tests.passing_marks: one
 * repository test can be the class test for two classes at two different bars and
 * two different deadlines.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}) as any);
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can change the class test' }, { status: 403 });
    }

    if (body.passing_pct !== undefined) {
      const pct = Number(body.passing_pct);
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
        return NextResponse.json({ error: 'passing_pct must be between 1 and 100' }, { status: 400 });
      }
    }
    if (body.due_at !== undefined && body.due_at !== null && !Number.isFinite(Date.parse(body.due_at))) {
      return NextResponse.json({ error: 'That due date could not be read.' }, { status: 400 });
    }

    const info = await updateClassTest(
      params.classId,
      {
        passingPct: body.passing_pct === undefined ? undefined : Number(body.passing_pct),
        dueAt: body.due_at === undefined ? undefined : (body.due_at || null),
        required: body.required === undefined ? undefined : body.required !== false,
      },
      supabase,
    );
    if (!info) return NextResponse.json({ error: 'No test on this class' }, { status: 404 });
    return NextResponse.json({ class_test: info });
  } catch (err) {
    return errorResponse(err, 'Failed to change the class test');
  }
}

/**
 * DELETE /api/timetable/[classId]/class-test   (staff)
 *
 * Soft. The placement is deactivated, the paper and every past attempt survive,
 * so a teacher who detaches by mistake loses nothing.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can remove a class test' }, { status: 403 });
    }

    await detachClassTest(params.classId, supabase);
    return NextResponse.json({ detached: true });
  } catch (err) {
    return errorResponse(err, 'Failed to remove the class test');
  }
}
