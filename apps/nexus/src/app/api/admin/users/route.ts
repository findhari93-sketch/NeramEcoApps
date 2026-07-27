import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';
import { getNexusMemberUserIds } from '@/lib/nexus-members';
import { canUser, STAFF_ROLES, type StaffRole } from '@/lib/staff-capabilities';

/**
 * GET /api/admin/users?q={query}&role={role}&page={page}&limit={limit}
 *
 * List Nexus members (active-access students + teachers + admins) with optional
 * search and role filter. Admin-only. Scoped via getNexusMemberUserIds so leads
 * and Tools-app signups from the shared users table never appear here.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!canUser(caller, 'system.roles')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const role = request.nextUrl.searchParams.get('role')?.trim();
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
    const offset = (page - 1) * limit;

    // Scope to Nexus members only (staff + active-access students), so leads and
    // Tools-app signups from the shared users table are excluded.
    const memberIds = await getNexusMemberUserIds();
    if (memberIds.length === 0) {
      return NextResponse.json({ users: [], total: 0, page, limit, totalPages: 0 });
    }

    let query = supabase
      .from('users')
      .select(
        'id, name, email, phone, avatar_url, user_type, staff_role, can_teach, status, created_at, ms_oid, firebase_uid',
        { count: 'exact' },
      )
      .in('id', memberIds);

    if (role === 'student' || role === 'teacher' || role === 'admin') {
      query = query.eq('user_type', role);
    }

    if (q && q.length >= 2) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch users';
    console.error('Admin users error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 * Body: { userId, user_type?, staff_role?, can_teach? }
 *
 * Update a user's access tier and/or Nexus authority. Admin-only.
 *
 * Three independent fields, deliberately:
 *   user_type   Admin app access (AdminGuard requires 'admin')
 *   staff_role  Nexus authority (admin | manager | teacher, or null for students)
 *   can_teach   whether they may be the tutor of a class
 *
 * Every change is written to the profile history, which this route previously
 * skipped even though the admin-app path (bulkSetUserRole) has always audited it.
 * A silent role change is exactly the thing you want a trail for.
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!canUser(caller, 'system.roles')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, user_type, staff_role, can_teach } = body as {
      userId?: string;
      user_type?: string;
      staff_role?: string | null;
      can_teach?: boolean;
    };

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (user_type !== undefined) {
      const validTypes = ['student', 'teacher', 'admin', 'parent'];
      if (!validTypes.includes(user_type)) {
        return NextResponse.json(
          { error: `Invalid user_type. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 },
        );
      }
      updates.user_type = user_type;
    }

    if (staff_role !== undefined) {
      // null clears the tier (e.g. reverting a staff member to a student).
      if (staff_role !== null && !STAFF_ROLES.includes(staff_role as StaffRole)) {
        return NextResponse.json(
          { error: `Invalid staff_role. Must be one of: ${STAFF_ROLES.join(', ')}, or null` },
          { status: 400 },
        );
      }
      updates.staff_role = staff_role;
    }

    if (can_teach !== undefined) {
      if (typeof can_teach !== 'boolean') {
        return NextResponse.json({ error: 'can_teach must be a boolean' }, { status: 400 });
      }
      updates.can_teach = can_teach;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Provide at least one of user_type, staff_role or can_teach' },
        { status: 400 },
      );
    }

    // Self-demotion guard, now covering the Nexus tier as well as user_type.
    // Without the staff_role half, the only admin could drop themselves to
    // manager and lock everyone out of the control panel.
    if (userId === caller.id) {
      if (updates.user_type !== undefined && updates.user_type !== 'admin') {
        return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
      }
      if (updates.staff_role !== undefined && updates.staff_role !== 'admin') {
        return NextResponse.json(
          { error: 'Cannot remove your own admin access' },
          { status: 400 },
        );
      }
    }

    // Previous values, so the audit records what actually changed.
    const { data: before } = await supabase
      .from('users')
      .select('user_type, staff_role, can_teach')
      .eq('id', userId)
      .maybeSingle();

    if (!before) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, name, email, user_type, staff_role, can_teach')
      .single();

    if (error) throw error;

    // Audit each changed field. Best-effort: a failed history write must not make
    // a successful role change look like it failed.
    for (const field of ['user_type', 'staff_role', 'can_teach'] as const) {
      if (updates[field] === undefined) continue;
      if ((before as any)[field] === updates[field]) continue;
      try {
        await recordUserHistory(
          supabase,
          userId,
          field,
          (before as any)[field] === null ? null : String((before as any)[field]),
          updates[field] === null ? null : String(updates[field]),
          caller.id,
        );
      } catch (auditErr) {
        console.error(`[admin/users] audit write failed for ${field}:`, auditErr);
      }
    }

    return NextResponse.json({ user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user';
    console.error('Admin update user error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
