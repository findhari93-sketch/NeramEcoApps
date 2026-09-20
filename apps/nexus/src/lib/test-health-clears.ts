/**
 * "Mark as fixed" on a paper's app problems (nexus_test_health_clears).
 *
 * Shared by the health route, which reads the latest clear, and the clear route,
 * which writes and undoes it, so both agree on what "the table is not there yet"
 * looks like. Until migration 20260923090000 is applied the health route behaves
 * as if the paper was never cleared, and the clear route answers 503.
 */

export const HEALTH_CLEARS_TABLE = 'nexus_test_health_clears';

/** What a teacher reads when the migration has not been applied on this server. */
export const HEALTH_CLEARS_UNAVAILABLE =
  'Mark as fixed is not available on this server yet. The database update it needs has not been applied.';

export interface HealthClear {
  id: string;
  cleared_at: string;
  cleared_by: string | null;
}

/** 42P01 is Postgres undefined_table; PGRST205 is a PostgREST schema-cache miss. */
export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist|could not find the table|schema cache/i.test(String(error.message || ''))
  );
}

/**
 * The latest clear for a paper, or null when it was never cleared.
 *
 * Never throws. A missing table reads as "never cleared"; any other failure is
 * logged and also reads as "never cleared", because showing a problem a teacher
 * already dealt with is recoverable, and hiding a live one is not.
 */
export async function readLatestHealthClear(supabase: any, testId: string): Promise<HealthClear | null> {
  try {
    const { data, error } = await supabase
      .from(HEALTH_CLEARS_TABLE)
      .select('id, cleared_at, cleared_by')
      .eq('test_id', testId)
      .order('cleared_at', { ascending: false })
      .limit(1);
    if (error) {
      if (!isMissingTableError(error)) console.error('Test health clear read failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return row && row.cleared_at ? { id: row.id, cleared_at: row.cleared_at, cleared_by: row.cleared_by ?? null } : null;
  } catch (err) {
    console.error('Test health clear read threw:', err instanceof Error ? err.message : err);
    return null;
  }
}
