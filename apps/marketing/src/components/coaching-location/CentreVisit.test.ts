import { describe, it, expect } from 'vitest';
import { formatIndianPhone, streetOnly } from './CentreVisit';

describe('centre card text', () => {
  it('drops a city the address row repeats', () => {
    expect(streetOnly('1595, North 2nd Street, Pudukkottai', 'Pudukkottai')).toBe('1595, North 2nd Street');
    expect(streetOnly('Electronic City Phase 1, Near M5 Mall', 'Bangalore')).toBe('Electronic City Phase 1, Near M5 Mall');
    expect(streetOnly('Kanchipuram', 'Kanchipuram')).toBeNull();
    expect(streetOnly(null, 'Chennai')).toBeNull();
  });

  it('formats Indian mobile numbers', () => {
    expect(formatIndianPhone('+919176137043')).toBe('+91 91761 37043');
    expect(formatIndianPhone('9176137043')).toBe('+91 91761 37043');
  });
});
