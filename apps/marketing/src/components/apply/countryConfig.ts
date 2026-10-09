/**
 * Countries on the apply form, for two separate things:
 *
 * - the mobile's country code (personal.phoneCountry): India and the Gulf;
 * - where the student lives (location.country): India uses a PIN code that
 *   looks the place up, everywhere else is a country and a typed city. A
 *   country not in the list is stored by its typed name.
 *
 * A student in Dubai with an Indian WhatsApp number is normal, so the two are
 * never tied together.
 */
import { normalisePhone } from '@/lib/phone';

export interface CountryConfig {
  code: string;
  name: string;
  phonePrefix: string;
  phonePlaceholder: string;
  phoneLength: number;
  phonePattern: RegExp;
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  { code: 'IN', name: 'India', phonePrefix: '+91', phonePlaceholder: '9876543210', phoneLength: 10, phonePattern: /^[6-9]\d{9}$/ },
  { code: 'AE', name: 'United Arab Emirates', phonePrefix: '+971', phonePlaceholder: '501234567', phoneLength: 9, phonePattern: /^\d{9}$/ },
  { code: 'SA', name: 'Saudi Arabia', phonePrefix: '+966', phonePlaceholder: '512345678', phoneLength: 9, phonePattern: /^\d{9}$/ },
  { code: 'QA', name: 'Qatar', phonePrefix: '+974', phonePlaceholder: '55123456', phoneLength: 8, phonePattern: /^\d{8}$/ },
  { code: 'OM', name: 'Oman', phonePrefix: '+968', phonePlaceholder: '92123456', phoneLength: 8, phonePattern: /^\d{8}$/ },
  { code: 'KW', name: 'Kuwait', phonePrefix: '+965', phonePlaceholder: '50012345', phoneLength: 8, phonePattern: /^\d{8}$/ },
  { code: 'BH', name: 'Bahrain', phonePrefix: '+973', phonePlaceholder: '36001234', phoneLength: 8, phonePattern: /^\d{8}$/ },
];

/** location.country for a country outside the list; the name is in location.countryName. */
export const OTHER_COUNTRY = 'OTHER';

/** An Indian PIN code. Only India's PIN is looked up. */
export const INDIA_PIN = /^\d{6}$/;

export function getCountryConfig(code: string | null | undefined): CountryConfig {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code) || SUPPORTED_COUNTRIES[0];
}

export function isListedCountry(code: string | null | undefined): boolean {
  return SUPPORTED_COUNTRIES.some((c) => c.code === code);
}

/**
 * The mobile as the form saves it: an Indian number stays 10 digits (as every
 * older row and staff tool expects), any other is E.164 with its code.
 */
export function toStoredPhone(digits: string, phoneCountry: string): string {
  if (!digits) return '';
  const config = getCountryConfig(phoneCountry);
  return config.code === 'IN' ? digits : `${config.phonePrefix}${digits}`;
}

/**
 * Reads a saved or verified mobile back into the form's two parts. A number
 * with a + carries its own code; plain digits belong to `fallbackCountry`
 * (older Gulf drafts saved digits only, with the country beside them).
 */
export function fromStoredPhone(stored: string | null | undefined, fallbackCountry = 'IN'): { phone: string; phoneCountry: string } {
  const raw = String(stored ?? '').trim();
  if (!raw) return { phone: '', phoneCountry: isListedCountry(fallbackCountry) ? fallbackCountry : 'IN' };
  const e164 = raw.startsWith('+') ? normalisePhone(raw) : null;
  if (e164) {
    const match = [...SUPPORTED_COUNTRIES]
      .sort((a, b) => b.phonePrefix.length - a.phonePrefix.length)
      .find((c) => e164.startsWith(c.phonePrefix) && e164.length - c.phonePrefix.length === c.phoneLength);
    if (match) return { phone: e164.slice(match.phonePrefix.length), phoneCountry: match.code };
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return { phone: digits.slice(2), phoneCountry: 'IN' };
  const country = isListedCountry(fallbackCountry) ? fallbackCountry : 'IN';
  return { phone: digits.slice(-getCountryConfig(country).phoneLength), phoneCountry: country };
}

/** location.country as saved: a listed code, or the typed name for another country. */
export function storedResidence(country: string, countryName: string): string {
  if (country === OTHER_COUNTRY) return countryName.trim() || OTHER_COUNTRY;
  return country || 'IN';
}

/** The saved country back into the form: a listed code, or OTHER with its name. */
export function residenceFromStored(stored: string | null | undefined): { country: string; countryName: string } {
  const value = String(stored ?? '').trim();
  if (!value) return { country: 'IN', countryName: '' };
  if (isListedCountry(value)) return { country: value, countryName: '' };
  if (value === OTHER_COUNTRY) return { country: OTHER_COUNTRY, countryName: '' };
  return { country: OTHER_COUNTRY, countryName: value };
}

/** The country's name for summaries. */
export function residenceLabel(country: string, countryName: string): string {
  if (country === OTHER_COUNTRY) return countryName.trim();
  return getCountryConfig(country).name;
}
