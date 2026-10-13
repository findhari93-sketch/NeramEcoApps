import { describe, it, expect, vi } from 'vitest';
import {
  attemptSource,
  getPhoneAttemptsForUser,
  normalizeAttemptPhone,
  parsePhoneCaptureBody,
  recordPhoneAttempt,
} from '../phone-attempts';

const ANON = `anon_${'a'.repeat(32)}`;

describe('normalizeAttemptPhone', () => {
  it('turns the dialog number into E.164', () => {
    expect(normalizeAttemptPhone('+919876543210')).toBe('+919876543210');
    expect(normalizeAttemptPhone('9876543210')).toBe('+919876543210');
    expect(normalizeAttemptPhone('+971 50 123 4567')).toBe('+971501234567');
  });

  it('rejects anything that is not a phone number', () => {
    expect(normalizeAttemptPhone('12345')).toBeNull();
    expect(normalizeAttemptPhone('+1234')).toBeNull();
    expect(normalizeAttemptPhone(42)).toBeNull();
    expect(normalizeAttemptPhone(undefined)).toBeNull();
  });
});

describe('attemptSource', () => {
  it('keeps the path and drops the query string', () => {
    expect(attemptSource('/pay/link/abc?token=secret')).toBe('/pay/link/abc');
    expect(attemptSource('/demo-class#step')).toBe('/demo-class');
  });

  it('ignores full URLs and junk', () => {
    expect(attemptSource('https://evil.example/x')).toBeNull();
    expect(attemptSource(null)).toBeNull();
  });
});

describe('parsePhoneCaptureBody', () => {
  it('defaults to "entered" and reads the anonymous id from the body', () => {
    expect(parsePhoneCaptureBody({ phoneNumber: '+919876543210', anonymousId: ANON, source: '/demo-class' }, null)).toEqual({
      phone: '+919876543210',
      event: 'entered',
      anonymousId: ANON,
      source: '/demo-class',
      errorCode: null,
      errorMessage: null,
    });
  });

  it('falls back to the shared cookie for the anonymous id', () => {
    const parsed = parsePhoneCaptureBody({ phoneNumber: '9876543210' }, `foo=1; neram_anon_id=${ANON}`);
    expect(parsed?.anonymousId).toBe(ANON);
  });

  it('keeps the error only on a failed event', () => {
    const failed = parsePhoneCaptureBody(
      { phoneNumber: '9876543210', event: 'failed', errorCode: 'auth/internal-error', errorMessage: 'reCAPTCHA has already been rendered' },
      null,
    );
    expect(failed).toMatchObject({ event: 'failed', errorCode: 'auth/internal-error' });
    const sent = parsePhoneCaptureBody({ phoneNumber: '9876543210', event: 'otp_sent', errorCode: 'x' }, null);
    expect(sent?.errorCode).toBeNull();
  });

  it('never lets a caller mark a number verified, and drops bad input', () => {
    expect(parsePhoneCaptureBody({ phoneNumber: '9876543210', event: 'verified' }, null)).toBeNull();
    expect(parsePhoneCaptureBody({ phoneNumber: '9876543210', event: 'hacked' }, null)).toBeNull();
    expect(parsePhoneCaptureBody({ phoneNumber: '123' }, null)).toBeNull();
    expect(parsePhoneCaptureBody({ phoneNumber: '9876543210', anonymousId: 'not-an-id' }, null)?.anonymousId).toBeNull();
  });
});

describe('recordPhoneAttempt', () => {
  it('needs an account or a visitor id', async () => {
    const rpc = vi.fn();
    expect(await recordPhoneAttempt({ phone: '+919876543210', event: 'entered' }, { rpc } as any)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the SQL function and never throws', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const ok = await recordPhoneAttempt(
      { anonymousId: ANON, phone: '+919876543210', event: 'failed', errorCode: 'auth/x', errorMessage: 'boom' },
      { rpc } as any,
    );
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'record_phone_attempt',
      expect.objectContaining({ p_user_id: null, p_anonymous_id: ANON, p_event: 'failed', p_error_code: 'auth/x' }),
    );

    const broken = vi.fn().mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await recordPhoneAttempt({ userId: 'u1', phone: '+919876543210', event: 'entered' }, { rpc: broken } as any)).toBe(false);
  });
});

describe('getPhoneAttemptsForUser', () => {
  it('puts the verified number first', async () => {
    const rows = [
      { id: '1', status: 'failed', last_attempt_at: '2026-10-09T10:00:00Z' },
      { id: '2', status: 'verified', last_attempt_at: '2026-10-08T10:00:00Z' },
      { id: '3', status: 'entered', last_attempt_at: '2026-10-07T10:00:00Z' },
    ];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: rows, error: null }),
    };
    const result = await getPhoneAttemptsForUser('u1', { from: () => chain } as any);
    expect(result.map((r) => r.id)).toEqual(['2', '1', '3']);
  });
});
