/**
 * Class accounts made without staff. Sending an enrolment link is the approval,
 * so every enrolled student gets their Microsoft class account by themselves.
 * Two doors use this:
 *   - the student's own setup page, the moment they open it
 *     (/api/class-account/self-serve, called by the app's /api/class-setup/start);
 *   - a job every 10 minutes for anyone who has not opened it (/api/cron/class-accounts).
 * Staff can still make or fix one from the Class account card; this never undoes theirs.
 *
 * The Class Team step is not retried here: the card and Nexus finish it.
 */
import { emptySteps, provisionClassAccount, suggestClassUsername, upnFor } from '@neram/auth/student-accounts';
import { createClassAccountPorts } from './class-account-store';

/** A run that has not saved anything for this long has stopped; another may take over. */
export const RUN_LEASE_MS = 3 * 60_000;
/** Login IDs tried when the suggested one belongs to someone else: Name_Father, Name_Father2 ... */
export const ID_TRIES = 5;

export type AutoResult =
  | { status: 'ready'; upn: string }
  | { status: 'working' }
  | { status: 'not_enrolled' }
  | { status: 'has_account' }
  | { status: 'failed'; message: string };

/** Enrolled by any route: a used enrolment link, a student profile, or a student user (the app's rule). */
export async function isEnrolled(supabase: any, userId: string, userType: string | null | undefined): Promise<boolean> {
  if (userType === 'student') return true;
  const [{ count: profiles }, { count: links }] = await Promise.all([
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('direct_enrollment_links')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'used')
      .or(`used_by.eq.${userId},submitted_user_id.eq.${userId},user_id.eq.${userId}`),
  ]);
  return (profiles ?? 0) > 0 || (links ?? 0) > 0;
}

/** Who approved this student: whoever sent (or verified) their enrolment link. */
export async function approverFor(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('direct_enrollment_links')
    .select('created_by, verified_by')
    .eq('status', 'used')
    .or(`used_by.eq.${userId},submitted_user_id.eq.${userId},user_id.eq.${userId}`)
    .order('used_at', { ascending: false })
    .limit(1);
  const link = data?.[0];
  return link?.verified_by || link?.created_by || null;
}

/** The candidate login IDs, in order. */
export function loginIdsToTry(base: string, tries = ID_TRIES): string[] {
  return Array.from({ length: tries }, (_, i) => (i === 0 ? base : `${base}${i + 1}`));
}

/**
 * Only one run per student at a time. The first run's claim is the setup row
 * itself; a later run takes the row only when nobody has saved it for RUN_LEASE_MS.
 */
export async function claimRun(supabase: any, userId: string, upn: string, actorId: string | null, now: number): Promise<boolean> {
  const { error } = await supabase
    .from('class_account_setups')
    .insert({ user_id: userId, upn, steps: emptySteps(), created_by: actorId });
  if (!error) return true;
  if (error.code !== '23505') throw error;
  const { data, error: leaseError } = await supabase
    .from('class_account_setups')
    .update({ updated_at: new Date(now).toISOString() })
    .eq('user_id', userId)
    .lt('updated_at', new Date(now - RUN_LEASE_MS).toISOString())
    .select('user_id');
  if (leaseError) throw leaseError;
  return (data?.length ?? 0) > 0;
}

/** Make (or carry on making) this student's class account, if they are enrolled and have none. */
export async function autoProvisionClassAccount(supabase: any, userId: string, now = Date.now()): Promise<AutoResult> {
  const [{ data: user }, { data: setup }] = await Promise.all([
    supabase.from('users').select('id, user_type, ms_oid').eq('id', userId).maybeSingle(),
    supabase.from('class_account_setups').select('upn, steps').eq('user_id', userId).maybeSingle(),
  ]);
  if (!user) return { status: 'not_enrolled' };
  if (setup?.steps?.account?.status === 'done') return { status: 'ready', upn: setup.upn };
  // A Microsoft account made by hand: the app adopts it, nothing to create.
  if (user.ms_oid && !setup) return { status: 'has_account' };
  if (!(await isEnrolled(supabase, userId, user.user_type))) return { status: 'not_enrolled' };

  const actorId = await approverFor(supabase, userId);
  const ports = createClassAccountPorts(supabase, actorId ?? userId);
  const student = await ports.store.getStudent(userId);
  if (!student || student.isStaff || !student.isStudent) return { status: 'not_enrolled' };
  const defaults = await ports.store.readDefaults();
  const base = suggestClassUsername(student);

  if (!(await claimRun(supabase, userId, upnFor(base, defaults.domain), actorId, now))) return { status: 'working' };

  for (const username of loginIdsToTry(base)) {
    const result = await provisionClassAccount(ports, { userId, username, actorId: actorId ?? userId });
    if (result.kind === 'ok') return { status: 'ready', upn: result.setup.upn };
    if (result.kind === 'conflict' && result.code === 'upn_taken') continue;
    if (result.kind === 'graph_failed') {
      return { status: 'failed', message: `${result.error.message}${result.error.fix ? ` ${result.error.fix}` : ''}` };
    }
    return { status: 'failed', message: result.error };
  }
  return { status: 'failed', message: `Every login ID from ${base} to ${base}${ID_TRIES} is taken. Pick one on the Class account card.` };
}
