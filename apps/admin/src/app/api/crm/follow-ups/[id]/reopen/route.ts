export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { reopenFollowUp } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/** POST /api/crm/follow-ups/[id]/reopen: put a follow-up the nightly job closed back on the list. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!getRequestAdminId(req)) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  try {
    const res = await reopenFollowUp(params.id);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('follow-up reopen failed:', error);
    return NextResponse.json({ error: 'Could not reopen. Try again.' }, { status: 500 });
  }
}
