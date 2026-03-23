export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/deregister
 *
 * Deregister (soft-delete) a device.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSupabaseAdminClient, deregisterDevice } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, deviceId } = body;

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

    const success = await deregisterDevice(supabase, deviceId, user.id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to deregister device' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Deregister error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
