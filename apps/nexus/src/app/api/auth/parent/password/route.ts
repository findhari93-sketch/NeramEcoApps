import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getParentUser } from '@/lib/parent-auth';
import { errorResponse } from '@/lib/api-errors';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '@/lib/parent-password';
import { signParentToken } from '@/lib/parent-token';

/**
 * POST /api/auth/parent/password
 *
 * Change the signed-in parent's password. This is the ONLY route that accepts a
 * parent who still owes us a password change, which is what makes the forced
 * first-login change a server-side rule rather than a client redirect anyone
 * could skip with curl.
 *
 * Bumping token_version invalidates every other live session for this parent,
 * so a password change is also "sign out my other devices". A freshly minted
 * token comes back in the response so the parent doing the change is not logged
 * out by their own action.
 *
 * Node runtime required (crypto.scrypt).
 */
export async function POST(request: NextRequest) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'), {
      allowPasswordChangePending: true,
    });

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Enter your current password and your new password.' },
        { status: 400 }
      );
    }

    const policyError = validatePasswordPolicy(newPassword, parent.loginId);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'Your new password must be different from your current one.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: cred } = await supabase
      .from('nexus_parent_credentials')
      .select(
        'id, password_hash, token_version, parent:users!nexus_parent_credentials_parent_user_id_fkey(ms_oid)'
      )
      .eq('parent_user_id', parent.id)
      .maybeSingle();

    if (!cred) {
      return NextResponse.json({ error: 'Parent account is no longer valid' }, { status: 401 });
    }

    const ok = await verifyPassword(currentPassword, cred.password_hash);
    if (!ok) {
      // Deliberately NOT counted towards the login lockout: this caller already
      // holds a valid session, and locking them out here would strand a parent
      // who simply mistyped, with no way back in.
      return NextResponse.json(
        { error: 'Your current password is not correct.' },
        { status: 401 }
      );
    }

    const nextVersion = (cred.token_version || 1) + 1;
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('nexus_parent_credentials')
      .update({
        password_hash: await hashPassword(newPassword),
        must_change_password: false,
        token_version: nextVersion,
        password_set_at: now,
        failed_attempts: 0,
        locked_until: null,
        updated_at: now,
      })
      .eq('id', cred.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const msOid = (cred.parent as unknown as { ms_oid: string | null } | null)?.ms_oid;
    if (!msOid) {
      return NextResponse.json({ error: 'Parent account is no longer valid' }, { status: 401 });
    }

    // Re-mint at the new version, or the caller's own token would be rejected on
    // their very next request.
    const { token, expiresAt } = signParentToken({
      parentUserId: parent.id,
      parentMsOid: msOid,
      tokenVersion: nextVersion,
      mustChangePassword: false,
    });

    return NextResponse.json({ token, expiresAt, mustChangePassword: false });
  } catch (err) {
    return errorResponse(err, 'Could not change the password');
  }
}
