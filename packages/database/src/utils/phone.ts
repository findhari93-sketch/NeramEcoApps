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

/**
 * The mobile codes a student or staff member can pick: India and the Gulf,
 * where many of our students live. Same list as the marketing apply form.
 */
export const MOBILE_COUNTRIES = [
  { code: 'IN', name: 'India', prefix: '+91', length: 10, pattern: /^[6-9]\d{9}$/ },
  { code: 'AE', name: 'United Arab Emirates', prefix: '+971', length: 9, pattern: /^\d{9}$/ },
  { code: 'SA', name: 'Saudi Arabia', prefix: '+966', length: 9, pattern: /^\d{9}$/ },
  { code: 'QA', name: 'Qatar', prefix: '+974', length: 8, pattern: /^\d{8}$/ },
  { code: 'OM', name: 'Oman', prefix: '+968', length: 8, pattern: /^\d{8}$/ },
  { code: 'KW', name: 'Kuwait', prefix: '+965', length: 8, pattern: /^\d{8}$/ },
  { code: 'BH', name: 'Bahrain', prefix: '+973', length: 8, pattern: /^\d{8}$/ },
] as const;

export type MobileCountry = (typeof MOBILE_COUNTRIES)[number];

/** The country for a code, India when unknown. */
export function mobileCountry(code: string | null | undefined): MobileCountry {
  return MOBILE_COUNTRIES.find((c) => c.code === code) || MOBILE_COUNTRIES[0];
}

/** A number with its code: the listed country it belongs to and its national digits, or null. */
function splitListedMobile(digitsWithCode: string): { country: MobileCountry; national: string } | null {
  // Longest code first, so +971 is never read as +97 or +9.
  const byPrefix = [...MOBILE_COUNTRIES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const country of byPrefix) {
    const code = country.prefix.slice(1);
    if (!digitsWithCode.startsWith(code)) continue;
    const national = digitsWithCode.slice(code.length);
    if (country.pattern.test(national)) return { country, national };
  }
  return null;
}

/**
 * A student's mobile as demo and lead rows store it: an Indian number as its
 * ten digits (what every older row and staff tool expects), a Gulf number as
 * E.164 with its code. Null when it is not a mobile from MOBILE_COUNTRIES.
 *
 * A "+" number is read by its code first. Reading the last ten digits alone
 * took a Saudi "+966 5x xxx xxxx" for an Indian "65xxxxxxxx".
 */
export function storedMobile(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    const listed = splitListedMobile(digits);
    if (!listed) return null;
    return listed.country.code === 'IN' ? listed.national : `${listed.country.prefix}${listed.national}`;
  }
  if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits) ? digits : null;
  // A code written without the "+": 91, 971, 966 and so on.
  const listed = splitListedMobile(digits);
  if (listed) return listed.country.code === 'IN' ? listed.national : `${listed.country.prefix}${listed.national}`;
  // Older spellings of an Indian number, such as a leading 0.
  const ten = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** A stored mobile split for a code picker: the country and the national digits. Unknown reads as India. */
export function mobileParts(stored: string | null | undefined): { country: MobileCountry; national: string } {
  const trimmed = (stored || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    const listed = splitListedMobile(digits);
    if (listed) return listed;
  }
  return { country: MOBILE_COUNTRIES[0], national: digits.slice(-10) };
}

/** A stored mobile with its code and no spaces, "+971551993240", for tel: and wa.me links. */
export function mobileE164(stored: string | null | undefined): string {
  const { country, national } = mobileParts(stored);
  return national ? `${country.prefix}${national}` : '';
}
