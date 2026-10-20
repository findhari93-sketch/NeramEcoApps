import { describe, it, expect } from 'vitest';
import { parsePaymentMethods, parsePaymentWatchers, DEFAULT_PAYMENT_METHODS } from './settings';

/** Instant UPI starts off and in shadow mode; every number is clamped to something sane. */
describe('parsePaymentMethods', () => {
  it('defaults: Instant UPI off and in shadow, proof methods on, Razorpay off at 2.36%', () => {
    expect(parsePaymentMethods(undefined)).toEqual(DEFAULT_PAYMENT_METHODS);
    expect(DEFAULT_PAYMENT_METHODS.upiAuto).toMatchObject({ enabled: false, shadowMode: true, orderMinutes: 30, instantCapPaise: 5000000, twoChannelAbovePaise: 3000000, silentAfterMinutes: 10 });
    expect(DEFAULT_PAYMENT_METHODS.upiProof.enabled).toBe(true);
    expect(DEFAULT_PAYMENT_METHODS.razorpay).toMatchObject({ enabled: false, feePercent: 2.36 });
  });

  it('reads the seeded snake_case shape and clamps nonsense', () => {
    const m = parsePaymentMethods({
      upi_auto: { enabled: true, shadowMode: false, orderMinutes: 2, instantCapPaise: -5, twoChannelAbovePaise: 'x', silentAfterMinutes: 999 },
      razorpay: { enabled: true, feePercent: 50 },
    });
    expect(m.upiAuto).toMatchObject({ enabled: true, shadowMode: false, orderMinutes: 5, instantCapPaise: 5000000, twoChannelAbovePaise: 3000000, silentAfterMinutes: 120 });
    expect(m.razorpay).toMatchObject({ enabled: true, feePercent: 10 });
  });
});

describe('parsePaymentWatchers', () => {
  it('defaults to the KVB keyword and mailbox domain, no devices, no account tail', () => {
    expect(parsePaymentWatchers(undefined)).toEqual({ smsSenderKeywords: ['KVB'], emailFromDomains: ['kvb.bank.in'], deviceIds: [], accountTail: null });
  });

  it('uppercases keywords, lowercases domains, keeps a 4-digit tail only', () => {
    const w = parsePaymentWatchers({ smsSenderIds: [' kvbupi ', 'KVBANK', ''], emailFromDomains: ['KVB.bank.in'], deviceIds: ['office-phone'], accountTail: '1183' });
    expect(w).toEqual({ smsSenderKeywords: ['KVBUPI', 'KVBANK'], emailFromDomains: ['kvb.bank.in'], deviceIds: ['office-phone'], accountTail: '1183' });
    expect(parsePaymentWatchers({ accountTail: '01183' }).accountTail).toBeNull();
  });
});
