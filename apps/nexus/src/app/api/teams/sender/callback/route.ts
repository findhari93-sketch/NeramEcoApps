import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import type { RequestUser } from '@/lib/study-materials';
import {
  SENDER_STATE_COOKIE,
  exchangeSenderCode,
  fetchSenderIdentity,
  senderAppConfig,
  senderRedirectUri,
  verifySenderState,
} from '@/lib/teams-sender';

/**
 * GET /api/teams/sender/callback   (Microsoft's redirect back)
 *
 * Arrives with no Nexus bearer token, so the signed cookie from /start is the
 * proof: it names the teacher and classroom, and must match `state`. Before the
 * connection is stored, the account that signed in must BE that teacher (same
 * Microsoft object id), and they must still teach the classroom. Otherwise a
 * teacher signed into a personal or shared account would send reminders as the
 * wrong person.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const cfg = senderAppConfig();
  const state = cfg ? verifySenderState(request.cookies.get(SENDER_STATE_COOKIE)?.value, cfg.clientSecret) : null;
  const back = (params: Record<string, string>) => {
    const target = new URL(state?.r || '/teacher/sketchbook?view=rhythm', url.origin);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    const res = NextResponse.redirect(target, 302);
    res.cookies.delete(SENDER_STATE_COOKIE);
    return res;
  };
  const fail = (reason: string) => back({ teams: 'error', reason });

  if (!cfg) return fail('not_configured');
  const msError = url.searchParams.get('error');
  if (msError) return fail(msError === 'access_denied' ? 'cancelled' : msError);
  const code = url.searchParams.get('code');
  if (!state || !code || url.searchParams.get('state') !== state.s) return fail('expired');

  try {
    const tokens = await exchangeSenderCode(cfg, code, senderRedirectUri(url.origin));
    if (!tokens.refreshToken) return fail('no_refresh_token');
    if (!/ChatMessage\.Send/i.test(tokens.scope)) return fail('missing_chat_permission');

    const identity = await fetchSenderIdentity(tokens.accessToken);
    if (!identity) return fail('identity');

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, student_program, name, staff_role, can_teach, ms_oid')
      .eq('id', state.u)
      .maybeSingle();
    if (!user) return fail('identity');
    if (!user.ms_oid || user.ms_oid !== identity.oid) return fail('wrong_account');

    const mine = await staffClassroomIds(user as RequestUser);
    if (!mine.includes(state.c)) return fail('not_your_class');

    const now = new Date().toISOString();
    const { error: senderError } = await supabase.from('nexus_teams_senders').upsert(
      {
        user_id: user.id,
        ms_oid: identity.oid,
        display_name: identity.name || user.name,
        upn: identity.upn,
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
        access_token_expires_at: tokens.expiresAt,
        scope: tokens.scope,
        connected_at: now,
        last_refreshed_at: now,
        last_error: null,
        revoked_at: null,
      },
      { onConflict: 'user_id' },
    );
    if (senderError) return fail('store_failed');

    const { error: roomError } = await supabase
      .from('nexus_classrooms')
      .update({ reminder_sender_id: user.id })
      .eq('id', state.c);
    if (roomError) return fail('store_failed');

    return back({ teams: 'connected' });
  } catch (err) {
    console.error('[teams-sender/callback]', err);
    return fail('exchange_failed');
  }
}
