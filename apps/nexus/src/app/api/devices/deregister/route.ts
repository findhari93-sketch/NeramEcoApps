export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/deregister
 *
 * Deregister (soft-delete) a device.
 * Uses Microsoft auth (Nexus).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, deregisterDevice } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId } = body;

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

    const success = await deregisterDevice(supabase, deviceId, user.id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to deregister device' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Deregister error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}
