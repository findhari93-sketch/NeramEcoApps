// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatWhatsAppError, isPermanentWhatsAppFailure, isWhatsAppAccountBlocked } from './whatsapp';

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
