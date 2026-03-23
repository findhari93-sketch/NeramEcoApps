export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/swap-request
 *
 * Student requests to swap a registered device.
 * Body: { idToken, deviceCategory, reason }
 *
 * GET /api/devices/swap-request
 * Header: Authorization: Bearer <idToken>
 *
 * Get the student's swap requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  createDeviceSwapRequest,
  getUserSwapRequests,
} from '@neram/database';

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
    const { idToken, deviceCategory, reason } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!deviceCategory || !reason) {
      return NextResponse.json({ error: 'Missing deviceCategory or reason' }, { status: 400 });
    }

    if (!['desktop', 'mobile'].includes(deviceCategory)) {
      return NextResponse.json({ error: 'Invalid device category' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(idToken);
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
  } catch (error) {
    console.error('Swap request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getUserIdFromToken(idToken);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();
    const requests = await getUserSwapRequests(supabase, userId);

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Get swap requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
