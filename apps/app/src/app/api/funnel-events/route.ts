export const dynamic = 'force-dynamic';

/**
 * Funnel Events API
 *
 * POST /api/funnel-events - Save first-party analytics events.
 * Supports both authenticated and anonymous (pre-auth) events.
 *
 * Events are validated one by one (@neram/database/analytics): an unknown funnel
 * or malformed name is dropped instead of failing the whole batch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  getUserByFirebaseUid,
  insertFunnelEventsBatch,
  linkAnonymousEvents,
} from '@neram/database';
import type { UserFunnelEventInsert } from '@neram/database';
import { normalizeFunnelEvents } from '@neram/database/analytics';

async function getUserIdFromToken(idToken: string): Promise<string | null> {
  try {
    const decoded = await verifyIdToken(idToken);
    // Identity-aware: a second Firebase uid (phone OTP after Google) resolves
    // through user_identities to the same person.
    const user = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { events, idToken } = body;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    if (events.length > 50) {
      return NextResponse.json({ error: 'Too many events (max 50)' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const userId = idToken ? await getUserIdFromToken(idToken) : null;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || null;

    const { rows, dropped } = normalizeFunnelEvents(events, { userId, ip, sourceApp: 'app' });
    const inserted = await insertFunnelEventsBatch(supabase, rows as unknown as UserFunnelEventInsert[]);

    // Once signed in, earlier anonymous events from this browser become theirs.
    const anonymousId = rows.find((r) => r.anonymous_id)?.anonymous_id;
    if (userId && anonymousId) {
      await linkAnonymousEvents(supabase, anonymousId, userId);
    }

    return NextResponse.json({ inserted, dropped });
  } catch (error) {
    console.error('Funnel events API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
