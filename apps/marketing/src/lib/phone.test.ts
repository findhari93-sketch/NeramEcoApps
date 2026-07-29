import { describe, it, expect } from 'vitest';
import { normalisePhone } from './phone';

/**
 * Regression: the Chetana duplicate, 2026-07-28. A direct-enrolment student who
 * signed in with Google kept users.phone NULL, which blinded the admin Entra
 * reconciler and made it insert a duplicate student row. The enrolment route now
 * persists the verified number through this helper.
 */
describe('normalisePhone', () => {
  it('adds the Indian country code to a bare 10-digit mobile', () => {
    expect(normalisePhone('9949414949')).toBe('+919949414949');
  });

  it('strips the spacing that made stored numbers unmatchable', () => {
    // A real stored value: "89255 30367" never matched an eq lookup.
    expect(normalisePhone('89255 30367')).toBe('+918925530367');
    expect(normalisePhone('99494-14949')).toBe('+919949414949');
    expect(normalisePhone('  9949414949  ')).toBe('+919949414949');
  });

  it('keeps an already-normalised number unchanged', () => {
    expect(normalisePhone('+919949414949')).toBe('+919949414949');
  });

  it('drops the trunk 0 from a 0-prefixed Indian mobile', () => {
    expect(normalisePhone('09949414949')).toBe('+919949414949');
  });

  it('preserves non-Indian country codes', () => {
    expect(normalisePhone('+971504402793')).toBe('+971504402793');
    expect(normalisePhone('971504402793')).toBe('+971504402793');
  });

  it('returns null rather than storing an unmatchable partial number', () => {
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('   ')).toBeNull();
    expect(normalisePhone('not a phone')).toBeNull();
    expect(normalisePhone('+123')).toBeNull();
    // Longer than E.164 allows.
    expect(normalisePhone('1234567890123456')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone(9949414949)).toBeNull();
  });
});
