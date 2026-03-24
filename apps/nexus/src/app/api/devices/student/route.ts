export const dynamic = 'force-dynamic';

/**
 * GET /api/devices/student
 * Fetch the current student's registered devices from shared DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getUserDevices } from '@neram/database';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    // Look up Supabase user by ms_oid
    const { data: user } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const devices = await getUserDevices(supabase as any, user.id);

    return NextResponse.json({ devices });
  } catch (error: any) {
    console.error('Device fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch devices' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}
