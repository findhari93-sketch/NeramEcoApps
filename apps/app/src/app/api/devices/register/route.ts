export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/register
 *
 * Register or re-register the current device for the student.
 * No device limit enforced — tools app allows unlimited devices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  incrementDeviceSessionCount,
} from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, fingerprint, deviceCategory, deviceName, deviceType, browser, os, osVersion, screenWidth, screenHeight, isPwa } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!fingerprint || !deviceCategory) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['desktop', 'mobile'].includes(deviceCategory)) {
      return NextResponse.json({ error: 'Invalid device category' }, { status: 400 });
    }

    // Verify Firebase token and get user
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

    // Check if same fingerprint already exists (returning device)
    const { data: existingDevice } = await supabase
      .from('student_registered_devices')
      .select('*')
      .eq('user_id', user.id)
      .eq('device_fingerprint', fingerprint)
      .eq('is_active', true)
      .single();

    let device;

    if (existingDevice) {
      // Same device returning — update metadata
      const { data: updated, error: updateError } = await supabase
        .from('student_registered_devices')
        .update({
          device_name: deviceName || null,
          device_type: deviceType || null,
          browser: browser || null,
          os: os || null,
          os_version: osVersion || null,
          screen_width: screenWidth || null,
          screen_height: screenHeight || null,
          is_pwa: isPwa ?? false,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingDevice.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update device:', updateError);
        return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
      }
      device = updated;
    } else {
      // New device — insert (no category limit check)
      const { data: newDevice, error: insertError } = await supabase
        .from('student_registered_devices')
        .insert({
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
          is_active: true,
          last_seen_at: new Date().toISOString(),
          session_count: 1,
        })
        .select()
        .single();

      if (insertError) {
        // If unique constraint on (user_id, device_category) fires,
        // deactivate the old one and retry — tools app has no limit
        if (insertError.code === '23505') {
          // Deactivate existing device in this category and insert new one
          await supabase
            .from('student_registered_devices')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('device_category', deviceCategory)
            .eq('is_active', true);

          const { data: retryDevice, error: retryError } = await supabase
            .from('student_registered_devices')
            .insert({
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
              is_active: true,
              last_seen_at: new Date().toISOString(),
              session_count: 1,
            })
            .select()
            .single();

          if (retryError) {
            console.error('Device register retry error:', retryError);
            return NextResponse.json({ error: 'Failed to register device' }, { status: 500 });
          }
          device = retryDevice;
        } else {
          console.error('Device register error:', insertError);
          return NextResponse.json({ error: 'Failed to register device' }, { status: 500 });
        }
      } else {
        device = newDevice;
      }
    }

    // Increment session count for returning devices
    if (device) {
      await incrementDeviceSessionCount(supabase, device.id, user.id);
    }

    return NextResponse.json({ device });
  } catch (error) {
    console.error('Device register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
