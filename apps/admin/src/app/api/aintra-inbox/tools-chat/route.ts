export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, listAskActivity, listAskThreadForAdmin } from '@neram/database';
import { loadUsers } from '@/lib/aintra-inbox/server';
import { buildToolsChat, type ToolsChatRow } from '@/lib/tools-chat/build';

const NO_STORE = { 'Cache-Control': 'no-store' };
const RANGES: Record<string, number | null> = { '7': 7, '30': 30, '180': 180, all: null };

// GET /api/aintra-inbox/tools-chat?range=30
//   Aintra in the Tools app (/ask): threads, totals, tool use, and the
//   people behind signed-in threads.
// GET /api/aintra-inbox/tools-chat?thread=<id>
//   One thread's messages, with the cards and tool calls of each answer.
// Caller auth is the admin middleware's job, as for every /api route here.
export async function GET(request: NextRequest) {
  const db = createAdminClient();
  const threadId = request.nextUrl.searchParams.get('thread');
  try {
    if (threadId) {
      if (!/^[0-9a-f-]{36}$/i.test(threadId)) return NextResponse.json({ error: 'Bad thread id' }, { status: 400, headers: NO_STORE });
      const messages = await listAskThreadForAdmin(threadId, db);
      return NextResponse.json({ messages }, { headers: NO_STORE });
    }

    const range = request.nextUrl.searchParams.get('range') ?? '30';
    const days = range in RANGES ? RANGES[range] : 30;
    const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null;
    const { rows, truncated } = await listAskActivity(since, 5000, db);
    const view = buildToolsChat(rows as ToolsChatRow[]);
    const userIds = [...new Set(view.threads.map((t) => t.userId).filter((id): id is string => !!id))];
    const users = await loadUsers(db, userIds);
    const people = Object.fromEntries(
      [...users.values()].map((u) => [u.id, { name: u.name, phone: u.phone, email: u.email, enrolled: u.enrolled }])
    );
    return NextResponse.json({ ...view, people, truncated, generatedAt: new Date().toISOString() }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tools-chat] load failed:', message);
    // The tables arrive with the ask_* migration (Aintra in the Tools app); before that, say so plainly.
    const missing = /ask_messages|schema cache|does not exist/i.test(message);
    return NextResponse.json(
      { error: missing ? 'Tools chat has no data yet: the Aintra Tools app tables are not on this database.' : 'Could not load Tools chat' },
      { status: missing ? 404 : 500, headers: NO_STORE }
    );
  }
}
