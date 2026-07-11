import { NextRequest, NextResponse } from 'next/server';
import { getOpenStudyFeedback } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/feedback  (staff)
 * The Feedback inbox: open (unresolved) student comment threads across all study materials.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const threads = await getOpenStudyFeedback();
    return NextResponse.json({ threads });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load feedback';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
