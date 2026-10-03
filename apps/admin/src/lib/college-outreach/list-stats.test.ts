// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { summariseOutreach, EMPTY_OUTREACH_STATS } from './list-stats';

describe('summariseOutreach', () => {
  it('counts every stage, missing emails and tiers', () => {
    expect(
      summariseOutreach([
        { contact_status: null, admissions_email: null, email: null, neram_tier: null },
        { contact_status: 'never_contacted', admissions_email: 'a@x.in', neram_tier: 'free' },
        { contact_status: 'emailed_v1', email: 'b@x.in', neram_tier: 'gold' },
        { contact_status: 'replied', email: 'c@x.in', neram_tier: 'silver' },
        { contact_status: 'claimed', email: 'd@x.in', neram_tier: 'free' },
        { contact_status: 'partner', email: 'e@x.in', neram_tier: 'platinum' },
      ]),
    ).toEqual({ total: 6, neverContacted: 2, emailed: 1, engaged: 2, partner: 1, needsEmail: 1, free: 3, paid: 3 });
  });

  it('is all zeros for no colleges', () => {
    expect(summariseOutreach([])).toEqual(EMPTY_OUTREACH_STATS);
  });
});
