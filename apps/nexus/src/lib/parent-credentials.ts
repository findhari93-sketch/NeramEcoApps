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
