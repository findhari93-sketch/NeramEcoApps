export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveVerifiedStaff } from '@/lib/staff-actor';
import { unauthorized } from '@/lib/support-inbox/server';

export interface TicketStaffOption {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

/**
 * GET /api/support-tickets/staff: who a ticket can be assigned to.
 *
 * Same filter as /api/demo-requests/staff (user_type teacher or admin with a
 * Microsoft account, never can_teach), plus the users.id the assign action
 * needs. The caller comes back as `me`.
 */
export async function GET(request: NextRequest) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();

  try {
    const { data, error } = await (getSupabaseAdminClient() as any)
      .from('users')
      .select('id, name, email, avatar_url, ms_oid, is_disabled')
      .in('user_type', ['teacher', 'admin'])
      .not('ms_oid', 'is', null)
      .order('name');
    if (error) throw error;

    const options: TicketStaffOption[] = (data ?? [])
      .filter(
        (u: { email: string | null; ms_oid: string; is_disabled: boolean | null }) =>
          !!u.email && !u.ms_oid.startsWith('test-oid-') && !u.is_disabled
      )
      .map((u: { id: string; name: string | null; email: string; avatar_url: string | null }) => ({
        id: u.id,
        name: u.name?.trim() || u.email.split('@')[0],
        email: u.email.trim().toLowerCase(),
        avatar_url: u.avatar_url,
      }));

    return NextResponse.json({ staff: options, me: { id: staff.id, name: staff.name } });
  } catch (error) {
    console.error('support ticket staff list failed:', error);
    return NextResponse.json({ error: 'Could not load staff' }, { status: 500 });
  }
}
