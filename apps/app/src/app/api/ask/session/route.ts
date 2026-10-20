// Per-visitor data (their details, their threads): never cached.
export const dynamic = 'force-dynamic';

/**
 * Ask aiArchitek's state for the chat page, in one route to keep function
 * invocations down:
 *
 *   GET    ?thread=<id>   remembered details, guest answers left, the student's
 *                         threads (signed in), and one thread's messages
 *   PATCH  { facts }      edit or forget details (a key set to null is forgotten)
 *   POST   { action: 'claim' }  a guest just signed in: move their threads and
 *                         details to the account
 */
import { NextRequest, NextResponse } from 'next/server';
import { claimAskGuestData, listAskMessages, listAskThreads, getAskThread } from '@neram/database';
import { mergeFacts } from '@/lib/ask/memory';
import { GUEST_DAILY_ANSWERS, guestRemaining } from '@/lib/ask/quota';
import { guestAnswersToday, loadFacts, ownerOf, saveFacts } from '@/lib/ask/store';
import { askVisitorFrom, type AskVisitor } from '@/lib/ask/visitor';

function json(v: AskVisitor, data: unknown, status = 200) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (v.setCookie) headers['Set-Cookie'] = v.setCookie;
  return NextResponse.json(data, { status, headers });
}

export async function GET(request: NextRequest) {
  const v = await askVisitorFrom(request);
  const threadId = request.nextUrl.searchParams.get('thread');
  const [facts, used, threads] = await Promise.all([
    loadFacts(v),
    v.userId ? Promise.resolve(0) : guestAnswersToday(v.anonId),
    v.userId ? listAskThreads(v.userId, 30).catch(() => []) : Promise.resolve([]),
  ]);

  let messages: unknown[] = [];
  if (threadId && /^[0-9a-f-]{36}$/i.test(threadId)) {
    try {
      const thread = await getAskThread(threadId, ownerOf(v));
      if (thread) messages = await listAskMessages(thread.id, 80);
    } catch {
      messages = [];
    }
  }

  return json(v, {
    signedIn: !!v.userId,
    facts,
    guest: v.userId ? null : { remaining: guestRemaining(used), limit: GUEST_DAILY_ANSWERS },
    threads,
    messages,
  });
}

export async function PATCH(request: NextRequest) {
  const v = await askVisitorFrom(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(v, { error: 'Invalid request' }, 400);
  }
  const patch = body.facts && typeof body.facts === 'object' && !Array.isArray(body.facts) ? (body.facts as Record<string, unknown>) : null;
  if (!patch) return json(v, { error: 'facts is required' }, 400);
  const facts = mergeFacts(await loadFacts(v), patch);
  await saveFacts(v, facts);
  return json(v, { facts });
}

export async function POST(request: NextRequest) {
  const v = await askVisitorFrom(request);
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine for claim.
  }
  if (body.action !== 'claim') return json(v, { error: 'Unknown action' }, 400);
  if (!v.userId) return json(v, { error: 'Sign in first' }, 401);
  if (v.minted) return json(v, { claimed: 0 });
  try {
    const { threads } = await claimAskGuestData(v.anonId, v.userId);
    return json(v, { claimed: threads, facts: await loadFacts(v) });
  } catch (err) {
    console.error('[ask] claim failed:', err instanceof Error ? err.message : err);
    return json(v, { claimed: 0 });
  }
}
