export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getFollowUpExpiryEnabled,
  previewFollowUpExpiry,
  runFollowUpExpiryNow,
  setFollowUpExpiryEnabled,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * GET /api/crm/follow-ups/expiry
 *   Is the nightly close on, and what the next run would close (with reasons).
 */
export async function GET() {
  try {
    const [enabled, preview] = await Promise.all([getFollowUpExpiryEnabled(), previewFollowUpExpiry()]);
    return NextResponse.json({ enabled, ...preview }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Follow-up expiry status error:', error);
    return NextResponse.json({ error: 'Could not load old follow-ups.' }, { status: 500 });
  }
}

/**
 * POST /api/crm/follow-ups/expiry
 *   { action: 'run', nightly?: boolean }    close them now; nightly turns the job on too
 *   { action: 'enable', enabled: boolean }  turn the nightly job on or off
 */
export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === 'run') {
      const run = await runFollowUpExpiryNow(adminId);
      const enabled = body.nightly === true ? await setFollowUpExpiryEnabled(true, adminId) : await getFollowUpExpiryEnabled();
      return NextResponse.json({ success: true, run, enabled });
    }
    if (body.action === 'enable' && typeof body.enabled === 'boolean') {
      return NextResponse.json({ success: true, enabled: await setFollowUpExpiryEnabled(body.enabled, adminId) });
    }
    return NextResponse.json({ error: "action must be 'run' or 'enable'." }, { status: 400 });
  } catch (error) {
    console.error('Follow-up expiry action error:', error);
    return NextResponse.json({ error: 'Could not close old follow-ups.' }, { status: 500 });
  }
}
