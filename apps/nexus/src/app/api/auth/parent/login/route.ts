import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import {
  verifyPassword,
  burnPasswordTime,
  nextLockoutState,
  isLockedOut,
} from '@/lib/parent-password';
import { normalizeLoginId } from '@/lib/parent-credentials';
import { signParentToken } from '@/lib/parent-token';
import { listParentChildren } from '@/lib/parent-auth';

/**
 * POST /api/auth/parent/login
 *
 * The parent portal's front door. Parents have no Microsoft account: staff issue
 * them a login id and a one-time password, and this exchanges those for a signed
 * `par_` session token that verifyMsToken understands.
 *
 * This route MUST stay on the Node runtime. It uses crypto.scrypt, which does
 * not exist on the edge runtime. No Nexus route sets `runtime = 'edge'` today;
 * do not make this the first.
 *
 * Unauthenticated by definition, so it carries its own abuse controls:
 * a per-IP throttle and a per-account lockout, both backed by the database
 * because serverless functions share no memory and an in-process limiter would
 * reset on every cold start.
 */

/** Per-IP ceiling: attempts allowed inside the window before a hard 429. */
const IP_ATTEMPT_LIMIT = 20;
const IP_WINDOW_MINUTES = 15;

/**
 * The one message returned for "no such login id" AND for "wrong password".
 * Distinguishing them would let anyone enumerate which parent logins exist.
 */
const GENERIC_FAILURE = 'That login ID or password is not correct.';

/** Never store a raw IP. The hash is only ever compared to other hashes. */
function hashIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('base64url');
}

async function recordAttempt(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  fields: { login_id: string | null; ip_hash: string | null; success: boolean; user_agent: string | null }
): Promise<void> {
  // Never let audit logging break a login.
  await supabase
    .from('nexus_parent_login_attempts')
    .insert(fields)
    .then(undefined, () => undefined);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  const ipHash = hashIp(request);
  const userAgent = request.headers.get('user-agent')?.slice(0, 400) || null;

  try {
    // Fail loudly and specifically when the signing secret is missing, rather
    // than letting signParentToken throw at the end and collapse into a generic
    // "Sign-in failed". Without this, a deploy that forgot the env var looks
    // exactly like a wrong password, and staff would spend the afternoon
    // reissuing passwords that were never the problem.
    if (!process.env.PARENT_SESSION_SECRET) {
      console.error('PARENT_SESSION_SECRET is not configured: parent sign-in is disabled.');
      return NextResponse.json(
        {
          error:
            'Parent sign-in is not available yet. Please contact the Neram office.',
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const loginId = normalizeLoginId(body?.loginId);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!loginId || !password) {
      return NextResponse.json(
        { error: 'Enter both your login ID and your password.' },
        { status: 400 }
      );
    }

    // 1. Per-IP throttle FIRST, so a spray across many login ids is stopped
    //    before it can lock out a queue of real parents.
    if (ipHash) {
      const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('nexus_parent_login_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .eq('success', false)
        .gte('attempted_at', since);

      if ((count ?? 0) >= IP_ATTEMPT_LIMIT) {
        return NextResponse.json(
          {
            error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
            retryAfter: IP_WINDOW_MINUTES * 60,
          },
          { status: 429, headers: { 'Retry-After': String(IP_WINDOW_MINUTES * 60) } }
        );
      }
    }

    const { data: cred } = await supabase
      .from('nexus_parent_credentials')
      // Single literal string: PostgREST parses the select at compile time, and
      // concatenation widens it to `string`, losing all row typing.
      .select(
        'id, parent_user_id, login_id, password_hash, must_change_password, token_version, is_active, failed_attempts, locked_until, parent:users!nexus_parent_credentials_parent_user_id_fkey(id, name, ms_oid)'
      )
      .eq('login_id', loginId)
      .maybeSingle();

    // 2. Unknown login id. Spend the same CPU a real verification would, so the
    //    response time cannot be used to tell valid ids from invalid ones.
    if (!cred) {
      await burnPasswordTime();
      await recordAttempt(supabase, {
        login_id: loginId,
        ip_hash: ipHash,
        success: false,
        user_agent: userAgent,
      });
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
    }

    const now = new Date();

    // 3. Account lockout, checked before the password so a locked account does
    //    not keep burning scrypt cycles.
    const lock = isLockedOut(
      { failed_attempts: cred.failed_attempts, locked_until: cred.locked_until },
      now
    );
    if (lock.locked) {
      await recordAttempt(supabase, {
        login_id: loginId,
        ip_hash: ipHash,
        success: false,
        user_agent: userAgent,
      });
      const minutes = Math.ceil(lock.retryAfterSeconds / 60);
      return NextResponse.json(
        {
          error: `Too many incorrect attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          retryAfter: lock.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } }
      );
    }

    // 4. Revoked access is a distinct message: this parent had a working login
    //    and needs to call the office, not keep guessing their password.
    if (cred.is_active !== true) {
      await recordAttempt(supabase, {
        login_id: loginId,
        ip_hash: ipHash,
        success: false,
        user_agent: userAgent,
      });
      return NextResponse.json(
        { error: 'This parent login has been disabled. Please contact the Neram office.' },
        { status: 403 }
      );
    }

    const parent = cred.parent as unknown as {
      id: string;
      name: string | null;
      ms_oid: string | null;
    } | null;

    if (!parent?.ms_oid) {
      // A credential row whose user row is missing or was never given a
      // synthetic ms_oid cannot produce a resolvable session.
      await recordAttempt(supabase, {
        login_id: loginId,
        ip_hash: ipHash,
        success: false,
        user_agent: userAgent,
      });
      return NextResponse.json(
        { error: 'This parent login is not set up correctly. Please contact the Neram office.' },
        { status: 403 }
      );
    }

    // 5. The actual check.
    const ok = await verifyPassword(password, cred.password_hash);

    if (!ok) {
      const next = nextLockoutState(
        { failed_attempts: cred.failed_attempts, locked_until: cred.locked_until },
        'failure',
        now
      );
      await supabase
        .from('nexus_parent_credentials')
        .update({ ...next, updated_at: now.toISOString() })
        .eq('id', cred.id);

      await recordAttempt(supabase, {
        login_id: loginId,
        ip_hash: ipHash,
        success: false,
        user_agent: userAgent,
      });
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
    }

    // 6. Success: clear the counters and mint the session.
    const reset = nextLockoutState(
      { failed_attempts: cred.failed_attempts, locked_until: cred.locked_until },
      'success',
      now
    );
    await supabase
      .from('nexus_parent_credentials')
      .update({
        ...reset,
        last_login_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', cred.id);

    await recordAttempt(supabase, {
      login_id: loginId,
      ip_hash: ipHash,
      success: true,
      user_agent: userAgent,
    });

    const { token, expiresAt } = signParentToken({
      parentUserId: parent.id,
      parentMsOid: parent.ms_oid,
      tokenVersion: cred.token_version,
      mustChangePassword: !!cred.must_change_password,
    });

    // Shown on the login screen so a parent immediately sees whose account this
    // is. Safe to expose: they have just proved they hold the password.
    const children = await listParentChildren(parent.id).catch(() => []);

    return NextResponse.json({
      token,
      expiresAt,
      mustChangePassword: !!cred.must_change_password,
      parent: { id: parent.id, name: parent.name },
      children: children.map((c) => ({ id: c.id, name: c.name, avatar_url: c.avatar_url })),
    });
  } catch (err) {
    console.error('Parent login error:', err instanceof Error ? err.message : err);
    // Never leak an internal message from an unauthenticated endpoint.
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
