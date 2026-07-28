import { describe, it, expect } from 'vitest';
import {
  hasMicrosoftAccount,
  isAwaitingMicrosoft,
  AWAITING_MICROSOFT_LABEL,
  AWAITING_MICROSOFT_TOOLTIP,
} from './microsoft-account';

/**
 * This rule decides who counts as a Nexus student in staff screens. It exists
 * because enrollment and sign-in capability are not the same thing: the marketing
 * direct-enrollment link creates the enrollment row the moment a student pays,
 * while they still hold only a Google login. Three such students (Anuvika, Ooveya,
 * Vishnu) ended up duplicated in the live classroom because their Microsoft
 * account later landed on a second users row, and every one of them showed twice
 * in the photo review queue with a Google account picture they never submitted.
 */

describe('hasMicrosoftAccount', () => {
  it('is true for a real Entra object id', () => {
    expect(hasMicrosoftAccount('ea1a58d9-7e97-4bc5-b68b-c8b349ef3253')).toBe(true);
  });

  it('is false when there is no oid at all', () => {
    expect(hasMicrosoftAccount(null)).toBe(false);
    expect(hasMicrosoftAccount(undefined)).toBe(false);
    expect(hasMicrosoftAccount('')).toBe(false);
  });

  it('accepts the synthetic Playwright oids', () => {
    // Deliberately NOT the `test-oid-` exclusion lib/nexus-members.ts applies to
    // staff: the student fixtures carry synthetic oids and must keep behaving
    // like real students, or the E2E roster empties out.
    expect(hasMicrosoftAccount('test-oid-1775529264582')).toBe(true);
  });
});

describe('isAwaitingMicrosoft', () => {
  it('is the exact inverse of holding an account', () => {
    for (const oid of [null, undefined, '', 'oid-1', 'test-oid-9']) {
      expect(isAwaitingMicrosoft(oid)).toBe(!hasMicrosoftAccount(oid));
    }
  });

  it('flags the paid-but-unprovisioned new joinee', () => {
    // CHETANA, enrolled 2026-07-26 through the marketing link, no mailbox yet.
    expect(isAwaitingMicrosoft(null)).toBe(true);
  });
});

describe('the copy shown to staff', () => {
  it('names the missing thing rather than a system state', () => {
    expect(AWAITING_MICROSOFT_LABEL).toBe('No Microsoft account');
  });

  it('tells staff what to do next, not just what is wrong', () => {
    expect(AWAITING_MICROSOFT_TOOLTIP).toMatch(/Entra/);
    expect(AWAITING_MICROSOFT_TOOLTIP).toMatch(/Refresh from Entra/);
  });

  it('avoids the punctuation that reads as machine-written', () => {
    for (const copy of [AWAITING_MICROSOFT_LABEL, AWAITING_MICROSOFT_TOOLTIP]) {
      expect(copy).not.toMatch(/—|--|&mdash;/);
    }
  });
});
