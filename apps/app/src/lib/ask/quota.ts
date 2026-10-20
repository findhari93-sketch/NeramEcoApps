/**
 * Guests get three answers a day from Ask aiArchitek, then sign in. "A day" is
 * the calendar day in India, so the allowance resets at midnight IST for every
 * student, wherever the server runs.
 */
export const GUEST_DAILY_ANSWERS = 3;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Midnight IST at the start of the India date containing `now`, as an ISO string (UTC). */
export function istDayStartIso(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startIstAsUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(startIstAsUtc - IST_OFFSET_MS).toISOString();
}

export function guestRemaining(usedToday: number, limit = GUEST_DAILY_ANSWERS): number {
  return Math.max(0, limit - usedToday);
}
