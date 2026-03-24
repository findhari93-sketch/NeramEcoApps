export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/swap-request
 * Student requests to swap a registered device.
 * Body: { deviceCategory, reason }
 *
 * GET /api/devices/swap-request
 * Get the student's swap requests.
 *
 * Uses Microsoft auth (Nexus).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createDeviceSwapRequest,
  getUserSwapRequests,
} from '@neram/database';

async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
  try {
    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();
    const { data } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json();
    const { deviceCategory, reason } = body;

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!deviceCategory || !reason) {
      return NextResponse.json({ error: 'Missing deviceCategory or reason' }, { status: 400 });
    }

    if (!['desktop', 'mobile'].includes(deviceCategory)) {
      return NextResponse.json({ error: 'Invalid device category' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();
    const { request, error } = await createDeviceSwapRequest(
      supabase,
      userId,
      deviceCategory as 'desktop' | 'mobile',
      reason
    );

    if (error) {
      return NextResponse.json({ error }, { status: 409 });
    }

    return NextResponse.json({ request });
  } catch (error: any) {
    console.error('Swap request error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();
    const requests = await getUserSwapRequests(supabase, userId);

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error('Get swap requests error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}
