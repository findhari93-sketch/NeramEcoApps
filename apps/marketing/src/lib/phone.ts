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

/**
 * A number shown back to someone holding only a link: the last ten digits with
 * the middle six hidden, so "+91 90000 00077" reads "90******77". Anything that
 * is not a full ten-digit mobile returns null rather than an unmasked fragment.
 */
export function maskPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const ten = raw.replace(/\D/g, '').slice(-10);
  if (ten.length !== 10) return null;
  return `${ten.slice(0, 2)}******${ten.slice(-2)}`;
}

/**
 * True when both are ten-digit (Indian) mobiles with the same last ten digits:
 * "+91 90000 00077", "9000000077" and "919000000077" all match. Used to check
 * that an account proved the demo person's number before it is merged in.
 */
export function isSameMobile(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ta = a.replace(/\D/g, '').slice(-10);
  const tb = b.replace(/\D/g, '').slice(-10);
  return ta.length === 10 && ta === tb;
}

/**
 * True when two numbers are the same phone once normalised. Used to check that
 * the number a client asks us to mark verified is the one Firebase actually
 * verified (the `phone_number` claim of the ID token), not any number it sends.
 */
export function isSamePhone(a: unknown, b: unknown): boolean {
  const na = normalisePhone(a);
  return na !== null && na === normalisePhone(b);
}
