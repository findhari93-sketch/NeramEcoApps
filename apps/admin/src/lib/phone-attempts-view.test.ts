import { describe, it, expect } from 'vitest';
import type { PhoneAttempt } from '@neram/database';
import {
  attemptPlace,
  attemptStatus,
  attemptSteps,
  diagnoseAttempt,
  diagnosePerson,
  formatAttemptPhone,
  groupAttemptsByPerson,
  stuckAlertText,
} from './phone-attempts-view';

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

describe('why someone got stuck', () => {
  const sent: PhoneAttempt = { ...base, status: 'otp_sent' };

  it('calls reCAPTCHA and our server failing a bug, not the student', () => {
    expect(diagnoseAttempt({ ...base, status: 'failed', last_error_code: 'auth/captcha-check-failed' }).kind).toBe('bug');
    expect(diagnoseAttempt({ ...base, status: 'failed', last_error_message: 'reCAPTCHA has already been rendered in this element' }).kind).toBe('bug');
    const server = diagnoseAttempt({ ...sent, status: 'failed', last_error_code: 'neram/verify-phone-500' });
    expect(server.kind).toBe('bug');
    expect(server.reason).toMatch(/server/);
  });

  it('points at the in-app browser when reCAPTCHA fails inside one', () => {
    const d = diagnoseAttempt({ ...base, status: 'failed', last_error_code: 'auth/captcha-check-failed', browser: 'Instagram in-app browser' });
    expect(d.hint).toMatch(/Chrome or Safari/);
  });

  it('treats Firebase SMS limits and repeated resends as an SMS problem', () => {
    expect(diagnoseAttempt({ ...base, status: 'failed', last_error_code: 'auth/quota-exceeded' }).kind).toBe('sms');
    expect(diagnoseAttempt({ ...sent, attempts: 3 }).kind).toBe('sms');
  });

  it('treats a wrong code, a closed dialog or a skip as the student stopping', () => {
    expect(diagnoseAttempt({ ...sent, status: 'failed', last_error_code: 'auth/invalid-verification-code', otp_tries: 2 }).reason).toBe(
      'Wrong OTP entered (2 codes tried)',
    );
    expect(diagnoseAttempt({ ...sent, left_via: 'closed' }).kind).toBe('student');
    expect(diagnoseAttempt({ ...sent, left_via: 'skipped' }).reason).toMatch(/tapped Skip/);
    expect(diagnoseAttempt({ ...base, status: 'failed', last_error_code: 'PHONE_ALREADY_EXISTS' }).kind).toBe('student');
  });

  it('flags a send or a check that never finished as a bug', () => {
    expect(diagnoseAttempt({ ...base, status: 'entered', events: [{ e: 'entered', at: '2026-10-09T09:00:00Z' }] }).kind).toBe('bug');
    // Older rows have no steps: unknown, not a bug.
    expect(diagnoseAttempt({ ...base, status: 'entered' }).kind).toBe('unclear');
    expect(diagnoseAttempt({ ...sent, otp_tries: 1 }).kind).toBe('bug');
  });

  it('is unsure about an OTP sent with nothing after it (older rows)', () => {
    expect(diagnoseAttempt(sent).kind).toBe('unclear');
  });

  it('gives a person the most serious reason across their numbers', () => {
    const typo = { ...sent, id: 'n1', left_via: 'closed' as const, last_attempt_at: '2026-10-09T09:05:00Z' };
    const broken = { ...base, id: 'n2', phone: '+919600245596', status: 'failed' as const, last_error_code: 'auth/internal-error' };
    const d = diagnosePerson([typo, broken]);
    expect(d.kind).toBe('bug');
    expect(d.attempt?.id).toBe('n2');
  });

  it('lists the steps in staff words', () => {
    const steps = attemptSteps({
      ...sent,
      events: [
        { e: 'entered', at: '2026-10-09T09:00:00Z' },
        { e: 'otp_sent', at: '2026-10-09T09:00:02Z' },
        { e: 'failed', at: '2026-10-09T09:01:00Z', c: 'auth/code-expired' },
        { e: 'closed', at: '2026-10-09T09:02:00Z' },
      ],
    });
    expect(steps.map((s) => s.text)).toEqual(['Tapped Send OTP', 'OTP sent', 'Failed: OTP expired', 'Closed the dialog']);
    expect(steps[2].failed).toBe(true);
  });

  it('writes the alert with who, number, place and reason', () => {
    const alert = stuckAlertText({ name: 'Asha', attempts: [{ ...sent, left_via: 'closed' }] });
    expect(alert.title).toBe('Stuck at phone sign-in: Student stopped');
    expect(alert.body).toContain('Asha, +91 98765 43210');
    expect(alert.body).toContain('Demo class');
    expect(alert.body).not.toMatch(/\u2014|--/);
  });
});
