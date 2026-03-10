export const dynamic = 'force-dynamic';

/**
 * Diagnostics API
 *
 * POST /api/diagnostics - Save device session + location data
 * Authenticated via Firebase ID token
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSupabaseAdminClient, insertDeviceSession, insertErrorLog } from '@neram/database';

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
    const { type, idToken, ...payload } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getUserIdFromToken(idToken);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();

    if (type === 'session') {
      const session = await insertDeviceSession(supabase, {
        user_id: userId,
        device_type: payload.device_type || null,
        browser: payload.browser || null,
        browser_version: payload.browser_version || null,
        os: payload.os || null,
        os_version: payload.os_version || null,
        user_agent: payload.user_agent || null,
        screen_width: payload.screen_width || null,
        screen_height: payload.screen_height || null,
        device_pixel_ratio: payload.device_pixel_ratio || null,
        latitude: payload.latitude || null,
        longitude: payload.longitude || null,
        location_accuracy: payload.location_accuracy || null,
        timezone: payload.timezone || null,
        connection_type: payload.connection_type || null,
        effective_bandwidth: payload.effective_bandwidth || null,
        language: payload.language || null,
        app_version: payload.app_version || null,
        is_pwa: payload.is_pwa ?? false,
      });

      return NextResponse.json({ session_id: session?.id || null });
    }

    if (type === 'error') {
      const log = await insertErrorLog(supabase, {
        user_id: userId,
        session_id: payload.session_id || null,
        error_type: payload.error_type || 'js_error',
        error_message: payload.error_message || null,
        error_stack: payload.error_stack || null,
        page_url: payload.page_url || null,
        component: payload.component || null,
        device_type: payload.device_type || null,
        browser: payload.browser || null,
        os: payload.os || null,
      });

      return NextResponse.json({ error_id: log?.id || null });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Diagnostics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
