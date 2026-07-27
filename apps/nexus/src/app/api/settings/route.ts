import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getNexusSetting,
  upsertNexusSetting,
} from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';

/**
 * GET /api/settings?key=admin_teams_contacts
 * Public read of Nexus settings (used by welcome page).
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const setting = await getNexusSetting(key);
    return NextResponse.json({ value: setting?.value ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch setting';
    console.error('GET /api/settings error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/settings
 * Admin-only write to update a Nexus setting.
 * Body: { key: string, value: any }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    // Gate on the capability, not on user_type. The internal team keeps
    // user_type='admin' so they retain Admin app access, so a raw user_type check
    // here would still let a manager rewrite the global feature flags and the
    // Teams contact list. system.settings is admin-only.
    if (!user || !canUser(user, 'system.settings')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
    }

    const setting = await upsertNexusSetting(key, value, user.id);
    return NextResponse.json({ setting });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update setting';
    console.error('PATCH /api/settings error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
