/**
 * The card's own retry of the Class Team and group chat step.
 *
 * A brand new Microsoft account takes a few minutes to reach Teams, so the first
 * add often fails. While the card is open it tries again by itself, a few times,
 * and only for an account made in the last hour. No timers or jobs run anywhere
 * else: if staff close the page, Nexus finishes the step when the student opens it.
 */

/** Minutes to wait before each automatic try: 2, then 3 more, then 5 more (10 in all). */
export const TEAMS_AUTO_RETRY_DELAYS_MIN = [2, 3, 5] as const;

/** Only an account this new is retried by itself. */
export const NEW_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

export function isNewAccount(accountCreatedAt: string | null | undefined, now: number): boolean {
  if (!accountCreatedAt) return false;
  const created = Date.parse(accountCreatedAt);
  return Number.isFinite(created) && now - created >= 0 && now - created < NEW_ACCOUNT_WINDOW_MS;
}

/** Milliseconds until the next automatic try, or null when there is none left. */
export function nextAutoRetryDelay(triesDone: number): number | null {
  const minutes = TEAMS_AUTO_RETRY_DELAYS_MIN[triesDone];
  return minutes === undefined ? null : minutes * 60 * 1000;
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** The line under a failed Teams step: when it tries again, or what happens next. */
export function teamsRetryNote(input: {
  /** When the next automatic try runs, or null. */
  autoAt: number | null;
  /** The card tried by itself and has no tries left. */
  exhausted: boolean;
  signedIn: boolean;
  firstName: string;
}): string {
  if (input.autoAt) return `Trying again automatically at ${clock(input.autoAt)}.`;
  const later = input.signedIn
    ? 'Press Retry in a few minutes.'
    : `Press Retry in a few minutes. It also finishes by itself when ${input.firstName} first opens Nexus.`;
  return input.exhausted ? `Tried ${TEAMS_AUTO_RETRY_DELAYS_MIN.length} times. ${later}` : later;
}
