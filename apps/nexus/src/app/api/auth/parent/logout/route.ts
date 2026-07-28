import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getParentUser } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/auth/parent/logout
 *
 * Ends every live session for this parent by bumping token_version, so "sign
 * out" really means signed out everywhere rather than only clearing this
 * browser's localStorage.
 *
 * That matters more here than it would for staff: parents share devices with
 * their children, and a child who can reopen the parent portal by pressing Back
 * defeats the point of a separate login.
 *
 * Allows a parent who has not yet set their password: being unable to sign out
 * of a half-finished session would be its own trap.
 */
export async function POST(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'), {
      allowPasswordChangePending: true,
    });

    const supabase = getSupabaseAdminClient();
    const { data: cred } = await supabase
      .from('nexus_parent_credentials')
      .select('id, token_version')
      .eq('parent_user_id', parent.id)
      .maybeSingle();

    if (cred) {
      await supabase
        .from('nexus_parent_credentials')
        .update({
          token_version: (cred.token_version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Could not sign out');
  }
}
