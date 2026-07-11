import { NextRequest, NextResponse } from 'next/server';
import { markFileOpened } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/read
 * Records that the current user opened this file (drives "unread" badges). Idempotent; called once
 * per open from the client (NOT from the content proxy, which is hit many times per view).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    await markFileOpened(user.id, params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record read';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
