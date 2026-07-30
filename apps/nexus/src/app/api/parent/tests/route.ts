import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import {
  loadParentTests,
  summariseTests,
  type ParentTestSummary,
  type ParentTestWithClass,
} from '@/lib/parent-tests';
import type { EnrollmentNotice, ParentChildRef } from '@/lib/parent-view-types';

/**
 * GET /api/parent/tests?student=
 *
 * Every class-linked test the child has faced, with what they scored, how many
 * times they sat it, and whether that cleared the pass mark.
 *
 * Scoped to the child's classroom and batch, via the same enrolment read every
 * other parent route uses, so a test attached to another batch's class can never
 * appear here.
 *
 * Pass marks are DERIVED against each placement's own passing_pct, never read
 * from a column, because nexus_test_attempts does not have one. Attempts count
 * only submitted rows. Both traps are documented in lib/parent-tests.ts.
 */

export interface ParentTestsResponse {
  child: ParentChildRef;
  notice: EnrollmentNotice | null;
  summary: ParentTestSummary;
  tests: ParentTestWithClass[];
}

export async function GET(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));
    const { child, classroomId } = await resolveChildContext(
      parent.id,
      request.nextUrl.searchParams.get('student')
    );

    const { enrollment, notice } = await loadEnrollmentContext(
      child.id,
      classroomId,
      child.name
    );
    const batchId = enrollment?.batch_id ?? null;

    // The class list IS the scope. Pulling placements by classroom would not
    // work: nexus_test_placements is polymorphic and keyed on a class id, so the
    // only way to bound it to this child is to bound the classes first.
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date')
      .eq('classroom_id', classroomId)
      .eq('publish_state', 'published');
    query = batchId
      ? query.or(`batch_id.is.null,batch_id.eq.${batchId}`)
      : query.is('batch_id', null);

    const { data: classRows, error: classError } = await query.order('scheduled_date', {
      ascending: false,
    });

    // Never swallow. A failed class query would render as "no tests", which a
    // parent would read as reassurance rather than a fault.
    if (classError) {
      console.error('[parent/tests] class scope query failed:', classError);
      throw new Error('Could not load the tests.');
    }

    const classes = (classRows || []) as {
      id: string;
      title: string | null;
      scheduled_date: string;
    }[];

    const classMeta = new Map(
      classes.map((c) => [c.id, { title: c.title || 'Class', date: c.scheduled_date }])
    );

    const tests = await loadParentTests(
      child.id,
      classes.map((c) => c.id),
      classMeta
    );

    // Newest class first, which is also most-relevant first.
    tests.sort((a, b) => (b.classDate || '').localeCompare(a.classDate || ''));

    const body: ParentTestsResponse = {
      child: {
        id: child.id,
        name: child.name,
        avatar_url: child.avatar_url,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      notice,
      summary: summariseTests(tests),
      tests,
    };

    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Could not load the tests');
  }
}
