// @ts-nocheck - callback_requests demo columns are newer than the generated Database type
/**
 * Demo follow-ups (spec 2026-10-15): callback_requests rows with query_type
 * post_demo / demo_rebook, so the admin Follow-ups queue, badge and timeline
 * see them. Rules live in utils/demo-follow-up.ts.
 */
import { getSupabaseAdminClient, type TypedSupabaseClient } from '../client';
import { resolveDemoSettings } from '../utils/demo-schedule';
import {
  applyFollowUpOutcome,
  resolveFollowUpOwnerId,
  DEMO_FOLLOW_UP_KINDS,
  JOINED_PAYMENT_GRACE_DAYS,
  type DemoFollowUpKind,
  type FollowUpOutcome,
  type InterestLevel,
} from '../utils/demo-follow-up';

export interface DemoFollowUpRow {
  id: string;
  user_id: string;
  status: string;
  query_type: string;
  scheduled_callback_at: string | null;
  interest_level: InterestLevel | null;
  flags: string[];
  call_outcome: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  demo_registration_id: string | null;
  notes: string | null;
}

const OPEN = ['pending', 'scheduled', 'attempted'];
const COLS =
  'id, user_id, status, query_type, scheduled_callback_at, interest_level, flags, call_outcome, completed_at, assigned_to, demo_registration_id, notes';

export async function resolveDemoFollowUpOwner(userId: string, client?: TypedSupabaseClient): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();
  const [{ data: person }, { data: settingsRow }] = await Promise.all([
    supabase.from('users').select('crm_owner_id').eq('id', userId).maybeSingle(),
    supabase.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle(),
  ]);
  const s = resolveDemoSettings(settingsRow?.value);
  const upns = [...s.followUpOwnerUpns, ...(s.followUpManagerUpn ? [s.followUpManagerUpn] : [])];
  const ids = person?.crm_owner_id ? [person.crm_owner_id] : [];
  // users.email keeps Microsoft's casing (TamilSelvan@...), settings are lowercase: ilike, never eq/in.
  const { data: staff } = await supabase
    .from('users')
    .select('id, email, is_disabled')
    .or([...upns.map((u) => `email.ilike.${u}`), ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])].join(',') || 'id.is.null');
  const staffByUpn: Record<string, { id: string; active: boolean }> = {};
  let crmOwnerActive = false;
  const wanted = new Set(upns.map((u) => u.toLowerCase()));
  for (const u of staff || []) {
    // ilike treats _ and % as wildcards: only exact (case-insensitive) UPN matches count.
    if (u.email && wanted.has(u.email.toLowerCase())) staffByUpn[u.email.toLowerCase()] = { id: u.id, active: !u.is_disabled };
    if (u.id === person?.crm_owner_id) crmOwnerActive = !u.is_disabled;
  }
  return resolveFollowUpOwnerId({
    crmOwnerId: person?.crm_owner_id ?? null,
    crmOwnerActive,
    ownerOrder: s.followUpOwnerUpns,
    managerUpn: s.followUpManagerUpn,
    staffByUpn,
  });
}

export async function getOpenDemoFollowUp(userId: string, client?: TypedSupabaseClient): Promise<DemoFollowUpRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('callback_requests')
    .select(COLS)
    .eq('user_id', userId)
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .in('status', OPEN)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Create the person's open demo follow-up, or move the one already open. */
export async function openDemoFollowUp(
  input: {
    userId: string;
    demoRegistrationId: string;
    kind: DemoFollowUpKind;
    dueAt: Date;
    interest?: InterestLevel | null;
    note?: string | null;
    actorId: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ id: string; created: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await getOpenDemoFollowUp(input.userId, supabase);
  const base = {
    query_type: input.kind,
    demo_registration_id: input.demoRegistrationId,
    status: 'scheduled',
    scheduled_at: input.dueAt.toISOString(),
    scheduled_callback_at: input.dueAt.toISOString(),
    ...(input.interest ? { interest_level: input.interest } : {}),
    ...(input.note ? { notes: input.note } : {}),
  };
  if (existing) {
    const { error } = await supabase.from('callback_requests').update(base).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }
  const [{ data: person }, ownerId] = await Promise.all([
    supabase.from('users').select('name, phone, email').eq('id', input.userId).single(),
    resolveDemoFollowUpOwner(input.userId, supabase),
  ]);
  const { data, error } = await supabase
    .from('callback_requests')
    .insert({
      ...base,
      user_id: input.userId,
      name: person?.name || 'Unknown',
      phone: person?.phone || '',
      email: person?.email ?? null,
      assigned_to: ownerId,
      timezone: 'Asia/Kolkata',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

export async function logDemoFollowUpOutcome(
  input: {
    callbackId: string;
    outcome: FollowUpOutcome;
    nextAt?: string | null;
    note?: string | null;
    reason?: string | null;
    interest?: InterestLevel | null;
    admin: { id: string; name: string };
  },
  client?: TypedSupabaseClient,
): Promise<{ error?: string }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error: rowErr } = await supabase.from('callback_requests').select(COLS + ', attempt_count').eq('id', input.callbackId).maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) return { error: 'Follow-up not found.' };
  const { data: attempts, error: attemptsErr } = await supabase
    .from('callback_attempts')
    .select('outcome')
    .eq('callback_request_id', row.id)
    .order('attempted_at', { ascending: false })
    .limit(5);
  if (attemptsErr) throw attemptsErr;
  const now = new Date();
  const result = applyFollowUpOutcome({
    outcome: input.outcome,
    nextAt: input.nextAt,
    reason: input.reason,
    now,
    recent: (attempts || []).map((a) => String(a.outcome)),
  });
  if ('error' in result) return { error: result.error };

  const comment = [input.reason ? `Reason: ${input.reason}` : null, input.note || null, input.interest ? `Interest: ${input.interest}` : null]
    .filter(Boolean)
    .join('. ');
  const { error: attemptErr } = await supabase.from('callback_attempts').insert({
    callback_request_id: row.id,
    user_id: row.user_id,
    admin_id: input.admin.id,
    admin_name: input.admin.name,
    outcome: result.attemptOutcome,
    comments: comment || null,
    rescheduled_to: result.scheduledAt,
  });
  if (attemptErr) throw attemptErr;

  const flags = new Set(row.flags || []);
  result.addFlags.forEach((f) => flags.add(f));
  result.removeFlags.forEach((f) => flags.delete(f));
  const { error } = await supabase
    .from('callback_requests')
    .update({
      status: result.status,
      scheduled_callback_at: result.scheduledAt ?? row.scheduled_callback_at,
      call_outcome: result.attemptOutcome,
      call_notes: comment || null,
      last_attempt_at: now.toISOString(),
      attempt_count: (row.attempt_count || 0) + 1,
      flags: Array.from(flags),
      ...(input.interest ? { interest_level: input.interest } : {}),
      ...(result.status === 'completed' ? { completed_at: now.toISOString() } : {}),
    })
    .eq('id', row.id);
  if (error) throw error;
  return {};
}

/** Enrolment happened: open demo follow-ups close as Joined. Returns how many. */
export async function closeDemoFollowUpsOnEnrol(userId: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('callback_requests')
    .update({ status: 'completed', call_outcome: 'joined', completed_at: now, flags: [] })
    .eq('user_id', userId)
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .or(`status.in.(${OPEN.join(',')}),and(status.eq.completed,call_outcome.eq.joined)`)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * Nightly: close open demo follow-ups of people who enrolled by any path, and
 * reopen "Joined" marked by hand 14+ days ago with no student profile.
 */
export async function sweepDemoFollowUps(now: Date, client?: TypedSupabaseClient): Promise<{ closed: number; reopened: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: open, error: openErr } = await supabase
    .from('callback_requests')
    .select('id, user_id, status, call_outcome, completed_at, flags')
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .or(`status.in.(${OPEN.join(',')}),and(status.eq.completed,call_outcome.eq.joined)`)
    .not('user_id', 'is', null)
    .limit(2000);
  if (openErr) throw openErr;
  const userIds = Array.from(new Set((open || []).map((r) => r.user_id)));
  const enrolled = new Set<string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data, error: profErr } = await supabase.from('student_profiles').select('user_id').in('user_id', userIds.slice(i, i + 200));
    if (profErr) throw profErr;
    (data || []).forEach((d) => enrolled.add(d.user_id));
  }
  let closed = 0;
  let reopened = 0;
  const cutoff = now.getTime() - JOINED_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  for (const r of open || []) {
    if (enrolled.has(r.user_id)) {
      if (r.status !== 'completed' || (r.flags || []).length) {
        closed += await closeDemoFollowUpsOnEnrol(r.user_id, supabase);
      }
    } else if (r.status === 'completed' && r.call_outcome === 'joined' && r.completed_at && new Date(r.completed_at).getTime() < cutoff) {
      const { error: reopenErr } = await supabase
        .from('callback_requests')
        .update({ status: 'scheduled', scheduled_callback_at: now.toISOString(), flags: Array.from(new Set([...(r.flags || []), 'payment_pending'])) })
        .eq('id', r.id);
      if (reopenErr) throw reopenErr;
      reopened++;
    }
  }
  return { closed, reopened };
}

/** Latest demo follow-up per demo request, for the desk's Done tab. */
export async function listDemoFollowUpsByDemo(demoIds: string[], client?: TypedSupabaseClient): Promise<Record<string, DemoFollowUpRow>> {
  if (!demoIds.length) return {};
  const supabase = client || getSupabaseAdminClient();
  const out: Record<string, DemoFollowUpRow> = {};
  // Chunk the id list so the GET URL stays short. A demo id lives in exactly one chunk,
  // and rows come newest first, so the first row seen per demo is its latest.
  for (let i = 0; i < demoIds.length; i += 100) {
    const { data, error } = await supabase
      .from('callback_requests')
      .select(COLS)
      .in('demo_registration_id', demoIds.slice(i, i + 100))
      .order('created_at', { ascending: false });
    if (error) throw error;
    for (const r of data || []) if (r.demo_registration_id && !out[r.demo_registration_id]) out[r.demo_registration_id] = r;
  }
  return out;
}
