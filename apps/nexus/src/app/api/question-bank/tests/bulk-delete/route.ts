import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getSupabaseAdminClient, softDeleteTests } from '@neram/database';

/** One library page holds at most 200 rows, so a larger batch is a client bug. */
const MAX_BATCH = 200;

/**
 * POST /api/question-bank/tests/bulk-delete
 * Body: { test_ids: string[] }
 *
 * Clearing out several tests in one go, which until now meant opening each one
 * and deleting it from its own page. Left-over E2E papers are the case that
 * forced it: 39 of them is 39 round trips through a detail screen.
 *
 * Soft delete, the same as the single-test route. The tests leave the library
 * and stop being visible to students, and every attempt anyone ever made stays
 * on record.
 */
export async function POST(request: NextRequest) {
  try {
    // ANY classroom, not verifyQBAccess(..., null).
    //
    // A test id is not classroom scoped, and a student deleting their own paper
    // has no classroom to name. verifyQBAccess answers a null classroom with
    // "classroom_id is required", 400, for every student, every time, which
    // meant the ownership branch below had never once executed: the route was
    // staff-only in practice while reading as though it were not. That is the
    // same mistake NXS-0114 recorded when it took the student test builder off
    // the air, and the reason verifyQBAccessAnyClassroom exists.
    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const testIds: string[] = Array.isArray(body?.test_ids)
      ? body.test_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];

    if (testIds.length === 0) {
      return NextResponse.json({ error: 'test_ids must be a non-empty array' }, { status: 400 });
    }
    if (testIds.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Select at most ${MAX_BATCH} tests at a time.` },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: rows, error } = await supabase
      .from('nexus_tests')
      .select('id, created_by_student')
      .in('id', testIds)
      .eq('is_active', true);
    if (error) throw error;

    const found = rows || [];
    const isStaff = resolveStaffRole(access.caller) !== null;

    let deletable: string[];
    if (isStaff) {
      // Staff may clear student practice papers as well as the shared library.
      // This route used to refuse them on the grounds that a student's workspace
      // is their own, but the single-test route never carried that guard, so a
      // teacher could already delete one by opening its detail page: the rule was
      // enforced in exactly one of the two places it applied. It is now settled
      // the other way, because the papers students abandon by the dozen are the
      // clutter teachers are actually being asked to clear.
      //
      // The narrower rule still stands and is enforced in /api/test-folders:
      // staff may DELETE a student's paper, never RE-FILE it into a folder the
      // student did not make.
      deletable = found.map((t: any) => t.id);
    } else {
      const notMine = found.filter((t: any) => t.created_by_student !== access.caller.id);
      if (notMine.length > 0) {
        return NextResponse.json({ error: 'You can only delete your own tests' }, { status: 403 });
      }
      deletable = found.map((t: any) => t.id);
    }

    const deleted = await softDeleteTests(deletable, access.caller.id);

    return NextResponse.json({
      data: {
        deleted: deleted.length,
        // Ids that were already gone or never existed. Reported rather than
        // silently folded into the count, so a stale list is visible as one.
        skipped: testIds.length - deleted.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete the tests';
    console.error('Bulk test delete error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
