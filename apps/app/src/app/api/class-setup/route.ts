export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getUserByFirebaseUid } from '@neram/database';
import { readPasswordTimes, startPassword } from '@neram/auth/student-accounts';
import {
  GUIDE_STEP_KEYS,
  SELF_TICK_STEPS,
  getWhatsAppGroupLinkForUser,
  guideProgress,
  type GuideStepKey,
} from '@neram/database/class-account';
import { verifyIdToken } from '@/lib/firebase-admin';

const NEXUS_URL = 'https://nexus.neramclasses.com';
/** A change within this long of creation or a reset is Microsoft setting the start password, not the student. */
const SET_BY_US_MS = 2 * 60 * 1000;

async function signedInUserId(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const decoded = await verifyIdToken(header.slice(7));
    const user = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Has the student chosen their own password? Asked of Microsoft once per visit
 * until it says yes, then remembered, so the start password stops showing.
 */
async function detectPasswordChange(supabase: any, setup: any): Promise<string | null> {
  if (setup.password_changed_at) return setup.password_changed_at;
  if (!setup.ms_oid) return null;
  const times = await readPasswordTimes(setup.ms_oid);
  if (!times.ok || !times.value.passwordChangedAt) return null;
  const changed = new Date(times.value.passwordChangedAt).getTime();
  const baseline = Math.max(
    ...[setup.account_created_at, setup.password_reset_at, times.value.createdAt]
      .filter(Boolean)
      .map((value: string) => new Date(value).getTime()),
  );
  if (!Number.isFinite(baseline) || changed <= baseline + SET_BY_US_MS) return null;
  await supabase
    .from('class_account_setups')
    .update({ password_changed_at: times.value.passwordChangedAt, updated_at: new Date().toISOString() })
    .eq('user_id', setup.user_id);
  return times.value.passwordChangedAt;
}

/**
 * GET: the signed-in student's setup guide. Only ever their own: the login ID,
 * the start password until they have changed it, their batch WhatsApp group,
 * and which of the five steps are done.
 */
export async function GET(request: NextRequest) {
  const userId = await signedInUserId(request);
  if (!userId) return NextResponse.json({ error: 'Sign in to see your setup.' }, { status: 401 });

  try {
    const supabase = getSupabaseAdminClient() as any;
    const [{ data: setup }, { data: user }] = await Promise.all([
      supabase.from('class_account_setups').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('users').select('name, first_name, nexus_first_login_at, photo_status').eq('id', userId).maybeSingle(),
    ]);
    const firstName = String(user?.first_name || String(user?.name || '').split(/\s+/)[0] || '').trim();

    if (!setup || setup.steps?.account?.status !== 'done') {
      return NextResponse.json(
        { success: true, data: { ready: false, firstName } },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const passwordChangedAt = await detectPasswordChange(supabase, setup).catch(() => setup.password_changed_at ?? null);
    const group = await getWhatsAppGroupLinkForUser(supabase, userId).catch(() => null);
    const progress = guideProgress({
      ticks: setup.student_ticks,
      passwordChangedAt,
      nexusFirstLoginAt: user?.nexus_first_login_at,
      photoStatus: user?.photo_status,
    });
    const showPassword = !passwordChangedAt && setup.password_mode === 'start';

    return NextResponse.json(
      {
        success: true,
        data: {
          ready: true,
          firstName,
          upn: setup.upn,
          // Derived, never stored. Only while it still works.
          password: showPassword ? startPassword(firstName) : null,
          passwordChanged: !!passwordChangedAt,
          passwordFromOffice: !passwordChangedAt && setup.password_mode === 'random',
          whatsappGroupUrl: group?.url ?? null,
          nexusUrl: NEXUS_URL,
          photoStatus: user?.photo_status ?? null,
          done: progress.done,
          count: progress.count,
          total: progress.total,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error: any) {
    console.error('[class-setup] GET failed:', error?.message);
    return NextResponse.json({ error: 'Could not load your setup. Try again.' }, { status: 500 });
  }
}

/** PATCH { step: 'whatsapp' | 'authenticator' | 'teams', done: boolean }: the student ticks a step. */
export async function PATCH(request: NextRequest) {
  const userId = await signedInUserId(request);
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const step = body?.step as GuideStepKey;
  if (!GUIDE_STEP_KEYS.includes(step) || !SELF_TICK_STEPS.includes(step)) {
    return NextResponse.json({ error: 'That step is ticked for you automatically.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: setup } = await supabase.from('class_account_setups').select('student_ticks').eq('user_id', userId).maybeSingle();
  if (!setup) return NextResponse.json({ error: 'Your class account is not ready yet.' }, { status: 404 });

  const ticks = { ...(setup.student_ticks || {}) };
  if (body?.done === false) delete ticks[step];
  else ticks[step] = new Date().toISOString();
  const { error } = await supabase
    .from('class_account_setups')
    .update({ student_ticks: ticks, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  return NextResponse.json({ success: true, data: { ticks } });
}
