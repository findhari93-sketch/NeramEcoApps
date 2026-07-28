import { describe, it, expect } from 'vitest';
import {
  generateLoginId,
  generateTempPassword,
  normalizeLoginId,
  buildParentMsOid,
  isParentMsOid,
  TEMP_PASSWORD_LENGTH,
} from './parent-credentials';
import { validatePasswordPolicy } from './parent-password';

const AMBIGUOUS = /[01oOlI]/;

describe('normalizeLoginId', () => {
  it('trims and lowercases', () => {
    expect(normalizeLoginId('  Arun.P4821 ')).toBe('arun.p4821');
  });

  it('tolerates null and undefined', () => {
    expect(normalizeLoginId(null)).toBe('');
    expect(normalizeLoginId(undefined)).toBe('');
  });
});

describe('generateLoginId', () => {
  it('uses the child first name plus 4 digits', () => {
    expect(generateLoginId('Arun Kumar')).toMatch(/^arun\.p\d{4}$/);
  });

  it('always emits 4 digits, never 3', () => {
    // randomInt(1000, 10000) guarantees this; a naive 0-9999 would sometimes
    // produce a 1-digit suffix and make IDs inconsistent to read out.
    for (let i = 0; i < 200; i++) {
      expect(generateLoginId('Test Child')).toMatch(/^test\.p\d{4}$/);
    }
  });

  it('strips accents down to plain ASCII', () => {
    expect(generateLoginId('José Álvarez')).toMatch(/^jose\.p\d{4}$/);
  });

  it('falls back to a generic prefix for non-Latin names', () => {
    // Tamil script reduces to nothing; emitting mojibake a parent cannot type
    // would be worse than a generic prefix.
    expect(generateLoginId('அருண்')).toMatch(/^parent\.p\d{4}$/);
  });

  it('falls back for empty, whitespace and symbol-only names', () => {
    for (const name of ['', '   ', '!!!', null, undefined]) {
      expect(generateLoginId(name as string)).toMatch(/^parent\.p\d{4}$/);
    }
  });

  it('caps a very long first name', () => {
    const id = generateLoginId('Venkatanarasimharajuvaripeta');
    expect(id).toMatch(/^[a-z]{12}\.p\d{4}$/);
  });

  it('ignores surnames and extra whitespace', () => {
    expect(generateLoginId('  Arun   Kumar  Raja ')).toMatch(/^arun\.p\d{4}$/);
  });

  it('produces varied IDs for the same name', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateLoginId('Arun')));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('generateTempPassword', () => {
  it('is the expected length by default', () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
  });

  it('never contains ambiguous characters', () => {
    for (let i = 0; i < 300; i++) {
      expect(generateTempPassword()).not.toMatch(AMBIGUOUS);
    }
  });

  it('always contains at least one letter and one digit', () => {
    for (let i = 0; i < 300; i++) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
    }
  });

  it('satisfies the password policy it will be checked against', () => {
    // A generated password that the app would then reject is a support call.
    for (let i = 0; i < 100; i++) {
      expect(validatePasswordPolicy(generateTempPassword(), 'arun.p4821')).toBeNull();
    }
  });

  it('does not put the guaranteed letter and digit in fixed positions', () => {
    const firstChars = new Set(
      Array.from({ length: 200 }, () => generateTempPassword()[0])
    );
    // If the shuffle were missing, position 0 would always be a letter.
    expect(Array.from(firstChars).some((c) => /[0-9]/.test(c))).toBe(true);
  });

  it('enforces a floor of 8 characters', () => {
    expect(generateTempPassword(3)).toHaveLength(8);
  });

  it('produces distinct passwords', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(set.size).toBe(200);
  });
});

describe('parent ms_oid', () => {
  it('prefixes the uuid so parent rows are greppable', () => {
    expect(buildParentMsOid('9f2c0000-0000-0000-0000-000000000001'))
      .toBe('parent:9f2c0000-0000-0000-0000-000000000001');
  });

  it('recognises its own output and rejects a real Entra oid', () => {
    expect(isParentMsOid(buildParentMsOid('abc'))).toBe(true);
    expect(isParentMsOid('9f2c0000-0000-0000-0000-000000000001')).toBe(false);
    expect(isParentMsOid(null)).toBe(false);
    expect(isParentMsOid('')).toBe(false);
  });
});
