/**
 * Where a new student's Microsoft account is created and which license it gets.
 *
 * One nexus_settings row under `student_account_defaults`, read like
 * recap_defaults: never throws, falls back to sensible values. The license is
 * detected the first time from students already enrolled, because the accounts
 * made by hand so far are the best record of what a student should get, and it
 * is saved once an account has been created with it.
 */

import { readLicenseStates } from './entra-accounts';
import {
  FALLBACK_ACCOUNT_DEFAULTS,
  normalizeAccountDefaults,
  pickMostCommonLicense,
  type DetectedLicense,
  type StudentAccountDefaults,
} from './student-account-rules';

export const STUDENT_ACCOUNT_DEFAULTS_KEY = 'student_account_defaults';

/** How many enrolled students to sample when detecting the student license. */
const DETECT_SAMPLE = 10;

export async function readStudentAccountDefaults(
  supabase: any,
): Promise<{ defaults: StudentAccountDefaults; saved: boolean }> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', STUDENT_ACCOUNT_DEFAULTS_KEY)
      .maybeSingle();
    if (error || !data) return { defaults: { ...FALLBACK_ACCOUNT_DEFAULTS }, saved: false };
    return { defaults: normalizeAccountDefaults(data.value), saved: true };
  } catch {
    return { defaults: { ...FALLBACK_ACCOUNT_DEFAULTS }, saved: false };
  }
}

export async function saveStudentAccountDefaults(
  supabase: any,
  defaults: StudentAccountDefaults,
  actorId: string,
): Promise<void> {
  const { error } = await supabase.from('nexus_settings').upsert({
    key: STUDENT_ACCOUNT_DEFAULTS_KEY,
    value: defaults,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** The license most recently enrolled students hold. Null when it cannot tell. */
export async function detectStudentLicense(supabase: any): Promise<DetectedLicense | null> {
  try {
    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select('enrolled_at, user:users!nexus_enrollments_user_id_fkey!inner(ms_oid)')
      .eq('role', 'student')
      .eq('is_active', true)
      .not('users.ms_oid', 'is', null)
      .order('enrolled_at', { ascending: false })
      .limit(DETECT_SAMPLE * 3);
    if (error) return null;

    const oids = Array.from(
      new Set(((data || []) as any[]).map((row) => row.user?.ms_oid).filter(Boolean) as string[]),
    ).slice(0, DETECT_SAMPLE);
    if (!oids.length) return null;

    const results = await Promise.all(oids.map((oid) => readLicenseStates(oid)));
    return pickMostCommonLicense(results.flatMap((result) => (result.ok ? [result.value] : [])));
  } catch {
    return null;
  }
}
