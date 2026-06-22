import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { verifyImpersonationToken } from '@/lib/impersonation-token';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/auth/impersonate/end
 *
 * Best-effort: stamp ended_at on the open impersonation session(s) for the
 * (impersonator, student) pair encoded in the impersonation token. The client
 * calls this while still holding the impersonation token, just before clearing
 * its local state. A valid signed token is sufficient proof; no extra auth.
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    const payload = verifyImpersonationToken(token);

    // If the token is missing/expired/invalid there is nothing to close; the
    // session will simply remain open in the log. Don't error the client exit.
    if (!payload) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseAdminClient();
    // Cast: nexus_impersonation_sessions is a new table not yet in the generated
    // Supabase types. Run `pnpm supabase:gen:types` after the migration applies.
    await (supabase as any)
      .from('nexus_impersonation_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('impersonator_id', payload.impersonatorUserId)
      .eq('student_id', payload.targetUserId)
      .is('ended_at', null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Impersonate end error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: true });
  }
}
