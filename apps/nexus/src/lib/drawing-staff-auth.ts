/**
 * The staff check every drawing review route makes: a verified Microsoft token
 * whose user is a teacher or an admin. Null means forbidden.
 *
 * `isAdmin` is the Nexus admin tier (resolveStaffRole), the same notion the
 * admin screens use on the client, so a screen and its API never disagree
 * about who may change evaluation setup.
 */

import type { NextRequest } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveStaffRole } from '@/lib/staff-capabilities';

export async function requireDrawingStaff(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (!user || !['teacher', 'admin'].includes(user.user_type as string)) return null;
  const isAdmin = resolveStaffRole(user) === 'admin';
  return { supabase, user: user as { id: string; user_type: string; staff_role: string | null }, isAdmin };
}

export const isNotMigrated = (message: string) => /does not exist|schema cache/i.test(message);
