export const dynamic = 'force-dynamic';

/**
 * Funnel Events API (Marketing)
 *
 * POST /api/funnel-events - Save first-party analytics events from the public
 * site. No auth: these are mostly pre-signup page and form events, keyed by the
 * neram_anon_id cookie and linked to the person when they sign up.
 *
 * Events are validated one by one (@neram/database/analytics): an unknown funnel
 * or malformed name is dropped instead of failing the whole batch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, insertFunnelEventsBatch } from '@neram/database';
import type { UserFunnelEventInsert } from '@neram/database';
import { normalizeFunnelEvents } from '@neram/database/analytics';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { events } = body;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    if (events.length > 50) {
      return NextResponse.json({ error: 'Too many events (max 50)' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || null;

    const { rows, dropped } = normalizeFunnelEvents(events, { userId: null, ip, sourceApp: 'marketing' });
    const inserted = await insertFunnelEventsBatch(
      getSupabaseAdminClient(),
      rows as unknown as UserFunnelEventInsert[],
    );
    return NextResponse.json({ inserted, dropped });
  } catch (error) {
    console.error('Funnel events API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
