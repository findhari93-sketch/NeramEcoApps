/**
 * The enrolment form keeps the student's mobile as one string with its code,
 * "+919876543210" or "+971501234567", and the code's country beside it in
 * personal.phoneCountry. These split it for the country picker and the OTP
 * dialog, and join it back.
 */
import { fromStoredPhone, getCountryConfig } from '@/components/apply/countryConfig';

export function splitEnrolPhone(
  stored: string | null | undefined,
  phoneCountry: string | null | undefined,
): { phone: string; phoneCountry: string } {
  const raw = String(stored ?? '').trim();
  const config = getCountryConfig(phoneCountry);
  // Still being typed under the picked code: trust the picker.
  if (raw.startsWith(config.phonePrefix)) {
    return { phone: raw.slice(config.phonePrefix.length).replace(/\D/g, ''), phoneCountry: config.code };
  }
  // A complete number with another code (say a link made for a UAE number) carries its own country.
  return fromStoredPhone(raw, config.code);
}

export function joinEnrolPhone(digits: string, phoneCountry: string | null | undefined): string {
  const clean = digits.replace(/\D/g, '');
  return clean ? `${getCountryConfig(phoneCountry).phonePrefix}${clean}` : '';
}
