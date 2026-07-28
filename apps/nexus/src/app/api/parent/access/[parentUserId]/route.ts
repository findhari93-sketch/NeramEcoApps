import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { hashPassword } from '@/lib/parent-password';
import {
  generateTempPassword,
  normalizeContactEmail,
  normalizeContactPhone,
} from '@/lib/parent-credentials';

/**
 * PATCH /api/parent/access/[parentUserId]
 *   { action: 'regenerate' | 'revoke' | 'restore' | 'update_contact' }
 *
 * Every action EXCEPT update_contact bumps token_version, which is what makes
 * them take effect on the parent's very next request rather than whenever their
 * 12-hour token happens to expire. Without that bump, "Revoke" would be a
 * promise the system could not keep for up to half a day. Correcting a digest
 * email is not a security event, so it deliberately does not sign anyone out.
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

    if (!['regenerate', 'revoke', 'restore', 'update_contact'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be regenerate, revoke, restore or update_contact' },
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

    if (action === 'update_contact') {
      // Correcting a mistyped digest address. Notably this does NOT bump
      // token_version: a parent should not be signed out because staff fixed a
      // typo in their email. Both fields are clearable by sending an empty
      // string, which is how staff remove an address that bounces.
      const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
      const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';

      const contactEmail = normalizeContactEmail(rawEmail);
      if (rawEmail && !contactEmail) {
        throw new ApiError(
          'That email address does not look right. Check it, or leave it blank.',
          400
        );
      }
      const contactPhone = normalizeContactPhone(rawPhone);
      if (rawPhone && !contactPhone) {
        throw new ApiError(
          'That phone number does not look right. Check it, or leave it blank.',
          400
        );
      }

      const { error } = await supabase
        .from('nexus_parent_credentials')
        .update({
          contact_email: contactEmail,
          contact_phone: contactPhone,
          updated_at: now,
        })
        .eq('id', cred.id);

      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true, contactEmail, contactPhone });
    }

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
