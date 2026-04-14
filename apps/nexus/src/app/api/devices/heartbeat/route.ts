export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/heartbeat
 *
 * Record active/idle time for a device session.
 * Called every 60s by the active time tracker + on page close via sendBeacon.
 * Uses Microsoft auth (Nexus).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, recordDeviceHeartbeat } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId, sessionId, activeSeconds, idleSeconds, location } = body;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !deviceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: user } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('ms_oid', msUser.oid)
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
  } catch (error: any) {
    console.error('Heartbeat error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: (error.message?.includes('Authorization') || error.message?.includes('Invalid Microsoft token') || error.message?.includes('token')) ? 401 : 500 }
    );
  }
}
