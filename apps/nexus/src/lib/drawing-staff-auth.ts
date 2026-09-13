/**
 * The staff check every drawing review route makes: a verified Microsoft token
 * whose user is a teacher or an admin. Null means forbidden.
 */

import type { NextRequest } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

export async function requireDrawingStaff(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (!user || !['teacher', 'admin'].includes(user.user_type as string)) return null;
  return { supabase, user: user as { id: string; user_type: string } };
}

export const isNotMigrated = (message: string) => /does not exist|schema cache/i.test(message);
