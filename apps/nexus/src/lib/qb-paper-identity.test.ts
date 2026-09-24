import { describe, it, expect } from 'vitest';
import { bodyEditsIdentity, parsePaperIdentityEdit, renameErrorStatus, sessionOptionsFor } from './qb-paper-identity';

const NOW = new Date('2026-09-24T00:00:00Z');
const PAPER = { year: 2019, session: 'Session 1', shift: 'forenoon' };

describe('parsePaperIdentityEdit', () => {
  it('turns a forenoon paper into the afternoon one, keeping the rest', () => {
    expect(parsePaperIdentityEdit({ shift: 'afternoon' }, PAPER, NOW)).toEqual({
      ok: true,
      value: { year: 2019, session: 'Session 1', shift: 'afternoon' },
    });
  });

  it('trims the session and reads an empty one, or an empty shift, as none', () => {
    expect(parsePaperIdentityEdit({ session: '  Session 2 ', shift: '' }, PAPER, NOW)).toEqual({
      ok: true,
      value: { year: 2019, session: 'Session 2', shift: null },
    });
    expect(parsePaperIdentityEdit({ session: '   ' }, PAPER, NOW)).toMatchObject({ ok: true, value: { session: null } });
  });

  it('refuses a year out of range, a shift it does not know and an overlong session', () => {
    expect(parsePaperIdentityEdit({ year: 1999 }, PAPER, NOW)).toEqual({ ok: false, error: 'Year must be between 2000 and 2027' });
    expect(parsePaperIdentityEdit({ year: 2028 }, PAPER, NOW).ok).toBe(false);
    expect(parsePaperIdentityEdit({ year: '2019.5' }, PAPER, NOW).ok).toBe(false);
    expect(parsePaperIdentityEdit({ shift: 'evening' }, PAPER, NOW).ok).toBe(false);
    expect(parsePaperIdentityEdit({ session: 'x'.repeat(41) }, PAPER, NOW).ok).toBe(false);
    expect(parsePaperIdentityEdit({ session: 12 }, PAPER, NOW).ok).toBe(false);
  });
});

describe('bodyEditsIdentity', () => {
  it('is true only when a body touches the year, session or shift', () => {
    expect(bodyEditsIdentity({ shift: 'afternoon' })).toBe(true);
    expect(bodyEditsIdentity({ session: null })).toBe(true);
    expect(bodyEditsIdentity({ pdf_url: 'x' })).toBe(false);
  });
});

describe('renameErrorStatus', () => {
  it('maps the function errors to what the dialog can show', () => {
    expect(renameErrorStatus('P0002')).toBe(404);
    expect(renameErrorStatus('23505')).toBe(409);
    expect(renameErrorStatus('22023')).toBe(400);
    expect(renameErrorStatus('XX000')).toBe(500);
  });
});

describe('sessionOptionsFor', () => {
  it('offers sessions for JEE and tests for NATA', () => {
    expect(sessionOptionsFor('JEE_PAPER_2').map((o) => o.value)).toEqual(['Session 1', 'Session 2']);
    expect(sessionOptionsFor('NATA').map((o) => o.value)).toEqual(['Test 1', 'Test 2', 'Test 3']);
  });
});
