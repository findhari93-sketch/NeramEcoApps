import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  attachClassPrepTest,
  detachClassPrepTest,
  getClassPrepTest,
  updateClassPrepPassMark,
  listRepositoryTests,
  CLASS_PREP_DEFAULT_PASSING_PCT,
} from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';

/**
 * The short test attached to one timetable class.
 *
 * Sibling of [classId]/assignments: the same class, the other half of what a
 * student owes before it. One class holds at most one active prep test, enforced
 * by a partial unique index on nexus_test_placements, so POST replaces rather
 * than accumulating.
 *
 * Deliberately NOT the generic POST /api/question-bank/tests/[id]/placements.
 * That endpoint places a test into any context with no class scoping and no pass
 * mark rules, and a gated context needs both.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS = 'id, classroom_id, teacher_id, title, scheduled_date, start_time, status';

interface PrepClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  status: string | null;
}

/** IST class start, as milliseconds. The +05:30 is load-bearing (see prework.ts). */
function classStartMs(cls: PrepClass): number {
  const raw = (cls.start_time || '00:00').slice(0, 8);
  const time = raw.length === 5 ? `${raw}:00` : raw;
  return Date.parse(`${cls.scheduled_date.slice(0, 10)}T${time}+05:30`);
}

/**
 * Resolve the caller and confirm they may change this class.
 *
 * canEdit is the load-bearing check, not a capability string. Every teaching
 * capability sits in SHARED_STAFF, so "holds teach.assignment.write" only means
 * "is staff"; canRunSession also answers "on THIS class", which is the question
 * that matters when an external teacher tries to set work for someone else's.
 */
async function access(supabase: any, msOid: string, classId: string) {
  return resolveClassStaffAccess<PrepClass>(supabase, msOid, classId, CLASS_COLS);
}

/**
 * GET /api/timetable/[classId]/prep-test
 *
 * Staff also get `linkable`: repository tests they could reuse instead of
 * building a new paper, mirroring the assignments route's picker feed.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;

    const prepTest = await getClassPrepTest(params.classId, supabase);

    if (!acc.canEdit) {
      // A student reading their own class. They get whether a test exists and
      // what the bar is, never the questions: those come from the take route,
      // which checks enrolment and shuffles per attempt.
      return NextResponse.json({
        prep_test: prepTest
          ? {
              test_id: prepTest.test_id,
              title: prepTest.title,
              passing_pct: prepTest.passing_pct,
              question_count: prepTest.question_count,
              must_get_right: prepTest.must_get_right,
            }
          : null,
        canEdit: false,
      });
    }

    const linkable = await listRepositoryTests(undefined, supabase);

    return NextResponse.json({
      prep_test: prepTest,
      linkable,
      canEdit: true,
      default_passing_pct: CLASS_PREP_DEFAULT_PASSING_PCT,
      // The rail hides the section on a finished class rather than offering work
      // nobody can prepare for, and the API refuses it either way.
      has_started: Date.now() > classStartMs(acc.cls),
      class_topic: acc.cls.title ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the prep test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/[classId]/prep-test   (staff)
 * Body: { question_ids?: string[], test_id?: string, title?, passing_pct? }
 *
 * Either compose a fresh paper from bank questions or reuse an existing
 * repository test. Replaces whatever was attached; students who already passed
 * the old paper keep their pass, because recomputeClassPrep looks at every test
 * ever placed on this class rather than only the current one.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can set a prep test' }, { status: 403 });
    }

    // Nothing to prepare for once the class has begun. Refused here as well as
    // hidden in the rail: a stale tab must not be able to lock a live class.
    if (Date.now() > classStartMs(acc.cls)) {
      return NextResponse.json(
        { error: 'That class has already started, so there is nothing left to prepare for.' },
        { status: 409 },
      );
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

    const info = await attachClassPrepTest(
      {
        scheduledClassId: params.classId,
        classroomId: acc.cls.classroom_id,
        testId,
        questionIds,
        title: typeof body.title === 'string' ? body.title : `${acc.cls.title || 'Class'}: before you join`,
        passingPct: Number(body.passing_pct) || CLASS_PREP_DEFAULT_PASSING_PCT,
        createdBy: acc.userId,
      },
      supabase,
    );

    return NextResponse.json({ prep_test: info }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set the prep test';
    // The partial unique index is the backstop behind attachClassPrepTest's
    // deactivate-then-insert. Surfacing it as a 409 tells the teacher to reload
    // rather than showing them a Postgres constraint name.
    const status = /duplicate key|uq_placement/i.test(message)
      ? 409
      : /only hold MCQ|already started|Provide/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/timetable/[classId]/prep-test   (staff)
 * Body: { passing_pct }  — change the bar without touching the paper.
 *
 * The pass mark lives on the placement, never on nexus_tests.passing_marks: one
 * repository test can be the prep for two classes at two different bars, and
 * updateTestMeta can change passing_marks without touching either placement.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { passing_pct } = await request.json().catch(() => ({}) as any);
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can change the pass mark' }, { status: 403 });
    }

    const pct = Number(passing_pct);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      return NextResponse.json({ error: 'passing_pct must be between 1 and 100' }, { status: 400 });
    }

    const info = await updateClassPrepPassMark(params.classId, pct, supabase);
    if (!info) return NextResponse.json({ error: 'No prep test on this class' }, { status: 404 });
    return NextResponse.json({ prep_test: info });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to change the pass mark';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/timetable/[classId]/prep-test   (staff)
 *
 * Soft. The placement is deactivated, the test and every past attempt survive,
 * so a teacher who detaches by mistake loses nothing.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can remove a prep test' }, { status: 403 });
    }

    await detachClassPrepTest(params.classId, supabase);
    return NextResponse.json({ detached: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove the prep test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
