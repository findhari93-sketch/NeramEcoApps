export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';

/**
 * GET /api/auth/me - Resolve the signed-in Microsoft staff member to their
 * Supabase user record.
 *
 * Requires `Authorization: Bearer <Microsoft access token>`. The identity comes
 * from verifying that token against Graph, NOT from the request.
 *
 * Two deliberate changes from the original implementation, both security fixes:
 *
 *  1. Identity used to be read from `msOid` / `email` QUERY PARAMETERS. Those are
 *     supplied by the caller, so the endpoint would resolve, and link, whatever
 *     identity was asked for.
 *
 *  2. When no user matched, it INSERTED a new row with `user_type: 'admin'`.
 *     Combined with (1) that meant an unauthenticated GET could mint a full
 *     admin account for an arbitrary email. Auto-provisioning is removed: an
 *     unknown caller now gets a 403, and a real new staff member is added
 *     deliberately by an existing admin.
 *
 * Returns 403 (not 404) for a verified Microsoft user with no admin record, so
 * the client can tell "you are signed in but not authorised here" from "the
 * lookup failed".
 */
export async function GET(request: NextRequest) {
  let caller;
  try {
    caller = await verifyMsToken(request.headers.get('Authorization'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not authenticated' },
      { status: 401 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Primary lookup: the Microsoft object id from the verified token.
    const { data: byOid, error: oidError } = await (supabase as any)
      .from('users')
      .select('id, name, first_name, last_name, email, ms_oid, user_type')
      .eq('ms_oid', caller.oid)
      .maybeSingle();

    if (oidError) {
      console.error('Supabase error looking up user by ms_oid:', oidError);
      return NextResponse.json({ error: 'Database connection error' }, { status: 500 });
    }

    let record = byOid;

    // Fallback: match on the token's own email (never a caller-supplied one) and
    // backfill ms_oid so the next sign-in takes the primary path.
    //
    // Microsoft preserves admin-set UPN casing while PostgREST `eq` is
    // case-sensitive, so compare case-insensitively. The escape guards the LIKE
    // metacharacters that appear in real addresses.
    if (!record && caller.email) {
      const pattern = caller.email.replace(/([%_\\])/g, '\\$1');
      const { data: byEmail, error: emailError } = await (supabase as any)
        .from('users')
        .select('id, name, first_name, last_name, email, ms_oid, user_type')
        .ilike('email', pattern)
        .maybeSingle();

      if (emailError) {
        console.error('Supabase error looking up user by email:', emailError);
        return NextResponse.json({ error: 'Database connection error' }, { status: 500 });
      }

      if (byEmail) {
        if (!byEmail.ms_oid) {
          await (supabase as any)
            .from('users')
            .update({ ms_oid: caller.oid })
            .eq('id', byEmail.id);
        }
        record = byEmail;
      }
    }

    if (!record) {
      return NextResponse.json(
        {
          error:
            'Your Microsoft account is not set up for the admin dashboard. Ask an administrator to add you.',
        },
        { status: 403 },
      );
    }

    // The admin dashboard is for staff. AdminGuard also checks this client-side,
    // but the server must not hand a session to a student who reaches the URL.
    if (!['admin', 'teacher'].includes(record.user_type)) {
      return NextResponse.json(
        { error: 'This account does not have access to the admin dashboard.' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      user: {
        id: record.id,
        name:
          record.name ||
          [record.first_name, record.last_name].filter(Boolean).join(' ') ||
          'Admin',
        email: record.email,
        user_type: record.user_type,
      },
    });
  } catch (error: any) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resolve admin user' },
      { status: 500 },
    );
  }
}
