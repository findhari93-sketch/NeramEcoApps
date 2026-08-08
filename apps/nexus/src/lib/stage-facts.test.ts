import { describe, it, expect } from 'vitest';
import { foldStudentFacts } from './stage-facts';

/**
 * The fold behind every cohort ring in the app.
 *
 * A returning student holds one enrolment per academic year, so each of the four
 * fields has to pick a winner and each picks differently. Getting one wrong is
 * invisible on screen: the ring still draws, it just says the wrong thing about
 * a real person.
 */

type Member = Parameters<typeof foldStudentFacts>[0][number];

function member(over: Partial<Member> & { user_id: string }): Member {
  return {
    enrollment_id: `e-${over.user_id}-${over.enrolled_at || '0'}`,
    enrolled_at: '2026-06-01T00:00:00+00:00',
    batch_id: null,
    is_active: true,
    current_standard: null,
    current_standard_source: null,
    participation_status: 'active',
    dormant_since: null,
    dormant_reason: null,
    ...over,
    user: {
      id: over.user_id,
      name: 'Nithya Raman',
      email: null,
      avatar_url: null,
      ms_oid: null,
      is_alumni: false,
      ...(over.user || {}),
    },
  } as Member;
}

describe('foldStudentFacts', () => {
  it('takes the stage from the newest enrolment, not the first one seen', () => {
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', current_standard: '11th' }),
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', current_standard: '12th' }),
    ]);
    expect(facts.u1.stage).toBe('12th');
  });

  it('still prefers the newest enrolment when its stage is unrecorded', () => {
    // The older row is out of date, so an unset newer row means nobody has
    // classified this student THIS year. Falling back to last year's answer
    // would quietly assert a stage no member of staff has confirmed.
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', current_standard: '12th' }),
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', current_standard: null }),
    ]);
    expect(facts.u1.stage).toBeNull();
  });

  it('calls someone dormant only when every enrolment agrees', () => {
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', participation_status: 'dormant' }),
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', participation_status: 'active' }),
    ]);
    expect(facts.u1.dormant).toBe(false);
  });

  it('clears dormant even when the participating enrolment is the OLDER one', () => {
    // The dormant flag is not tied to the newest-wins branch, so the order rows
    // arrive in must not change the answer.
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', participation_status: 'dormant' }),
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', participation_status: 'active' }),
    ]);
    expect(facts.u1.dormant).toBe(false);
  });

  it('reports dormant when all of the enrolments say so', () => {
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', participation_status: 'dormant' }),
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', participation_status: 'dormant' }),
    ]);
    expect(facts.u1.dormant).toBe(true);
  });

  it('carries the photo and name, which is what lets an id-only screen show a face', () => {
    const facts = foldStudentFacts([
      member({
        user_id: 'u1',
        user: { id: 'u1', name: 'Hari Heera', email: null, avatar_url: 'https://cdn/h.jpg', ms_oid: null, is_alumni: false },
      }),
    ]);
    expect(facts.u1.photo).toBe('https://cdn/h.jpg');
    expect(facts.u1.name).toBe('Hari Heera');
  });

  it('keeps the same photo and name across a second enrolment', () => {
    // Both come off the shared users embed, so first sight is the whole rule.
    // A second enrolment must not blank them, whichever way round they arrive.
    const withPhoto = { id: 'u1', name: 'Hari Heera', email: null, avatar_url: 'https://cdn/h.jpg', ms_oid: null, is_alumni: false };
    const facts = foldStudentFacts([
      member({ user_id: 'u1', enrolled_at: '2025-06-01T00:00:00+00:00', user: withPhoto }),
      member({ user_id: 'u1', enrolled_at: '2026-06-01T00:00:00+00:00', user: withPhoto }),
    ]);
    expect(facts.u1.photo).toBe('https://cdn/h.jpg');
    expect(facts.u1.name).toBe('Hari Heera');
  });

  it('reports a missing photo as null rather than undefined', () => {
    // The provider spreads this straight into a context value that StudentAvatar
    // reads with `??`, so an undefined here and a null here are not the same bug.
    const facts = foldStudentFacts([member({ user_id: 'u1' })]);
    expect(facts.u1.photo).toBeNull();
  });

  it('keeps students separate', () => {
    const facts = foldStudentFacts([
      member({ user_id: 'u1', current_standard: '12th' }),
      member({ user_id: 'u2', current_standard: '10th', participation_status: 'dormant' }),
    ]);
    expect(facts.u1).toMatchObject({ stage: '12th', dormant: false });
    expect(facts.u2).toMatchObject({ stage: '10th', dormant: true });
  });

  it('returns an empty map for an empty roster', () => {
    expect(foldStudentFacts([])).toEqual({});
  });
});
