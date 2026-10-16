export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { buildConversations, buildPeople } from '@/lib/aintra-inbox/build';
import { loadNudges, loadRows, loadUsers } from '@/lib/aintra-inbox/server';
import type { InboxPayload } from '@/lib/aintra-inbox/types';

const NO_STORE = { 'Cache-Control': 'no-store' };

// GET /api/aintra-inbox
// Every Aintra conversation (lifetime, capped) as list rows, plus one row per
// person with their lead stage. No answer text: the transcript loads per chat
// from /api/aintra-inbox/conversation/[sessionId]. Insights are worked out in
// the browser from this payload, so changing the range costs no request.
// Caller auth is the admin middleware's job, as for every /api route here.
export async function GET() {
  try {
    const db = createAdminClient();
    const now = new Date();
    const [{ rows, truncated }, nudges] = await Promise.all([loadRows(db), loadNudges(db)]);
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
    const users = await loadUsers(db, userIds);
    const conversations = buildConversations(rows, users, now);
    const people = buildPeople(conversations, users, nudges, now);
    const payload: InboxPayload = { conversations, people, generatedAt: now.toISOString(), truncated };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    console.error('[aintra-inbox] load failed:', err);
    return NextResponse.json({ error: 'Could not load Aintra conversations' }, { status: 500, headers: NO_STORE });
  }
}
