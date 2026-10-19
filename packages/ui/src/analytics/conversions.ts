/**
 * Google Ads conversions. These two helpers are the only places in the repo
 * that send a `conversion` event (the phone-call click lives in GoogleTag).
 *
 * Callers fire them only after the server confirmed the stage and said it was
 * the first time (verify-phone `signupConversion`, application `applicationConversion`),
 * never on a button click. Each call is also deduplicated in this browser and,
 * through transaction_id, by Google. Never throws: tracking must not block a
 * student.
 */

import { applicationLabel, canTrack, gadsId, signupLabel } from './env';

type Gtag = (...args: unknown[]) => void;

function gtagFn(): Gtag | null {
  if (typeof window === 'undefined') return null;
  const g = (window as unknown as { gtag?: unknown }).gtag;
  return typeof g === 'function' ? (g as Gtag) : null;
}

/** E.164 for enhanced conversions. OTP numbers already are; this is a safety net. */
export function toE164(phone: string, defaultCc = '+91'): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return defaultCc + cleaned;
  return '+' + cleaned;
}

/** Run once per key in this browser. Storage blocked: run anyway (transaction_id still dedupes). */
export function fireOnce(key: string, fn: () => void): void {
  const storageKey = `nr_conv_${key}`;
  let seen = false;
  try {
    seen = !!window.localStorage.getItem(storageKey);
  } catch {
    seen = false;
  }
  if (seen) return;
  fn();
  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Storage blocked: nothing to remember.
  }
}

function setUserData(gtag: Gtag, phone?: string | null, email?: string | null) {
  const userData: Record<string, string> = {};
  if (phone) userData.phone_number = toE164(phone);
  if (email && email.includes('@')) userData.email = email.trim().toLowerCase();
  if (Object.keys(userData).length) gtag('set', 'user_data', userData);
}

/** Value the account's conversion actions expect, in INR. */
export const SIGNUP_VALUE_INR = 100;
export const APPLICATION_VALUE_INR = 500;

/**
 * "Sign-up (OTP verified)". Call ONLY when verify-phone returned
 * `signupConversion: true` (the account's first phone verification).
 */
export function trackSignupVerified(p: { userId: string; phone?: string | null; email?: string | null }): void {
  try {
    const gtag = gtagFn();
    const label = signupLabel();
    if (!canTrack() || !gtag || !label || !p.userId) return;
    fireOnce(`signup_${p.userId}`, () => {
      setUserData(gtag, p.phone, p.email);
      gtag('event', 'conversion', {
        send_to: `${gadsId()}/${label}`,
        value: SIGNUP_VALUE_INR,
        currency: 'INR',
        transaction_id: `signup_${p.userId}`,
      });
      gtag('event', 'sign_up', { method: 'phone_otp' });
    });
  } catch {
    // Tracking never blocks sign-in.
  }
}

/**
 * "Application Submitted". Call ONLY when the application save returned 2xx
 * with `applicationConversion: true` (the account's first submitted form).
 */
export function trackApplicationSubmitted(p: {
  applicationId: string;
  phone?: string | null;
  email?: string | null;
}): void {
  try {
    const gtag = gtagFn();
    const label = applicationLabel();
    if (!canTrack() || !gtag || !label || !p.applicationId) return;
    fireOnce(`app_${p.applicationId}`, () => {
      setUserData(gtag, p.phone, p.email);
      gtag('event', 'conversion', {
        send_to: `${gadsId()}/${label}`,
        value: APPLICATION_VALUE_INR,
        currency: 'INR',
        transaction_id: `app_${p.applicationId}`,
      });
      gtag('event', 'generate_lead', { value: APPLICATION_VALUE_INR, currency: 'INR' });
    });
  } catch {
    // Tracking never blocks the form.
  }
}
