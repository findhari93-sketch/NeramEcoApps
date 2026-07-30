/**
 * Who may connect or disconnect the YouTube upload account.
 *
 * Gated on the `system.settings` capability, not on user_type, for the reason
 * api/settings spells out: the internal team keeps user_type='admin' so they
 * retain Admin app access, so a raw user_type check would let a manager re-point
 * the channel every class recording gets uploaded to.
 *
 * A route.ts file may only export HTTP handlers, so this cannot live next to the
 * four routes that share it.
 */

import { NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';

export interface YouTubeAdmin {
  userId: string;
  supabase: any;
}

export async function requireYouTubeAdmin(
  authHeader: string | null,
): Promise<YouTubeAdmin | NextResponse> {
  let oid: string;
  try {
    const msUser = await verifyMsToken(authHeader);
    oid = msUser.oid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', oid)
    .maybeSingle();

  if (!user || !canUser(user, 'system.settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { userId: user.id, supabase };
}
