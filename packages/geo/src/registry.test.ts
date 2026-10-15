import { describe, expect, it } from 'vitest';
import { cityForName } from './registry';

describe('cityForName with shared names', () => {
  it('a slug wins over another city that shares its name', () => {
    expect(cityForName('Aurangabad')).toBe('aurangabad');
    expect(cityForName('aurangabad-bihar')).toBe('aurangabad-bihar');
  });

  it('the state picks the town when a name is shared', () => {
    expect(cityForName('Aurangabad', 'bihar')).toBe('aurangabad-bihar');
    expect(cityForName('Aurangabad', 'maharashtra')).toBe('aurangabad');
    expect(cityForName('Bijapur', 'karnataka')).toBe('bijapur');
    expect(cityForName('Bijapur', 'chhattisgarh')).toBe('bijapur-chhattisgarh');
  });

  it('falls back to the plain lookup when the state has no such town', () => {
    expect(cityForName('Mysuru', 'kerala')).toBe('mysore');
  });
});
