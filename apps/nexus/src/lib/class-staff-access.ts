/**
 * "May this staff member act on this class?"
 *
 * The rule is the same everywhere: internal staff reach any classroom without
 * being enrolled in it, everyone else needs an active enrollment, and only the
 * tutor of a class (or internal staff) may change it.
 *
 * It lives here rather than inline in a route because a route.ts file may only
 * export HTTP handlers, so two routes cannot share a helper by importing it
 * from one another. The wrap-up and summarize routes still carry their own
 * older copies; anything new should use this one.
 */

import { NextResponse } from 'next/server';
import { canRunSession, isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';

export interface ClassAccessOk<TClass> {
  userId: string;
  canEdit: boolean;
  cls: TClass;
  /**
   * The staff row this decision was made from, so a caller needing an extra
   * capability check does not pay for a second users lookup. Note that canEdit
   * is already the load-bearing check: every teaching capability sits in
   * SHARED_STAFF, so "holds teach.assignment.write" only means "is staff",
   * while canRunSession also answers "on THIS class".
   */
  user: { id: string; user_type: string | null; staff_role: string | null; can_teach: boolean | null };
}

export interface ClassAccessError {
  error: NextResponse;
}

export type ClassAccess<TClass> = ClassAccessOk<TClass> | ClassAccessError;

export async function resolveClassStaffAccess<TClass extends { classroom_id: string; teacher_id: string | null }>(
  supabase: any,
  msOid: string,
  classId: string,
  classColumns: string,
): Promise<ClassAccess<TClass>> {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select(classColumns)
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', (cls as any).classroom_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!enrollment && !isInternalStaff(resolveStaffRole(user))) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  return {
    userId: user.id as string,
    canEdit: canRunSession(user, (cls as any).teacher_id),
    cls: cls as TClass,
    user,
  };
}
