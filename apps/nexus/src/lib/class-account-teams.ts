/**
 * Finishing a class account's Teams step when the student opens Nexus.
 *
 * Admin makes the class account (apps/admin/src/lib/class-account-store.ts) and
 * adds the student to the class Team and group chat. A brand new Microsoft
 * account often has not reached Teams yet, so that step can fail. The Admin card
 * retries a few times while it is open; if it is closed first, the step waits
 * here: by the time the student signs in, Teams always knows the account.
 *
 * No timer or job: /api/auth/me flags a pending step for a recent account only,
 * and the browser then calls POST /api/student/class-teams once.
 */
import type { ClassroomTeamsSyncResult } from '@neram/auth';

/** Only an account linked this recently is checked. Older ones are staff's to fix. */
export const CLASS_TEAMS_WINDOW_DAYS = 14;

/** Whether /api/auth/me should look for a pending step at all (no read otherwise). */
export function mayHavePendingClassTeams(
  user: { user_type?: string | null; linked_classroom_at?: string | null },
  opts: { impersonating: boolean; now: number },
): boolean {
  if (opts.impersonating || user.user_type !== 'student' || !user.linked_classroom_at) return false;
  const linked = Date.parse(user.linked_classroom_at);
  return Number.isFinite(linked) && opts.now - linked < CLASS_TEAMS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** True when this student's class account has a failed Teams step. */
export async function hasPendingClassTeams(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('class_account_setups').select('steps').eq('user_id', userId).maybeSingle();
  if (error || !data) return false;
  return data.steps?.teams?.status === 'failed';
}

/** The saved step after a Teams add, in the shape Admin's card reads. */
export function teamsStepAfter(
  result: ClassroomTeamsSyncResult,
  at: string,
): { status: 'done' | 'failed' | 'skipped'; at: string; message?: string } {
  if (result.team && !result.team.success) {
    return { status: 'failed', at, message: 'Not in the class Team yet. Tried again when they opened Nexus.' };
  }
  if (result.groupChat && !result.groupChat.success) {
    return {
      status: 'failed',
      at,
      message: result.team
        ? 'In the class Team, but not in the student group chat yet. You can also add them from the group chat in Teams.'
        : 'Not in the student group chat yet. You can also add them from the group chat in Teams.',
    };
  }
  if (!result.team && !result.groupChat) return { status: 'skipped', at, message: 'This classroom has no linked Microsoft Team.' };
  return { status: 'done', at };
}

/** The live year classroom the student is enrolled in, newest year first. */
export function pickYearClassroom(
  enrolments: Array<{ classroom: { id: string; academic_year?: string | null; is_archived?: boolean | null; is_active?: boolean | null } | null }>,
): string | null {
  const live = enrolments
    .map((row) => row.classroom)
    .filter((c): c is NonNullable<typeof c> => !!c && !!c.academic_year && !c.is_archived && c.is_active !== false)
    .sort((a, b) => String(b.academic_year).localeCompare(String(a.academic_year)));
  return live[0]?.id ?? null;
}
