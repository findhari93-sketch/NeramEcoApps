import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
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
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
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
      // Staff own the shared library, but a student's own practice papers are
      // theirs. The Student tests tab is deliberately read only for the same
      // reason, and a bulk action must not be the back door around it.
      const someoneElses = found.filter((t: any) => t.created_by_student);
      if (someoneElses.length > 0) {
        return NextResponse.json(
          { error: "Student practice papers cannot be deleted here. They belong to the student." },
          { status: 403 },
        );
      }
      deletable = found.map((t: any) => t.id);
    } else {
      const notMine = found.filter((t: any) => t.created_by_student !== access.caller.id);
      if (notMine.length > 0) {
        return NextResponse.json({ error: 'You can only delete your own tests' }, { status: 403 });
      }
      deletable = found.map((t: any) => t.id);
    }

    const deleted = await softDeleteTests(deletable);

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
