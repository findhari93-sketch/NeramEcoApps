import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, normalisePhoneE164, phoneKey, storedMobile, mobileParts, mobileE164, mobileCountry, MOBILE_COUNTRIES } from './phone';

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

describe('storedMobile', () => {
  it('keeps every spelling of an Indian number as ten digits', () => {
    for (const raw of ['9500732502', '+919500732502', '+91 95007 32502', '919500732502', '09500732502']) {
      expect(storedMobile(raw)).toBe('9500732502');
    }
  });

  it('keeps Gulf numbers with their code', () => {
    expect(storedMobile('+971 55 199 3240')).toBe('+971551993240');
    expect(storedMobile('+966512345678')).toBe('+966512345678');
    expect(storedMobile('+974 5512 3456')).toBe('+97455123456');
    expect(storedMobile('971551993240')).toBe('+971551993240');
  });

  it('never reads a Saudi number as an Indian one', () => {
    // The old last-ten-digits rule gave "6512345678" here.
    expect(storedMobile('+966 51 234 5678')).not.toBe('6512345678');
  });

  it('refuses what is not a listed mobile', () => {
    expect(storedMobile('')).toBeNull();
    expect(storedMobile('12345')).toBeNull();
    expect(storedMobile('+14155550100')).toBeNull();
    expect(storedMobile('+971 55 199')).toBeNull();
    expect(storedMobile('1551993240')).toBeNull();
  });
});

describe('mobileParts and mobileE164', () => {
  it('splits for the code picker', () => {
    expect(mobileParts('+971551993240')).toMatchObject({ national: '551993240', country: { code: 'AE' } });
    expect(mobileParts('9500732502')).toMatchObject({ national: '9500732502', country: { code: 'IN' } });
    expect(mobileParts(null)).toMatchObject({ national: '', country: { code: 'IN' } });
  });

  it('gives a dialable number', () => {
    expect(mobileE164('9500732502')).toBe('+919500732502');
    expect(mobileE164('+971551993240')).toBe('+971551993240');
    expect(mobileE164('')).toBe('');
  });

  it('agrees with mobileCountry', () => {
    expect(mobileCountry('OM').prefix).toBe('+968');
    expect(mobileCountry('XX').code).toBe('IN');
    expect(MOBILE_COUNTRIES).toHaveLength(7);
  });
});
