/**
 * D3: nothing about a question opens while one of the student's tests is
 * running. "Running" means started within the test's own time (plus a grace
 * period), not merely `status = in_progress`: an attempt the student walked
 * away from stays in_progress for ever, and on prod (2026-10-06) 33 such rows
 * from weeks and months back locked 17 students out of the tutor.
 *
 * Callers listed in nexus_settings `tutor_test_lock_exempt_user_ids` (test
 * accounts) skip the lock. Fails closed: a failed read counts as a test running.
 */

export const TEST_LOCK_EXEMPT_KEY = 'tutor_test_lock_exempt_user_ids';

/** After the test's own time runs out, how long the attempt still counts as running. */
const GRACE_MS = 15 * 60_000;
/** An untimed test counts as running this long after it was started. */
const UNTIMED_MS = 3 * 60 * 60_000;
/** No attempt older than this can be running, so the read is bounded. */
const LOOKBACK_MS = 24 * 60 * 60_000;

function parseIds(value: unknown): string[] {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export async function hasTestRunning(supabase: any, studentId: string, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const [settings, attempts] = await Promise.all([
    supabase.from('nexus_settings').select('key, value').eq('key', TEST_LOCK_EXEMPT_KEY).maybeSingle(),
    supabase.from('nexus_test_attempts').select('id, test_id, started_at').eq('student_id', studentId).eq('status', 'in_progress').gte('started_at', since),
  ]);
  // The exemption is read first: a failed settings read only loses the exemption.
  if (!settings.error && parseIds(settings.data?.value).includes(studentId)) return false;
  if (attempts.error) return true;
  const rows: { test_id: string | null; started_at: string | null }[] = attempts.data || [];
  if (rows.length === 0) return false;

  const testIds = [...new Set(rows.map((r) => r.test_id).filter((id): id is string => !!id))];
  const durations = new Map<string, number | null>();
  if (testIds.length > 0) {
    const { data, error } = await supabase.from('nexus_tests').select('id, duration_minutes').in('id', testIds);
    if (error) return true;
    for (const t of data || []) durations.set(t.id, typeof t.duration_minutes === 'number' && t.duration_minutes > 0 ? t.duration_minutes : null);
  }

  return rows.some((r) => {
    const started = r.started_at ? new Date(r.started_at).getTime() : NaN;
    // An attempt with no readable start time counts as running (fail closed).
    if (!Number.isFinite(started)) return true;
    const minutes = r.test_id ? durations.get(r.test_id) ?? null : null;
    const window = minutes ? minutes * 60_000 + GRACE_MS : UNTIMED_MS;
    return now.getTime() - started < window;
  });
}
