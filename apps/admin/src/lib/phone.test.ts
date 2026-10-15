import { describe, it, expect } from 'vitest';
import { tenDigitPhone } from './phone';

describe('tenDigitPhone', () => {
  it('strips +91 and spaces', () => {
    expect(tenDigitPhone('+91 99672 21751')).toBe('9967221751');
    expect(tenDigitPhone('+919967221751')).toBe('9967221751');
    expect(tenDigitPhone('09967221751')).toBe('9967221751');
    expect(tenDigitPhone('9967221751')).toBe('9967221751');
  });
  it('returns empty for nothing', () => {
    expect(tenDigitPhone(null)).toBe('');
  });
});
