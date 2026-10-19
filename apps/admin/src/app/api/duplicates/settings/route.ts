export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { setDuplicateAutoMerge } from '@neram/database';

/**
 * PATCH /api/duplicates/settings  { autoMergeEnabled: boolean }
 *
 * When on, pairs that pass every check merge on their own: overnight
 * (identity-sweep cron) and right after a phone is verified or an enrolment
 * completes. Off by default.
 */
export async function PATCH(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to change this setting.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.autoMergeEnabled !== 'boolean') {
    return NextResponse.json({ error: 'autoMergeEnabled must be true or false.' }, { status: 400 });
  }
  try {
    const settings = await setDuplicateAutoMerge(body.autoMergeEnabled, adminId);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Duplicate settings error:', error);
    return NextResponse.json({ error: 'The setting was not saved.' }, { status: 500 });
  }
}
