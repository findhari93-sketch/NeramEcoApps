/**
 * One "not sure yet? book a free demo" WhatsApp per unfinished application.
 *
 * A draft qualifies when it was last saved 24 to 72 hours ago (old drafts are
 * never swept up on launch day), it was never nudged, its owner has an
 * OTP-verified phone, has never asked for a demo, and has no application past
 * draft. Server-only: defaults to the service-role client.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';

const db = (client?: TypedSupabaseClient): any => client ?? getSupabaseAdminClient();

const HOUR = 60 * 60 * 1000;
export const DRAFT_NUDGE_MIN_AGE_HOURS = 24;
export const DRAFT_NUDGE_MAX_AGE_HOURS = 72;

export interface DraftDemoNudge {
  leadProfileId: string;
  userId: string;
  phone: string;
  name: string;
}

interface DraftRow {
  id: string;
  user_id: string | null;
  updated_at: string;
}

interface UserRow {
  id: string;
  phone: string | null;
  phone_verified: boolean | null;
  first_name: string | null;
  name: string | null;
}

/** The first name to greet, or a friendly fallback (Meta rejects blank parameters). */
export function draftNudgeGreeting(user: Pick<UserRow, 'first_name' | 'name'>): string {
  const first = (user.first_name || user.name || '').trim().split(/\s+/)[0] || '';
  return first || 'there';
}

/**
 * Pick the drafts to nudge and claim them (sets demo_nudge_sent_at), returning
 * only those this call claimed. A claim is never undone: a failed send is not
 * retried, so nobody gets the message twice.
 */
export async function claimDraftsForDemoNudge(
  opts: { now?: Date; limit?: number } = {},
  client?: TypedSupabaseClient,
): Promise<DraftDemoNudge[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  const newest = new Date(now.getTime() - DRAFT_NUDGE_MIN_AGE_HOURS * HOUR).toISOString();
  const oldest = new Date(now.getTime() - DRAFT_NUDGE_MAX_AGE_HOURS * HOUR).toISOString();

  const { data: drafts, error } = await db(client)
    .from('lead_profiles')
    .select('id, user_id, updated_at')
    .eq('status', 'draft')
    .is('demo_nudge_sent_at', null)
    .not('user_id', 'is', null)
    .gte('updated_at', oldest)
    .lte('updated_at', newest)
    .order('updated_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  const rows = (drafts ?? []) as DraftRow[];
  if (!rows.length) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));

  const [usersRes, demosRes, appsRes] = await Promise.all([
    db(client).from('users').select('id, phone, phone_verified, first_name, name').in('id', userIds),
    db(client).from('demo_class_registrations').select('user_id').in('user_id', userIds),
    db(client).from('lead_profiles').select('user_id, status').in('user_id', userIds).neq('status', 'draft'),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (demosRes.error) throw demosRes.error;
  if (appsRes.error) throw appsRes.error;

  const users = new Map<string, UserRow>(((usersRes.data ?? []) as UserRow[]).map((u) => [u.id, u]));
  const askedForDemo = new Set(((demosRes.data ?? []) as { user_id: string }[]).map((d) => d.user_id));
  const movedOn = new Set(((appsRes.data ?? []) as { user_id: string }[]).map((a) => a.user_id));

  const picked: DraftDemoNudge[] = [];
  const seenUsers = new Set<string>();
  for (const row of rows) {
    if (picked.length >= limit) break;
    const userId = row.user_id as string;
    if (seenUsers.has(userId) || askedForDemo.has(userId) || movedOn.has(userId)) continue;
    const user = users.get(userId);
    const phone = (user?.phone || '').replace(/\D/g, '');
    if (!user?.phone_verified || phone.length < 10) continue;
    seenUsers.add(userId);

    // The claim: only the call that flips the null sends.
    const { data: claimed, error: claimError } = await db(client)
      .from('lead_profiles')
      .update({ demo_nudge_sent_at: now.toISOString() })
      .eq('id', row.id)
      .is('demo_nudge_sent_at', null)
      .select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) continue;

    picked.push({ leadProfileId: row.id, userId, phone, name: draftNudgeGreeting(user) });
  }
  return picked;
}
