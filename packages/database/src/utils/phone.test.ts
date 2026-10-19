import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, normalisePhoneE164, phoneKey } from './phone';

describe('phoneKey', () => {
  it('gives the same key for every way a number was stored', () => {
    // The shapes found on the real duplicate pairs (2026-10-19).
    for (const raw of ['8682822310', '+918682822310', '918682822310', '08682822310', '+91 86828 22310']) {
      expect(phoneKey(raw)).toBe('8682822310');
    }
    expect(phoneKey('+91 97885 46246')).toBe(phoneKey('+919788546246'));
  });

  it('refuses numbers shorter than ten digits', () => {
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey('')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(9876543210)).toBeNull();
  });
});

describe('normalisePhoneE164', () => {
  it('stores Indian mobiles as +91 and ten digits', () => {
    expect(normalisePhoneE164('8682822310')).toBe('+918682822310');
    expect(normalisePhoneE164('08682822310')).toBe('+918682822310');
    expect(normalisePhoneE164('918682822310')).toBe('+918682822310');
    expect(normalisePhoneE164('+91 97885 46246')).toBe('+919788546246');
  });

  it('keeps other country codes', () => {
    expect(normalisePhoneE164('+1 415 555 0100')).toBe('+14155550100');
  });

  it('returns null for partial or empty input', () => {
    expect(normalisePhoneE164('98765')).toBeNull();
    expect(normalisePhoneE164('  ')).toBeNull();
    expect(normalisePhoneE164(undefined)).toBeNull();
  });
});

describe('formatPhoneForDisplay', () => {
  it('groups Indian mobiles as +91 xxxxx xxxxx', () => {
    expect(formatPhoneForDisplay('9818997315')).toBe('+91 98189 97315');
    expect(formatPhoneForDisplay('+919818997315')).toBe('+91 98189 97315');
  });
  it('leaves anything else as it was', () => {
    expect(formatPhoneForDisplay('+14155550100')).toBe('+14155550100');
    expect(formatPhoneForDisplay(null)).toBe('');
  });
});
