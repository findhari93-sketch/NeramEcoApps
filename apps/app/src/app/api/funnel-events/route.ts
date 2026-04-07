export const dynamic = 'force-dynamic';

/**
 * Funnel Events API
 *
 * POST /api/funnel-events - Save auth/onboarding/application funnel events
 * Supports both authenticated and anonymous (pre-auth) events
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSupabaseAdminClient, insertFunnelEventsBatch, linkAnonymousEvents } from '@neram/database';
import type { FunnelEventStatus } from '@neram/database';

async function getUserIdFromToken(idToken: string): Promise<string | null> {
  try {
    const decoded = await verifyIdToken(idToken);
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { events, idToken } = body;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    if (events.length > 50) {
      return NextResponse.json({ error: 'Too many events (max 50)' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Resolve user ID if token provided
    let userId: string | null = null;
    if (idToken) {
      userId = await getUserIdFromToken(idToken);
    }

    // Get IP from request headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || null;

    // Map events to insert format
    const insertEvents = events.map((evt: Record<string, unknown>) => ({
      user_id: userId,
      anonymous_id: (evt.anonymous_id as string) || null,
      funnel: evt.funnel as string,
      event: evt.event as string,
      status: ((evt.status as string) || 'started') as FunnelEventStatus,
      error_message: (evt.error_message as string) || null,
      error_code: (evt.error_code as string) || null,
      metadata: (evt.metadata as Record<string, unknown>) || {},
      device_type: (evt.device_type as string) || null,
      browser: (evt.browser as string) || null,
      os: (evt.os as string) || null,
      ip_address: ip,
      source_app: (evt.source_app as string) || 'app',
      page_url: (evt.page_url as string) || null,
      device_session_id: null,
    }));

    const inserted = await insertFunnelEventsBatch(supabase, insertEvents);

    // If user is authenticated and has anonymous events, link them
    if (userId && events[0]?.anonymous_id) {
      await linkAnonymousEvents(supabase, events[0].anonymous_id, userId);
    }

    return NextResponse.json({ inserted });
  } catch (error) {
    console.error('Funnel events API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
