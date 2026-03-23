export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/heartbeat
 *
 * Record active/idle time for a device session.
 * Called every 60s by the active time tracker + on page close via sendBeacon.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSupabaseAdminClient, recordDeviceHeartbeat } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, deviceId, sessionId, activeSeconds, idleSeconds, location } = body;

    if (!idToken || !deviceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const decoded = await verifyIdToken(idToken);
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await recordDeviceHeartbeat(
      supabase,
      deviceId,
      user.id,
      activeSeconds || 0,
      idleSeconds || 0,
      sessionId || null,
      location || null
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
