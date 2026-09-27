// @ts-nocheck - lifecycle views and new tables are newer than the generated Database type
/**
 * User 360: everything staff need to understand one person, in one payload.
 *
 * Rendered by two screens (lifecycle plan M4): Admin /crm/[id] (desktop, full
 * CRM and finance) and Nexus students/[id] (mobile, enrolled students). Both
 * call getUser360 through their own staff-only API route; the timeline pages
 * separately through getUserTimeline.
 *
 * Every section degrades on its own: a missing table or a failed read gives an
 * empty section, never a failed page.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { listUserIdentities } from './identity';

export interface TimelineEntry {
  occurred_at: string;
  kind: string;
  title: string;
  detail: Record<string, unknown>;
  actor_id: string | null;
  actor_name?: string | null;
  source_app: string | null;
}

export interface User360 {
  person: Record<string, any>;
  identities: Array<Record<string, any>>;
  enrollments: Array<Record<string, any>>;
  crm: {
    owner: { id: string; name: string | null } | null;
    openFollowUps: Array<Record<string, any>>;
    notesCount: number;
  };
  payments: { totalPaid: number; count: number; latest: Array<Record<string, any>> };
  feedback: { appFeedback: Array<Record<string, any>>; testimonials: Array<Record<string, any>> };
  outcomes: Array<Record<string, any>>;
  merges: Array<Record<string, any>>;
  openDuplicates: number;
  suggestions: Array<Record<string, any>>;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[user360] ${label} unavailable:`, (error as Error)?.message ?? error);
    return fallback;
  }
}

function rowsOrThrow<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

/** For maybeSingle(): a missing row is null, never an empty array (which is truthy). */
function rowOrNull<T>(r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? null;
}

/** The whole picture for one person, or null when the user does not exist. */
export async function getUser360(userId: string, client?: TypedSupabaseClient): Promise<User360 | null> {
  const supabase = client || getSupabaseAdminClient();

  // Leads and students come from the lifecycle view; staff and parents are not
  // in it, so fall back to the users row.
  const lifecycle = await safe(
    'lifecycle',
    async () => rowOrNull(await supabase.from('user_lifecycle_view').select('*').eq('id', userId).maybeSingle()),
    null,
  );
  const person =
    lifecycle ??
    (await safe(
      'user',
      async () =>
        rowOrNull(
          await supabase
            .from('users')
            .select('id, name, email, phone, avatar_url, user_type, is_disabled, is_alumni, created_at, last_login_at, ms_oid, firebase_uid, personal_email, academic_year, crm_owner_id')
            .eq('id', userId)
            .maybeSingle(),
        ),
      null,
    ));
  if (!person) return null;

  const [identities, enrollments, ownerRow, followUps, notes, payments, appFeedback, testimonials, outcomes, merges, dupes, suggestions] =
    await Promise.all([
      safe('identities', () => listUserIdentities(userId, supabase), []),
      safe(
        'enrollments',
        async () =>
          rowsOrThrow(
            await supabase
              .from('nexus_enrollments')
              .select('id, role, is_active, enrolled_at, removed_at, removal_reason_category, participation_status, dormant_source, current_standard, classroom:nexus_classrooms(id, name, academic_year, is_archived)')
              .eq('user_id', userId)
              .order('enrolled_at', { ascending: false }),
          ),
        [],
      ),
      safe(
        'owner',
        async () => {
          const { data } = await supabase.from('users').select('crm_owner_id').eq('id', userId).maybeSingle();
          if (!data?.crm_owner_id) return null;
          const { data: owner } = await supabase.from('users').select('id, name').eq('id', data.crm_owner_id).maybeSingle();
          return owner ?? null;
        },
        null,
      ),
      safe(
        'follow-ups',
        async () =>
          rowsOrThrow(await supabase.from('crm_follow_ups').select('*').eq('user_id', userId).order('due_at', { ascending: true })),
        [],
      ),
      safe(
        'notes',
        async () => {
          const { count, error } = await supabase
            .from('admin_user_notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          if (error) throw new Error(error.message);
          return count ?? 0;
        },
        0,
      ),
      safe(
        'payments',
        async () =>
          rowsOrThrow(
            await supabase
              .from('payments')
              .select('id, amount, status, payment_method, paid_at, created_at, receipt_number')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(10),
          ),
        [],
      ),
      safe(
        'app feedback',
        async () =>
          rowsOrThrow(
            await supabase
              .from('app_feedback')
              .select('id, rating, category, description, status, topics, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20),
          ),
        [],
      ),
      safe(
        'testimonials',
        async () =>
          rowsOrThrow(
            await supabase
              .from('testimonials')
              .select('id, content, rating, source, publication_status, consent_given_at, consent_by, consent_display_name, submitted_at, moderated_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false }),
          ),
        [],
      ),
      safe(
        'outcomes',
        async () => rowsOrThrow(await supabase.from('learner_outcomes_view').select('*').eq('user_id', userId)),
        [],
      ),
      safe(
        'merges',
        async () =>
          rowsOrThrow(
            await supabase
              .from('user_merge_log')
              .select('id, loser_id, loser_snapshot, merged_by, merged_at')
              .eq('winner_id', userId)
              .order('merged_at', { ascending: false }),
          ),
        [],
      ),
      safe(
        'duplicates',
        async () => {
          const { count, error } = await supabase
            .from('user_duplicate_candidates')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open')
            .or(`user_a.eq.${userId},user_b.eq.${userId}`);
          if (error) throw new Error(error.message);
          return count ?? 0;
        },
        0,
      ),
      safe(
        'suggestions',
        async () =>
          rowsOrThrow(
            await supabase
              .from('lifecycle_suggestions')
              .select('id, kind, reason, evidence, created_at')
              .eq('user_id', userId)
              .eq('status', 'open'),
          ),
        [],
      ),
    ]);

  const paid = (payments as any[]).filter((p) => p.status === 'paid');
  return {
    person,
    identities,
    enrollments,
    crm: { owner: ownerRow, openFollowUps: followUps, notesCount: notes },
    payments: {
      totalPaid: paid.reduce((s, p) => s + (Number(p.amount) || 0), 0),
      count: (payments as any[]).length,
      latest: payments,
    },
    feedback: { appFeedback, testimonials },
    outcomes,
    merges,
    openDuplicates: dupes,
    suggestions,
  };
}

/**
 * One page of the person's history, newest first. Pass the oldest
 * `occurred_at` you have as `before` to load the next page. Staff names are
 * attached so the UI can say who did it.
 */
export async function getUserTimeline(
  userId: string,
  options: { before?: string | null; limit?: number } = {},
  client?: TypedSupabaseClient,
): Promise<{ entries: TimelineEntry[]; nextBefore: string | null }> {
  const supabase = client || getSupabaseAdminClient();
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const { data, error } = await supabase.rpc('get_user_timeline', {
    p_user_id: userId,
    p_limit: limit,
    p_before: options.before ?? null,
  });
  if (error) throw error;
  const entries: TimelineEntry[] = data || [];

  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter(Boolean))] as string[];
  if (actorIds.length) {
    const { data: actors } = await supabase.from('users').select('id, name').in('id', actorIds);
    const names = Object.fromEntries((actors || []).map((a: any) => [a.id, a.name]));
    for (const e of entries) if (e.actor_id) e.actor_name = names[e.actor_id] ?? null;
  }

  return {
    entries,
    nextBefore: entries.length === limit ? entries[entries.length - 1].occurred_at : null,
  };
}
