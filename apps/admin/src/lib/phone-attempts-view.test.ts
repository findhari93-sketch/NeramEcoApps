import { describe, it, expect } from 'vitest';
import type { PhoneAttempt } from '@neram/database';
import { attemptPlace, attemptStatus, formatAttemptPhone, groupAttemptsByPerson } from './phone-attempts-view';

const base: PhoneAttempt = {
  id: 'a1',
  user_id: null,
  anonymous_id: 'anon_1',
  phone: '+919876543210',
  status: 'entered',
  attempts: 1,
  source: '/demo-class',
  source_app: 'marketing',
  last_error_code: null,
  last_error_message: null,
  first_seen_at: '2026-10-09T09:00:00Z',
  last_attempt_at: '2026-10-09T09:00:00Z',
  verified_at: null,
};

describe('phone attempts view', () => {
  it('formats Indian numbers in groups of five', () => {
    expect(formatAttemptPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatAttemptPhone('+971501234567')).toBe('+971501234567');
  });

  it('names the page in staff words, ignoring the locale', () => {
    expect(attemptPlace('/ta/demo-class', 'marketing')).toBe('Demo class');
    expect(attemptPlace('/apply', 'marketing')).toBe('Application');
    expect(attemptPlace('/dashboard', 'app')).toBe('Tools App');
    expect(attemptPlace(null, 'marketing')).toBe('Website');
  });

  it('explains each status in words', () => {
    expect(attemptStatus({ ...base, status: 'verified' })).toEqual({ label: 'Verified', tone: 'success' });
    expect(attemptStatus({ ...base, status: 'otp_sent' }).tone).toBe('warning');
    expect(
      attemptStatus({
        ...base,
        status: 'failed',
        last_error_code: 'auth/internal-error',
        last_error_message: 'reCAPTCHA has already been rendered in this element',
      }),
    ).toEqual({ label: 'Failed: reCAPTCHA check failed', tone: 'error' });
    expect(attemptStatus({ ...base, status: 'failed', last_error_code: 'auth/invalid-verification-code' }).label).toBe(
      'Failed: Wrong OTP entered',
    );
    expect(attemptStatus(base)).toEqual({ label: 'Typed, OTP not sent', tone: 'neutral' });
    expect(attemptStatus({ ...base, last_error_code: 'auth/too-many-requests' }).label).toBe(
      'Tried again after: Too many tries, blocked for a while',
    );
  });

  it('groups numbers per account or visitor, newest first', () => {
    const people = groupAttemptsByPerson([
      { ...base, id: '1', anonymous_id: 'anon_1', last_attempt_at: '2026-10-09T08:00:00Z' },
      { ...base, id: '2', user_id: 'u1', anonymous_id: null, last_attempt_at: '2026-10-09T10:00:00Z' },
      { ...base, id: '3', anonymous_id: 'anon_1', phone: '+919999999999', last_attempt_at: '2026-10-09T09:00:00Z' },
    ]);
    expect(people.map((p) => p.key)).toEqual(['user:u1', 'visitor:anon_1']);
    expect(people[1].attempts).toHaveLength(2);
    expect(people[1].lastAt).toBe('2026-10-09T09:00:00Z');
  });
});
