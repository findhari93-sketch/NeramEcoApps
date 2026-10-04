import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, upsertNexusSetting } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { ApiError, describeError } from '@/lib/api-errors';
import { todayIst } from '@/lib/assistant/format';
import {
  DAILY_LIMIT_KEY,
  clampDailyLimit,
  loadAiAccess,
  teacherAccessLine,
  type OverrideRow,
} from '@/lib/assistant/ai-access';
import { loadAssistantMonthUsage } from '@/lib/assistant/usage';

/**
 * The admin Neram Assistant section: the daily AI-question allowance, what each
 * student has used this month, and the teacher overrides in force. Gated on
 * system.settings, like the rest of the AI usage page.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The allowance as the admin set it. A read error throws (the generic 500), never a quiet 0; a missing row is the default. */
async function readAllowance(supabase: any): Promise<number> {
  const { data, error } = await supabase.from('nexus_settings').select('value').eq('key', DAILY_LIMIT_KEY).maybeSingle();
  if (error) throw error;
  return clampDailyLimit(data?.value);
}

/** 401 when no valid token, 403 when not system.settings; otherwise the admin's users row. */
async function authorise(request: NextRequest, supabase: any): Promise<{ id: string }> {
  let msUser: Awaited<ReturnType<typeof verifyMsToken>>;
  try {
    msUser = await verifyMsToken(request.headers.get('Authorization'));
  } catch {
    throw new ApiError('Unauthorized', 401);
  }
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || !canUser(user, 'system.settings')) throw new ApiError('Forbidden', 403);
  return user;
}

function failure(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
  }
  // Raw database text names our tables and columns: log it, never return it.
  console.error('[ai-usage assistant]', describeError(err));
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    await authorise(request, supabase);

    const now = new Date();
    const monthStart = `${todayIst(now).slice(0, 8)}01`;
    const sinceIso = new Date(`${monthStart}T00:00:00+05:30`).toISOString();
    const [dailyLimit, usage, { data: overrideRows, error: overrideError }] = await Promise.all([
      readAllowance(supabase),
      loadAssistantMonthUsage(supabase, sinceIso),
      supabase.from('nexus_assistant_ai_overrides').select('*').is('cleared_at', null).order('set_at', { ascending: false }).limit(200),
    ]);
    if (overrideError) throw overrideError;
    // Access in teacher words for the top 50 by cost, five at a time: each is a catch-up read.
    const top = usage.slice(0, 50);
    const access: string[] = [];
    for (let i = 0; i < top.length; i += 5) {
      const lines = await Promise.all(top.slice(i, i + 5).map((s) => loadAiAccess(supabase, s.studentId, now).then(teacherAccessLine).catch(() => 'Could not check.')));
      access.push(...lines);
    }
    const today = todayIst(now);
    const live = ((overrideRows || []) as OverrideRow[]).filter((o) => !o.ends_on || o.ends_on >= today);
    const peopleIds = [...new Set(live.flatMap((o) => [o.student_id, o.set_by].filter(Boolean) as string[]))];
    const { data: people } = peopleIds.length ? await supabase.from('users').select('id, name').in('id', peopleIds.slice(0, 200)) : { data: [] };
    const nameOf = (id: string | null) => (people || []).find((p: { id: string }) => p.id === id)?.name ?? null;
    return NextResponse.json({
      dailyLimit,
      students: top.map((s, i) => ({ ...s, access: access[i] })),
      overrides: live.map((o) => ({ studentId: o.student_id, studentName: nameOf(o.student_id), mode: o.mode, reason: o.reason, setByName: nameOf(o.set_by), setAt: o.set_at, endsOn: o.ends_on })),
    }, { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const user = await authorise(request, supabase);

    const body = await request.json().catch(() => ({}));
    if (typeof body?.dailyLimit !== 'number') {
      return NextResponse.json({ error: 'dailyLimit must be a number from 0 to 50.' }, { status: 400, headers: NO_STORE });
    }
    const dailyLimit = clampDailyLimit(body.dailyLimit);
    await upsertNexusSetting(DAILY_LIMIT_KEY, dailyLimit, user.id);
    return NextResponse.json({ dailyLimit }, { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}
