import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { hashPassword } from '@/lib/parent-password';
import { generateTempPassword } from '@/lib/parent-credentials';

/**
 * PATCH  /api/parent/access/[parentUserId]   { action: 'regenerate' | 'revoke' | 'restore' }
 * DELETE /api/parent/access/[parentUserId]   same as action: 'revoke'
 *
 * Every action here bumps token_version, which is what makes them take effect
 * on the parent's very next request rather than whenever their 12-hour token
 * happens to expire. Without that bump, "Revoke" would be a promise the system
 * could not keep for up to half a day.
 *
 * Node runtime required (crypto.scrypt).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { parentUserId: string } }
) {
  try {
    // Full Authorization header, not the bare token: getRequestUser passes it
    // straight to verifyMsToken, which requires the "Bearer " prefix.
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'structure.enrollment.add');

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (!['regenerate', 'revoke', 'restore'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be regenerate, revoke or restore' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: cred } = await supabase
      .from('nexus_parent_credentials')
      .select('id, parent_user_id, login_id, token_version')
      .eq('parent_user_id', params.parentUserId)
      .maybeSingle();

    if (!cred) {
      return NextResponse.json({ error: 'Parent access not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const nextVersion = (cred.token_version || 1) + 1;

    if (action === 'regenerate') {
      const tempPassword = generateTempPassword();
      const { error } = await supabase
        .from('nexus_parent_credentials')
        .update({
          password_hash: await hashPassword(tempPassword),
          // Back to a one-time password, so the parent must choose a new one.
          must_change_password: true,
          token_version: nextVersion,
          password_set_at: now,
          // A regenerate is also the way staff release a locked-out parent.
          failed_attempts: 0,
          locked_until: null,
          is_active: true,
          revoked_at: null,
          revoked_by: null,
          updated_at: now,
        })
        .eq('id', cred.id);

      if (error) throw new Error(error.message);

      return NextResponse.json({
        loginId: cred.login_id,
        // Shown once, exactly as at creation.
        tempPassword,
      });
    }

    if (action === 'revoke') {
      const { error } = await supabase
        .from('nexus_parent_credentials')
        .update({
          is_active: false,
          revoked_at: now,
          revoked_by: user.id,
          token_version: nextVersion,
          updated_at: now,
        })
        .eq('id', cred.id);

      if (error) throw new Error(error.message);

      // Deactivate the link too, so listParentChildren stops returning the child
      // even if the credential row is later reactivated by hand.
      await supabase
        .from('nexus_parent_links')
        .update({ is_active: false, revoked_at: now, revoked_by: user.id, updated_at: now })
        .eq('parent_user_id', params.parentUserId);

      return NextResponse.json({ ok: true, revokedAt: now });
    }

    // restore
    const { error } = await supabase
      .from('nexus_parent_credentials')
      .update({
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        token_version: nextVersion,
        failed_attempts: 0,
        locked_until: null,
        updated_at: now,
      })
      .eq('id', cred.id);

    if (error) throw new Error(error.message);

    await supabase
      .from('nexus_parent_links')
      .update({ is_active: true, revoked_at: null, revoked_by: null, updated_at: now })
      .eq('parent_user_id', params.parentUserId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Could not update parent access');
  }
}

// No DELETE handler on purpose. Revoking is reversible (see action: 'restore')
// and keeps the audit trail of who did it and when, so exposing a verb that
// reads as "destroy" would misdescribe what actually happens. The UI uses
// PATCH { action: 'revoke' }.
