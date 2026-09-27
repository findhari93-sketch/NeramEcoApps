export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getLifecycleRules, saveLifecycleRules, DEFAULT_LIFECYCLE_RULES } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/** GET /api/settings/lifecycle-rules - current rules plus the defaults. */
export async function GET() {
  try {
    return NextResponse.json({ rules: await getLifecycleRules(), defaults: DEFAULT_LIFECYCLE_RULES });
  } catch (error) {
    console.error('Lifecycle rules error:', error);
    return NextResponse.json({ error: 'Could not load the rules.' }, { status: 500 });
  }
}

/** PUT /api/settings/lifecycle-rules - validated; invalid values are refused, never clamped. */
export async function PUT(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to save.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const rules = await saveLifecycleRules(body.rules ?? body, adminId);
    return NextResponse.json({ rules });
  } catch (error: any) {
    if (error?.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Save lifecycle rules error:', error);
    return NextResponse.json({ error: 'Could not save the rules.' }, { status: 500 });
  }
}
