import { describe, it, expect } from 'vitest';
import { isRealGraphToken } from './sketchbook-access';

describe('isRealGraphToken', () => {
  it('rejects Nexus-internal token families and empties', () => {
    expect(isRealGraphToken(null)).toBe(false);
    expect(isRealGraphToken('')).toBe(false);
    expect(isRealGraphToken('test_abc')).toBe(false);
    expect(isRealGraphToken('imp_abc')).toBe(false);
    expect(isRealGraphToken('par_abc')).toBe(false);
  });
  it('accepts anything else', () => {
    expect(isRealGraphToken('eyJ0eXAiOiJKV1Qi')).toBe(true);
  });
});
