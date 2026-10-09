import { describe, it, expect } from 'vitest';
import { fromStoredPhone, residenceFromStored, storedResidence, toStoredPhone } from './countryConfig';

describe('mobile with its country code', () => {
  it('keeps Indian numbers as 10 digits and others in E.164', () => {
    expect(toStoredPhone('9876543210', 'IN')).toBe('9876543210');
    expect(toStoredPhone('501234567', 'AE')).toBe('+971501234567');
    expect(toStoredPhone('', 'AE')).toBe('');
  });

  it('reads a verified or saved number back into code and digits', () => {
    expect(fromStoredPhone('+919876543210')).toEqual({ phone: '9876543210', phoneCountry: 'IN' });
    expect(fromStoredPhone('+971501234567')).toEqual({ phone: '501234567', phoneCountry: 'AE' });
    expect(fromStoredPhone('+96550012345')).toEqual({ phone: '50012345', phoneCountry: 'KW' });
    expect(fromStoredPhone('9876543210')).toEqual({ phone: '9876543210', phoneCountry: 'IN' });
    // Older Gulf drafts kept digits only, with the country beside them.
    expect(fromStoredPhone('501234567', 'AE')).toEqual({ phone: '501234567', phoneCountry: 'AE' });
  });
});

describe('where the student lives', () => {
  it('stores a listed code, or the typed name for another country', () => {
    expect(storedResidence('IN', '')).toBe('IN');
    expect(storedResidence('OTHER', ' Singapore ')).toBe('Singapore');
    expect(residenceFromStored('AE')).toEqual({ country: 'AE', countryName: '' });
    expect(residenceFromStored('Singapore')).toEqual({ country: 'OTHER', countryName: 'Singapore' });
    expect(residenceFromStored(null)).toEqual({ country: 'IN', countryName: '' });
  });
});
