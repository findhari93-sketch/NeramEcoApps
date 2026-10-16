export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { loadTurns } from '@/lib/aintra-inbox/server';

const NO_STORE = { 'Cache-Control': 'no-store' };

// GET /api/aintra-inbox/conversation/[sessionId]: every turn of one chat, with
// the full answers, corrections and saved AI reviews.
export async function GET(_request: NextRequest, { params }: { params: { sessionId: string } }) {
  const sessionId = decodeURIComponent(params.sessionId ?? '').trim();
  if (!sessionId || sessionId.length > 200) {
    return NextResponse.json({ error: 'Unknown conversation' }, { status: 400, headers: NO_STORE });
  }
  try {
    const turns = await loadTurns(createAdminClient(), sessionId);
    if (!turns.length) return NextResponse.json({ error: 'Conversation not found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ turns }, { headers: NO_STORE });
  } catch (err) {
    console.error('[aintra-inbox/conversation] failed:', err);
    return NextResponse.json({ error: 'Could not load this conversation' }, { status: 500, headers: NO_STORE });
  }
}
