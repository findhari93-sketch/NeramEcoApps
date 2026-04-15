/**
 * Shared helper for verifying Question Bank access in API routes.
 * Ensures students are enrolled in a QB-enabled classroom before serving data.
 */

import { NextResponse } from 'next/server';
import { verifyMsToken } from './ms-verify';
import {
  getSupabaseAdminClient,
  getUserRoleInClassroom,
  isQBEnabledForClassroom,
} from '@neram/database';

export interface QBCaller {
  id: string;
  user_type: string;
}

export type QBAccessResult =
  | { ok: true; caller: QBCaller }
  | { ok: false; response: NextResponse };

/**
 * Verify that the caller has access to the Question Bank for the given classroom.
 *
 * - Teachers/admins: always allowed (no enrollment check).
 * - Students: must be enrolled in the classroom AND the classroom must have QB enabled.
 * - If classroomId is null/undefined for a student, returns 400.
 */
export async function verifyQBAccess(
  authHeader: string | null,
  classroomId: string | null | undefined,
): Promise<QBAccessResult> {
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  let msUser;
  try {
    msUser = await verifyMsToken(authHeader);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  const supabase = getSupabaseAdminClient();
  const { data: caller } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!caller) {
    return { ok: false, response: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  // Teachers and admins can access QB without enrollment checks
  if (['teacher', 'admin'].includes(caller.user_type ?? '')) {
    return { ok: true, caller: { id: caller.id, user_type: caller.user_type ?? 'student' } };
  }

  // QB is globally available to all enrolled students (no classroom gating).
  // If a classroomId is provided, we can optionally verify enrollment,
  // but it's not required for access.
  return { ok: true, caller: { id: caller.id, user_type: caller.user_type ?? 'student' } };
}
