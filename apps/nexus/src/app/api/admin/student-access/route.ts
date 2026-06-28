import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/admin/student-access
 *
 * Open or close Nexus access for specific students during the 2026-27 rebuild.
 * Sets users.nexus_access_enabled, the flag the /api/auth/me gate checks.
 * Teacher/admin only (management-level), same as the onboarding-review route.
 * The control is surfaced only in the admin panel sidebar.
 *
 * Body: { studentIds: string[]; enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is teacher/admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (caller.user_type !== 'teacher' && caller.user_type !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { studentIds, enabled } = body as {
      studentIds?: unknown;
      enabled?: unknown;
    };

    if (
      !Array.isArray(studentIds) ||
      studentIds.length === 0 ||
      !studentIds.every((id) => typeof id === 'string')
    ) {
      return NextResponse.json(
        { error: 'studentIds must be a non-empty array of ids' },
        { status: 400 }
      );
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ nexus_access_enabled: enabled })
      .in('id', studentIds)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ updated: (data || []).length, enabled });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update access';
    console.error('Student access PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
