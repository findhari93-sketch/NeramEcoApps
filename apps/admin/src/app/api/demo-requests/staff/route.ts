export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export interface DemoStaffOption {
  name: string;
  /** Microsoft sign-in address (UPN): what calendars and invites use. */
  email: string;
  avatar_url: string | null;
}

/**
 * GET /api/demo-requests/staff
 *
 * Our Microsoft staff, for picking the demo team instead of typing addresses.
 * Staff = user_type teacher or admin with a Microsoft account (never can_teach,
 * which defaults to true for everyone). Same filter as Nexus's tutor picker.
 */
export async function GET() {
  try {
    const { data, error } = await (getSupabaseAdminClient() as any)
      .from('users')
      .select('name, email, avatar_url, ms_oid, is_disabled')
      .in('user_type', ['teacher', 'admin'])
      .not('ms_oid', 'is', null)
      .order('name');
    if (error) throw error;

    const staff: DemoStaffOption[] = (data ?? [])
      .filter(
        (u: { email: string | null; ms_oid: string; is_disabled: boolean | null }) =>
          !!u.email && !u.ms_oid.startsWith('test-oid-') && !u.is_disabled,
      )
      .map((u: { name: string | null; email: string; avatar_url: string | null }) => ({
        name: u.name?.trim() || u.email.split('@')[0],
        email: u.email.trim().toLowerCase(),
        avatar_url: u.avatar_url,
      }));

    return NextResponse.json({ staff });
  } catch (error) {
    console.error('demo staff list failed:', error);
    return NextResponse.json({ error: 'Could not load staff' }, { status: 500 });
  }
}
