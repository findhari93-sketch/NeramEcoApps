export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/register
 *
 * Register or re-register the current device for the student.
 * Enforces: max 1 desktop + 1 mobile per student.
 * Uses Microsoft auth (Nexus).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  registerDevice,
  incrementDeviceSessionCount,
} from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json();
    const { fingerprint, deviceCategory, deviceName, deviceType, browser, os, osVersion, screenWidth, screenHeight, isPwa } = body;

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!fingerprint || !deviceCategory) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['desktop', 'mobile'].includes(deviceCategory)) {
      return NextResponse.json({ error: 'Invalid device category' }, { status: 400 });
    }

    // Verify Microsoft token and get user
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

    // Register the device
    const { device, error, isLimitError } = await registerDevice(supabase, {
      user_id: user.id,
      device_fingerprint: fingerprint,
      device_category: deviceCategory,
      device_name: deviceName || null,
      device_type: deviceType || null,
      browser: browser || null,
      os: os || null,
      os_version: osVersion || null,
      screen_width: screenWidth || null,
      screen_height: screenHeight || null,
      is_pwa: isPwa ?? false,
    });

    if (error) {
      // 409 only for limit/conflict errors, 500 for other failures
      return NextResponse.json({ error }, { status: isLimitError ? 409 : 500 });
    }

    // Increment session count for returning devices
    if (device) {
      await incrementDeviceSessionCount(supabase, device.id, user.id);
    }

    return NextResponse.json({ device });
  } catch (error: any) {
    console.error('Device register error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}
