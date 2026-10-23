/**
 * The mobile codes the OTP step offers: India and the Gulf, where many of our
 * students live. Same list as MOBILE_COUNTRIES in @neram/database/phone (a
 * test there keeps the two equal; this package does not depend on it).
 */
export const PHONE_COUNTRIES = [
  { code: 'IN', name: 'India', prefix: '+91', length: 10, placeholder: '9876543210' },
  { code: 'AE', name: 'United Arab Emirates', prefix: '+971', length: 9, placeholder: '501234567' },
  { code: 'SA', name: 'Saudi Arabia', prefix: '+966', length: 9, placeholder: '512345678' },
  { code: 'QA', name: 'Qatar', prefix: '+974', length: 8, placeholder: '55123456' },
  { code: 'OM', name: 'Oman', prefix: '+968', length: 8, placeholder: '92123456' },
  { code: 'KW', name: 'Kuwait', prefix: '+965', length: 8, placeholder: '50012345' },
  { code: 'BH', name: 'Bahrain', prefix: '+973', length: 8, placeholder: '36001234' },
] as const;

export interface PhoneDial {
  prefix: string;
  length: number;
  placeholder: string;
}

/** The dial for a code a caller passed: a listed country, or that code with the caller's length. */
export function dialFor(prefix: string, length: number): PhoneDial {
  const listed = PHONE_COUNTRIES.find((c) => c.prefix === prefix);
  return listed && listed.length === length ? listed : { prefix, length, placeholder: '' };
}

/**
 * Where the OTP step opens: a number that already carries a listed code
 * ("+971551993240") opens on that country; anything else opens on the
 * caller's code with its digits, dropping a repeated code or a leading 0.
 */
export function openingPhone(initialPhone: string, dialCode: string, phoneLength: number): { dial: PhoneDial; digits: string } {
  const raw = (initialPhone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    // Longest code first, so +971 is never read as +97 or +9.
    const byPrefix = [...PHONE_COUNTRIES].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const c of byPrefix) {
      const code = c.prefix.slice(1);
      if (digits.startsWith(code) && digits.length - code.length === c.length) return { dial: c, digits: digits.slice(code.length) };
    }
  }
  const dial = dialFor(dialCode, phoneLength);
  const code = dial.prefix.replace(/\D/g, '');
  const national = digits.length > dial.length && digits.startsWith(code) ? digits.slice(code.length) : digits;
  return { dial, digits: national.length > dial.length ? national.slice(-dial.length) : national };
}
