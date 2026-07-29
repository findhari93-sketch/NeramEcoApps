/**
 * Phone normalisation to E.164, so a number is stored in one comparable shape.
 *
 * WHY THIS MATTERS BEYOND TIDINESS: `users.phone` is the key the admin "Sync from
 * Entra" reconciler uses to recognise that a newly created @neramclasses.com
 * mailbox belongs to a student who already has a row (see reconcileMsIdentity in
 * packages/database). That lookup compares against the stored string, so a number
 * saved as "89255 30367" can never be matched, and an unmatched student gets a
 * SECOND, duplicate record. Store one shape, always.
 */

/**
 * Returns the number as `+<countrycode><digits>`, or null when the input is not a
 * plausible phone number. Null is deliberate: storing a partial number is worse
 * than storing nothing, because it looks matchable but never matches.
 */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  // Explicit country code already present.
  if (trimmed.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  // Bare Indian mobile.
  if (digits.length === 10) return `+91${digits}`;
  // 0-prefixed Indian mobile.
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  // Country code written without the leading +.
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}
