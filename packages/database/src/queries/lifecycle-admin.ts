// @ts-nocheck - lifecycle tables are newer than the generated Database type
/**
 * Lifecycle rules and suggestions (lifecycle plan M7).
 *
 * The rules live in site_settings['lifecycle_rules'] and are edited on the admin
 * Settings page. A daily pg_cron job (generate_lifecycle_suggestions) turns them
 * into suggestions; a person accepts or dismisses each one. Nothing here acts on
 * a user by itself.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export interface LifecycleRules {
  student_quiet_days: number;
  lead_archive_days: number;
  archived_deactivate_days: number;
  suggest_graduation: boolean;
  join_reminder_days: number[];
  not_started_decision_days: number;
}

export const DEFAULT_LIFECYCLE_RULES: LifecycleRules = {
  student_quiet_days: 21,
  lead_archive_days: 180,
  archived_deactivate_days: 365,
  suggest_graduation: true,
  join_reminder_days: [1, 3, 7],
  not_started_decision_days: 14,
};

export type SuggestionKind = 'check_in_student' | 'archive_lead' | 'deactivate_account' | 'graduate_student';

export const SUGGESTION_LABELS: Record<SuggestionKind, { title: string; action: string }> = {
  check_in_student: { title: 'Check in with a quiet student', action: 'Mark as contacted' },
  archive_lead: { title: 'Archive an inactive lead', action: 'Archive' },
  deactivate_account: { title: 'Turn off sign-in for a long-archived account', action: 'Turn off sign-in' },
  graduate_student: { title: 'Graduate a student whose batch has ended', action: 'Open Graduate' },
};

const LIMITS: Record<keyof Omit<LifecycleRules, 'suggest_graduation' | 'join_reminder_days'>, [number, number]> = {
  student_quiet_days: [7, 120],
  lead_archive_days: [30, 730],
  archived_deactivate_days: [90, 1825],
  not_started_decision_days: [3, 60],
};

/** Pure: clamp and validate rules from the settings form. */
export function sanitizeLifecycleRules(input: Partial<LifecycleRules>): { rules: LifecycleRules; errors: string[] } {
  const rules = { ...DEFAULT_LIFECYCLE_RULES };
  const errors: string[] = [];
  for (const [key, [min, max]] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, [number, number]]>) {
    const v = input[key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < min || v > max) errors.push(`${key} must be a whole number from ${min} to ${max}.`);
    else rules[key] = v;
  }
  if (input.suggest_graduation !== undefined) rules.suggest_graduation = Boolean(input.suggest_graduation);
  if (input.join_reminder_days !== undefined) {
    const days = input.join_reminder_days;
    if (!Array.isArray(days) || days.length === 0 || days.length > 5 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 30)) {
      errors.push('join_reminder_days must be 1 to 5 whole days between 1 and 30.');
    } else {
      rules.join_reminder_days = [...new Set(days)].sort((a, b) => a - b);
    }
  }
  if (rules.archived_deactivate_days <= rules.lead_archive_days) {
    errors.push('Turning off sign-in must come later than archiving.');
  }
  return { rules, errors };
}

export async function getLifecycleRules(client?: TypedSupabaseClient): Promise<LifecycleRules> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'lifecycle_rules').maybeSingle();
  return { ...DEFAULT_LIFECYCLE_RULES, ...(data?.value || {}) };
}

export async function saveLifecycleRules(
  input: Partial<LifecycleRules>,
  adminId: string,
  client?: TypedSupabaseClient,
): Promise<LifecycleRules> {
  const { rules, errors } = sanitizeLifecycleRules(input);
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { status: 400 });
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: 'lifecycle_rules', value: rules, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) throw error;
  return rules;
}

export async function listLifecycleSuggestions(
  options: { kind?: SuggestionKind; status?: 'open' | 'accepted' | 'dismissed' | 'expired'; limit?: number } = {},
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { kind, status = 'open', limit = 100 } = options;
  let query = supabase
    .from('lifecycle_suggestions')
    .select('id, user_id, kind, reason, evidence, status, created_at, resolved_at, note, user:users!lifecycle_suggestions_user_id_fkey(id, name, email, phone, avatar_url, academic_year)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function countOpenSuggestions(client?: TypedSupabaseClient): Promise<Record<SuggestionKind, number>> {
  const supabase = client || getSupabaseAdminClient();
  const out = { check_in_student: 0, archive_lead: 0, deactivate_account: 0, graduate_student: 0 };
  const { data } = await supabase.from('lifecycle_suggestions').select('kind').eq('status', 'open');
  for (const r of data || []) out[r.kind as SuggestionKind] = (out[r.kind as SuggestionKind] || 0) + 1;
  return out;
}

/**
 * Close a suggestion. `accepted` records that a person acted on it; the action
 * itself (archive, disable, graduate) is performed by the caller through the
 * existing audited routes, never here.
 */
export async function resolveLifecycleSuggestion(
  suggestionId: string,
  status: 'accepted' | 'dismissed',
  adminId: string,
  note?: string | null,
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('lifecycle_suggestions')
    .update({ status, resolved_by: adminId, resolved_at: new Date().toISOString(), note: note ? note.slice(0, 500) : null })
    .eq('id', suggestionId)
    .eq('status', 'open')
    .select('id, user_id, kind')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('This suggestion was already resolved.'), { status: 409 });
  return data;
}

/** Re-run the generator now (after the rules change). */
export async function runLifecycleSuggestions(client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('generate_lifecycle_suggestions');
  if (error) throw error;
  return Number(data) || 0;
}
