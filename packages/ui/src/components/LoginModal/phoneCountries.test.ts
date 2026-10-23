import { describe, it, expect } from 'vitest';
import { PHONE_COUNTRIES, dialFor, openingPhone } from './phoneCountries';

describe('PHONE_COUNTRIES', () => {
  it('has a placeholder of the right length for each', () => {
    for (const c of PHONE_COUNTRIES) expect(c.placeholder).toHaveLength(c.length);
  });
});

describe('openingPhone', () => {
  it('opens a Gulf number on its own country', () => {
    expect(openingPhone('+971551993240', '+91', 10)).toMatchObject({ dial: { prefix: '+971', length: 9 }, digits: '551993240' });
    expect(openingPhone('+966 51 234 5678', '+91', 10)).toMatchObject({ dial: { prefix: '+966' }, digits: '512345678' });
  });

  it('opens Indian numbers in every spelling on +91', () => {
    for (const raw of ['9500732502', '+919500732502', '919500732502', '09500732502']) {
      expect(openingPhone(raw, '+91', 10)).toMatchObject({ dial: { prefix: '+91' }, digits: '9500732502' });
    }
  });

  it('opens empty on the caller code', () => {
    expect(openingPhone('', '+974', 8)).toMatchObject({ dial: { prefix: '+974', length: 8 }, digits: '' });
  });

  it('keeps a caller code outside the list', () => {
    expect(dialFor('+1', 10)).toEqual({ prefix: '+1', length: 10, placeholder: '' });
  });
});
