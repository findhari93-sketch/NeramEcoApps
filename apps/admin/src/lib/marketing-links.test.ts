import { describe, it, expect } from 'vitest';
import {
  PROD_MARKETING_ORIGIN,
  marketingOriginFor,
  studentDetailUrl,
  whatsappMessage,
  payBalanceUrl,
  payBalanceMessage,
} from './marketing-links';

describe('marketingOriginFor', () => {
  it('pairs production admin with the bare marketing domain', () => {
    expect(marketingOriginFor('https://admin.neramclasses.com')).toBe('https://neramclasses.com');
  });

  it('pairs staging admin with staging marketing', () => {
    expect(marketingOriginFor('https://staging-admin.neramclasses.com')).toBe(
      'https://staging.neramclasses.com',
    );
  });

  it('maps local admin to the local marketing port', () => {
    expect(marketingOriginFor('http://localhost:3013')).toBe('http://localhost:3010');
    expect(marketingOriginFor('http://127.0.0.1:3013')).toBe('http://127.0.0.1:3010');
  });

  it('lets an explicit configured origin win, trailing slash and all', () => {
    expect(marketingOriginFor('https://admin.neramclasses.com', 'https://example.test/')).toBe(
      'https://example.test',
    );
  });

  it('falls back to production for a preview host with no marketing twin', () => {
    expect(marketingOriginFor('https://neram-admin-new-abc123.vercel.app')).toBe(
      PROD_MARKETING_ORIGIN,
    );
  });

  it('falls back to production rather than throwing on junk', () => {
    expect(marketingOriginFor('')).toBe(PROD_MARKETING_ORIGIN);
    expect(marketingOriginFor(null)).toBe(PROD_MARKETING_ORIGIN);
    expect(marketingOriginFor('not a url')).toBe(PROD_MARKETING_ORIGIN);
  });

  it('does not mistake staging-admin for the admin. prefix', () => {
    // 'staging-admin.' must be tested first; stripping 'admin.' would not match it,
    // but a future edit reordering the checks would silently send staff to production.
    expect(marketingOriginFor('https://staging-admin.neramclasses.com')).not.toBe(
      PROD_MARKETING_ORIGIN,
    );
  });
});

describe('studentDetailUrl', () => {
  it('builds the short public path', () => {
    expect(studentDetailUrl('abc123', { adminOrigin: 'https://admin.neramclasses.com' })).toBe(
      'https://neramclasses.com/s/abc123',
    );
  });

  it('encodes a token so a stray character cannot break the path', () => {
    expect(studentDetailUrl('a/b?c', { adminOrigin: 'https://admin.neramclasses.com' })).toBe(
      'https://neramclasses.com/s/a%2Fb%3Fc',
    );
  });
});

describe('whatsappMessage', () => {
  it('greets by name when we hold one', () => {
    expect(whatsappMessage('Ananya', 'https://x.test/s/t')).toContain('Hi Ananya,');
  });

  it('stays grammatical when we hold no name, which is the common case', () => {
    const msg = whatsappMessage(null, 'https://x.test/s/t');
    expect(msg).toContain('Hi,');
    expect(msg).not.toContain('Hi ,');
    expect(msg).not.toContain('null');
  });

  it('names the sender before it asks for anything', () => {
    // It arrives from an unknown number. Without this it reads like a fee scam.
    const msg = whatsappMessage('Ravi', 'https://x.test/s/t');
    expect(msg.indexOf('Neram Classes')).toBeLessThan(msg.indexOf('https://x.test/s/t'));
  });

  it('includes the link and says how long it lasts', () => {
    const msg = whatsappMessage('Ravi', 'https://x.test/s/tok');
    expect(msg).toContain('https://x.test/s/tok');
    expect(msg).toContain('14 days');
  });

  it('uses no em dashes, which are banned in user-visible copy', () => {
    expect(whatsappMessage('Ravi', 'https://x.test/s/t')).not.toMatch(/[—–]|--/);
  });
});

describe('payBalanceUrl', () => {
  it('points at the pay balance page on the paired marketing host', () => {
    expect(payBalanceUrl({ adminOrigin: 'https://admin.neramclasses.com' })).toBe('https://neramclasses.com/en/pay-balance');
    expect(payBalanceUrl({ adminOrigin: 'https://staging-admin.neramclasses.com' })).toBe('https://staging.neramclasses.com/en/pay-balance');
    expect(payBalanceUrl({ adminOrigin: 'http://localhost:3013' })).toBe('http://localhost:3010/en/pay-balance');
  });

  it('prefers the configured marketing URL', () => {
    expect(payBalanceUrl({ adminOrigin: 'http://localhost:3013', configured: 'https://example.org/' })).toBe('https://example.org/en/pay-balance');
  });
});

describe('payBalanceMessage', () => {
  it('greets by first name and says the amount, the link and how to sign in', () => {
    const msg = payBalanceMessage('Radhika', '₹13,500', 'https://neramclasses.com/en/pay-balance');
    expect(msg).toBe(
      'Hi Radhika, you can pay your Neram Classes balance of ₹13,500 here: https://neramclasses.com/en/pay-balance. Sign in with your registered phone number. Reply here if you need help.',
    );
  });

  it('still reads well without a name or an amount, and has no em dashes', () => {
    const msg = payBalanceMessage('', null, 'https://neramclasses.com/en/pay-balance');
    expect(msg.startsWith('Hi, you can pay your Neram Classes balance here:')).toBe(true);
    expect(msg).not.toMatch(/—|--/);
  });
});
