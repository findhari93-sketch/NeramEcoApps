export const dynamic = 'force-dynamic';

/** POST: send a test phone alert to the signed-in staff member's own devices. */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { sendStaffPush } from '@neram/database/staff-push';
import { getRequestAdminId } from '@/lib/request-admin';

export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const result = await sendStaffPush(
    getSupabaseAdminClient(),
    {
      title: 'Test alert',
      body: 'Phone alerts are on. New sign-ups will show up here with their phone, source and place.',
      url: '/settings/notifications',
      tag: 'test-alert',
    },
    { userIds: [adminId] },
  );

  if (!result.configured) {
    return NextResponse.json({ error: 'Phone alerts are not set up on the server yet (VAPID keys missing).', result }, { status: 503 });
  }
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
}
