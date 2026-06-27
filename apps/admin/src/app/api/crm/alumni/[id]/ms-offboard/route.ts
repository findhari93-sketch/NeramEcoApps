// @ts-nocheck
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { offboardMicrosoftAccounts } from '@/lib/ms-offboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/[id]/ms-offboard
 * Retry Microsoft offboarding (remove license + disable sign-in) for an already
 * graduated alumnus, e.g. when it failed during graduation. Returns the same `ms`
 * summary shape (with configError + classified failures) as the graduate route.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid alumnus id.' }, { status: 400 });
    }
    const ms = await offboardMicrosoftAccounts([params.id]);
    return NextResponse.json({ success: true, ms });
  } catch (error: any) {
    console.error('CRM alumni ms-offboard error:', error);
    return NextResponse.json({ error: error.message || 'Failed to run Microsoft offboarding' }, { status: 500 });
  }
}
