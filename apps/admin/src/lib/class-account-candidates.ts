/**
 * Who the class-account job looks at: students who enrolled in the last 30
 * days with no Microsoft account and no setup, and setups whose account step
 * stopped. Enrolments younger than 3 minutes are left to the student's page.
 * Also made accounts with a failed later step (finishDue), tried again with a
 * doubling wait so a step that keeps failing is not hammered.
 */

const DAY = 24 * 60 * 60_000;
export const ENROLLED_WINDOW_MS = 30 * DAY;
export const PAGE_GRACE_MS = 3 * 60_000;
export const RETRY_AFTER_MS = 5 * 60_000;
export const RETRY_WINDOW_MS = 7 * DAY;
export const FINISH_MIN_GAP_MS = 10 * 60_000;
export const FINISH_MAX_GAP_MS = 6 * 60 * 60_000;

interface LinkRow { used_by: string | null; submitted_user_id: string | null; user_id: string | null }
interface SetupRow {
  user_id: string;
  created_at?: string | null;
  steps: Record<string, { status?: string; at?: string } | undefined> | null;
}

/**
 * An account that exists with a failed later step, due another try: the wait
 * since the last try is at least as long as the setup had lived by then
 * (10 minutes, 20, 40 ... at most 6 hours).
 */
export function finishDue(s: SetupRow, now: number): boolean {
  const steps = s.steps || {};
  if (steps.account?.status !== 'done') return false;
  const tries = Object.values(steps)
    .filter((step) => step?.status === 'failed')
    .map((step) => Date.parse(step?.at || ''));
  if (!tries.length) return false;
  const last = Math.max(...tries.map((t) => (Number.isFinite(t) ? t : 0)));
  const born = Date.parse(s.created_at || '');
  const gap = Math.min(FINISH_MAX_GAP_MS, Math.max(FINISH_MIN_GAP_MS, Number.isFinite(born) ? last - born : 0));
  return now - last >= gap;
}

/** The decision, without the database: new enrolments first, then stopped runs. */
export function pickCandidates(input: {
  links: LinkRow[];
  profiles: Array<{ user_id: string | null }>;
  /** The enrolled people's users rows (id, ms_oid). */
  users: Array<{ id: string; ms_oid: string | null }>;
  /** user_ids that already have a setup row. */
  withSetup: string[];
  /** Setups not saved for RETRY_AFTER_MS, made in the last RETRY_WINDOW_MS. */
  stale: SetupRow[];
}): string[] {
  const enrolled = new Set<string>();
  for (const l of input.links) {
    const id = l.used_by || l.submitted_user_id || l.user_id;
    if (id) enrolled.add(id);
  }
  for (const p of input.profiles) if (p.user_id) enrolled.add(p.user_id);
  const hasMicrosoft = new Set(input.users.filter((u) => u.ms_oid).map((u) => u.id));
  const known = new Set(input.users.map((u) => u.id));
  const withSetup = new Set(input.withSetup);
  const fresh = Array.from(enrolled).filter((id) => known.has(id) && !hasMicrosoft.has(id) && !withSetup.has(id));
  const stopped = input.stale.filter((s) => s.steps?.account?.status !== 'done').map((s) => s.user_id);
  return Array.from(new Set([...fresh, ...stopped]));
}

/** make: students to give an account; finish: made accounts with a failed step due again. */
export async function classAccountCandidates(sb: any, now: number): Promise<{ make: string[]; finish: string[] }> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const since = iso(now - ENROLLED_WINDOW_MS);
  const until = iso(now - PAGE_GRACE_MS);
  const [links, profiles, stale] = await Promise.all([
    sb.from('direct_enrollment_links').select('used_by, submitted_user_id, user_id').eq('status', 'used').gte('used_at', since).lte('used_at', until),
    sb.from('student_profiles').select('user_id').gte('created_at', since).lte('created_at', until),
    sb
      .from('class_account_setups')
      .select('user_id, created_at, steps')
      .gte('created_at', iso(now - RETRY_WINDOW_MS))
      .lt('updated_at', iso(now - RETRY_AFTER_MS)),
  ]);
  for (const r of [links, profiles, stale]) if (r.error) throw r.error;

  const ids = new Set<string>();
  for (const l of links.data ?? []) {
    const id = l.used_by || l.submitted_user_id || l.user_id;
    if (id) ids.add(id);
  }
  for (const p of profiles.data ?? []) if (p.user_id) ids.add(p.user_id);
  const list = Array.from(ids);
  const [users, setups] = list.length
    ? await Promise.all([
        sb.from('users').select('id, ms_oid').in('id', list),
        sb.from('class_account_setups').select('user_id').in('user_id', list),
      ])
    : [{ data: [] }, { data: [] }];

  const make = pickCandidates({
    links: links.data ?? [],
    profiles: profiles.data ?? [],
    users: users.data ?? [],
    withSetup: (setups.data ?? []).map((s: any) => s.user_id),
    stale: stale.data ?? [],
  });
  const finish = (stale.data ?? []).filter((s: SetupRow) => finishDue(s, now)).map((s: SetupRow) => s.user_id);
  return { make, finish };
}
