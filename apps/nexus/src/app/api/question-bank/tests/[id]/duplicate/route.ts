import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { duplicateTest } from '@neram/database';

/**
 * POST /api/question-bank/tests/[id]/duplicate   (staff)
 *
 * Copy a test so an attempted paper can be revised without moving the ground
 * under scores students already earned. The copy is unpublished and unplaced, so
 * the teacher chooses when it takes over.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can duplicate a test' }, { status: 403 });
    }

    const { id } = await duplicateTest(params.id, access.caller.id);
    return NextResponse.json({ data: { test_id: id } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to duplicate the test';
    if (message === 'TEST_NOT_FOUND') {
      return NextResponse.json({ error: 'That test no longer exists.' }, { status: 404 });
    }
    if (message === 'TEST_HAS_NO_QUESTIONS') {
      return NextResponse.json({ error: 'That test has no questions to copy.' }, { status: 400 });
    }
    console.error('Test duplicate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
