// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatWhatsAppError, isPermanentWhatsAppFailure, isWhatsAppAccountBlocked, sendBlockFromHealthStatus } from './whatsapp';

describe('WhatsApp account-level errors', () => {
  it('classifies "Account not registered" (#133010) as an account block, not a lead failure', () => {
    const msg = formatWhatsAppError({ error: { code: 133010, message: '(#133010) Account not registered' } }, 400);
    expect(msg.startsWith('WA_ACCOUNT_BLOCKED')).toBe(true);
    expect(msg).toContain('#133010');
    expect(isWhatsAppAccountBlocked(msg)).toBe(true);
    expect(isPermanentWhatsAppFailure(msg)).toBe(false);
  });

  it('treats a locked account, payment problem and expired token the same way', () => {
    for (const code of [131031, 131042, 368, 190]) {
      expect(isWhatsAppAccountBlocked(formatWhatsAppError({ error: { code, message: 'x' } }))).toBe(true);
    }
  });

  it('leaves recipient and unknown errors as they were', () => {
    expect(isWhatsAppAccountBlocked(formatWhatsAppError({ error: { code: 131026, message: 'x' } }))).toBe(false);
    expect(formatWhatsAppError({ error: { code: 1, message: 'An unknown error has occurred.' } })).toBe('WA_ERROR_1: An unknown error has occurred.');
    expect(isWhatsAppAccountBlocked(null)).toBe(false);
  });
});

describe('sendBlockFromHealthStatus', () => {
  it('names the blocked entity and error (the inactive WABA seen on 2026-10-15)', () => {
    const reason = sendBlockFromHealthStatus({
      can_send_message: 'BLOCKED',
      entities: [
        { entity_type: 'PHONE_NUMBER', can_send_message: 'LIMITED', errors: [{ error_code: 138024, error_description: 'SIP not enabled' }] },
        { entity_type: 'WABA', can_send_message: 'BLOCKED', errors: [{ error_code: 141008, error_description: 'The WABA status is not active.' }] },
      ],
    });
    expect(isWhatsAppAccountBlocked(reason)).toBe(true);
    expect(reason).toContain('WABA #141008: The WABA status is not active.');
    expect(reason).not.toContain('138024');
  });

  it('is null when sending is available or limited', () => {
    expect(sendBlockFromHealthStatus({ can_send_message: 'AVAILABLE' })).toBeNull();
    expect(sendBlockFromHealthStatus({ can_send_message: 'LIMITED' })).toBeNull();
    expect(sendBlockFromHealthStatus(undefined)).toBeNull();
  });
});
