/**
 * Generating admin-issued parent login IDs and one-time passwords.
 *
 * Staff read these out or send them over WhatsApp, and a parent types them on a
 * phone keyboard. That drives every choice here: lowercase only, no ambiguous
 * characters, and a login ID built from the child's name so a parent recognises
 * it as theirs rather than treating it as a random string to lose.
 *
 * Pure and dependency-free apart from crypto, so it is fully unit-testable.
 * Uniqueness of the login ID is enforced by the UNIQUE index on
 * nexus_parent_credentials.login_id; the caller retries on conflict.
 */

import { randomInt } from 'crypto';

/**
 * Ambiguous characters are excluded on purpose: 0/O, 1/l/I. A parent reading a
 * password off a WhatsApp message in poor light should not have to guess.
 */
const SAFE_DIGITS = '23456789';
const SAFE_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const SAFE_ALPHABET = SAFE_LETTERS + SAFE_DIGITS;

export const TEMP_PASSWORD_LENGTH = 10;

/** Login IDs are compared lowercased everywhere, so normalise on both sides. */
export function normalizeLoginId(input: string | null | undefined): string {
  return (input || '').trim().toLowerCase();
}

/**
 * Reduce a child's name to a short ASCII handle.
 * Non-Latin scripts (Tamil, Devanagari) reduce to nothing, which is fine: the
 * caller falls back to a generic prefix rather than emitting mojibake a parent
 * cannot type.
 */
function firstNameSlug(childName: string | null | undefined): string {
  const first = (childName || '')
    .trim()
    .split(/\s+/)[0]
    ?.normalize('NFKD')
    // Strip combining marks left by the decomposition, then anything non-Latin.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!first) return 'parent';
  // Long enough to be recognisable, short enough to read aloud.
  return first.slice(0, 12);
}

/**
 * Build a login ID for a child's parent, e.g. "arun.p4821".
 *
 * The 4 digits are random rather than sequential so a login ID does not leak
 * how many students are enrolled, and so two children with the same first name
 * rarely collide. Collisions are still possible; the caller retries.
 */
export function generateLoginId(childName: string | null | undefined): string {
  const suffix = String(randomInt(1000, 10000));
  return `${firstNameSlug(childName)}.p${suffix}`;
}

/**
 * A one-time password, shown to staff exactly once and never stored in
 * plaintext. The parent is forced to change it on first sign-in.
 *
 * Guarantees at least one letter and one digit, so the generated password also
 * satisfies validatePasswordPolicy if a parent ever tries to keep it.
 */
export function generateTempPassword(length: number = TEMP_PASSWORD_LENGTH): string {
  const size = Math.max(8, length);

  // Place one guaranteed letter and one guaranteed digit, fill the rest freely,
  // then shuffle so their positions are not predictable.
  const chars: string[] = [
    SAFE_LETTERS[randomInt(0, SAFE_LETTERS.length)],
    SAFE_DIGITS[randomInt(0, SAFE_DIGITS.length)],
  ];
  while (chars.length < size) {
    chars.push(SAFE_ALPHABET[randomInt(0, SAFE_ALPHABET.length)]);
  }

  // Fisher-Yates with a CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * The synthetic ms_oid a parent's `users` row carries.
 *
 * Roughly 150 routes resolve the caller with `.eq('ms_oid', ...)`. Giving a
 * parent a synthetic value means every one of them works unchanged, which is
 * exactly the trick lib/impersonation-token.ts already uses. The 'parent:'
 * prefix makes such rows trivially greppable and impossible to confuse with a
 * real Entra object id.
 */
export function buildParentMsOid(uuid: string): string {
  return `parent:${uuid}`;
}

/** Is this ms_oid a synthetic parent identifier rather than a real Entra oid? */
export function isParentMsOid(msOid: string | null | undefined): boolean {
  return !!msOid && msOid.startsWith('parent:');
}

/**
 * Normalise a digest email, or return null if it is blank or malformed.
 *
 * Contact details deliberately do NOT live on users.email, which is unique
 * across all four apps. A parent's address is usually already on a lead row
 * from the enquiry form, so writing it there fails on the most ordinary input
 * there is. These live on nexus_parent_credentials instead, where two
 * guardians sharing one inbox is allowed.
 *
 * The check is a shape check, not a validity check. The only real test of an
 * address is sending to it; the point here is to catch "madhu@gmail" before it
 * bounces silently every week. Callers must treat null-from-non-blank as a
 * user error rather than storing nothing, or a typo disappears without a word.
 */
export function normalizeContactEmail(raw: string | null | undefined): string | null {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return null;
  // Exactly one @, something either side, at least one dot in the domain.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) return null;
  return value;
}

/**
 * Normalise a contact number to E.164 where the input allows it.
 *
 * A bare 10-digit number beginning 6 to 9 is an Indian mobile and gains +91.
 * Staff never type a country code, and a number without one is unusable to a
 * WhatsApp provider later, so guessing here is worth it: in this dataset that
 * pattern is unambiguous. Anything else is kept as typed after stripping
 * spacing punctuation, and anything that is not a plausible number at all
 * returns null.
 */
export function normalizeContactPhone(raw: string | null | undefined): string | null {
  const compact = (raw || '').replace(/[\s()\-.]/g, '');
  if (!compact) return null;
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  // E.164 allows at most 15 digits; below 8 is not a dialable number.
  if (!/^\+?\d{8,15}$/.test(compact)) return null;
  return compact;
}
