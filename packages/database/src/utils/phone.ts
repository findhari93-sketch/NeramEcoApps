/**
 * One phone shape for every app.
 *
 * Store numbers as E.164 (`normalisePhoneE164`) and match people on the last ten
 * digits (`phoneKey`, the same value as the generated users.phone_key column).
 * Comparing raw strings is what created duplicate accounts: a student stored as
 * "8682822310" was never found from a Firebase token "+918682822310", so sign-in
 * inserted a second row (9 of the 17 open Duplicates pairs on 2026-10-19).
 */

/**
 * The number as `+<countrycode><digits>`, or null when the input is not a
 * plausible phone number. A bare ten-digit number is an Indian mobile. Null is
 * deliberate: a partial number looks matchable but never matches.
 */
export function normalisePhoneE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * The last ten digits, or null when there are fewer than ten. "+91 86828 22310",
 * "8682822310", "918682822310" and "08682822310" all give "8682822310". Equal to
 * users.phone_key and user_contacts.value_key, so it is the value to look up.
 */
export function phoneKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** "+918682822310" shown as "+91 86828 22310"; anything else is returned trimmed. */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const e164 = normalisePhoneE164(raw);
  if (e164 && e164.startsWith('+91') && e164.length === 13) {
    return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return raw.trim();
}
