export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { staffName } from '@/lib/aintra-inbox/server';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Same shape the marketing site writes: anon_ plus 32 hex characters. */
const ANON_ID = /^anon_[0-9a-f]{32}$/i;

async function readId(request: NextRequest): Promise<string | null> {
  try {
    const body = await request.json();
    const id = typeof body?.anonymousId === 'string' ? body.anonymousId.trim() : '';
    return ANON_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// POST /api/aintra-inbox/nudge { anonymousId }
// Ask a guest to sign up on their next visit: the marketing chat adds a sign-up
// card to that visitor's next answer and stamps shown_at. Asking again after it
// was shown queues it once more.
export async function POST(request: NextRequest) {
  const anonymousId = await readId(request);
  if (!anonymousId) return NextResponse.json({ error: 'Unknown visitor' }, { status: 400, headers: NO_STORE });
  try {
    const db = createAdminClient() as any;
    const adminId = getRequestAdminId(request);
    const row = {
      anonymous_id: anonymousId,
      requested_by: adminId,
      requested_by_name: await staffName(db, adminId),
      requested_at: new Date().toISOString(),
      shown_at: null,
      shown_session_id: null,
    };
    const { data, error } = await db
      .from('aintra_signup_nudges')
      .upsert(row, { onConflict: 'anonymous_id' })
      .select('requested_at, requested_by_name, shown_at')
      .single();
    if (error) throw error;
    return NextResponse.json(
      { nudge: { requestedAt: data.requested_at, requestedByName: data.requested_by_name, shownAt: data.shown_at } },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error('[aintra-inbox/nudge] save failed:', err);
    return NextResponse.json({ error: 'Could not queue the sign-up card' }, { status: 500, headers: NO_STORE });
  }
}

// DELETE /api/aintra-inbox/nudge { anonymousId }: cancel a queued sign-up card.
export async function DELETE(request: NextRequest) {
  const anonymousId = await readId(request);
  if (!anonymousId) return NextResponse.json({ error: 'Unknown visitor' }, { status: 400, headers: NO_STORE });
  try {
    const { error } = await (createAdminClient() as any).from('aintra_signup_nudges').delete().eq('anonymous_id', anonymousId);
    if (error) throw error;
    return NextResponse.json({ nudge: null }, { headers: NO_STORE });
  } catch (err) {
    console.error('[aintra-inbox/nudge] delete failed:', err);
    return NextResponse.json({ error: 'Could not cancel the sign-up card' }, { status: 500, headers: NO_STORE });
  }
}
