import { describe, it, expect } from 'vitest';
import {
  examBadgesFor,
  examPointsFor,
  EXAM_BADGE_IDS,
  EXAM_PODIUM_MIN_CANDIDATES,
} from './exam-badges';

const base = {
  rank: 1,
  percentage: 80,
  candidates: 10,
  examsSat: 1,
  previousBestPct: null as number | null,
  sitting: 'main' as const,
};

const input = (over: Partial<Parameters<typeof examBadgesFor>[0]> = {}) => ({
  rank: 1,
  percentage: 88,
  candidates: 16,
  examsSat: 1,
  previousBestPct: null,
  sitting: 'main' as const,
  ...over,
});

describe('examBadgesFor', () => {
  it('awards the topper badge for first place', () => {
    expect(examBadgesFor(base)).toContain(EXAM_BADGE_IDS.topper);
  });

  it('awards the podium badge to the top three, and nobody else', () => {
    expect(examBadgesFor({ ...base, rank: 2 })).toContain(EXAM_BADGE_IDS.podium);
    expect(examBadgesFor({ ...base, rank: 3 })).toContain(EXAM_BADGE_IDS.podium);
    expect(examBadgesFor({ ...base, rank: 4 })).not.toContain(EXAM_BADGE_IDS.podium);
  });

  it('gives first place both badges, because first is also on the podium', () => {
    const earned = examBadgesFor(base);
    expect(earned).toContain(EXAM_BADGE_IDS.topper);
    expect(earned).toContain(EXAM_BADGE_IDS.podium);
  });

  it('awards nothing for placing in a tiny exam', () => {
    // "Topper of a two-student exam" would devalue a legendary badge for
    // everyone who has one.
    const tiny = examBadgesFor({ ...base, candidates: EXAM_PODIUM_MIN_CANDIDATES - 1 });
    expect(tiny).not.toContain(EXAM_BADGE_IDS.topper);
    expect(tiny).not.toContain(EXAM_BADGE_IDS.podium);
  });

  it('awards at exactly the minimum, not one above it', () => {
    expect(examBadgesFor({ ...base, candidates: EXAM_PODIUM_MIN_CANDIDATES })).toContain(
      EXAM_BADGE_IDS.topper,
    );
  });

  it('awards regular on the third exam and not the second', () => {
    expect(examBadgesFor({ ...base, examsSat: 2 })).not.toContain(EXAM_BADGE_IDS.regular);
    expect(examBadgesFor({ ...base, examsSat: 3 })).toContain(EXAM_BADGE_IDS.regular);
  });

  it('awards a personal best only when there is a previous result to beat', () => {
    expect(examBadgesFor({ ...base, previousBestPct: null })).not.toContain(
      EXAM_BADGE_IDS.personalBest,
    );
    expect(examBadgesFor({ ...base, percentage: 80, previousBestPct: 70 })).toContain(
      EXAM_BADGE_IDS.personalBest,
    );
  });

  it('does not award a personal best for equalling it', () => {
    expect(examBadgesFor({ ...base, percentage: 70, previousBestPct: 70 })).not.toContain(
      EXAM_BADGE_IDS.personalBest,
    );
  });

  it('gives the exam day winner the topper and podium badges', () => {
    expect(examBadgesFor(input())).toContain(EXAM_BADGE_IDS.topper);
    expect(examBadgesFor(input())).toContain(EXAM_BADGE_IDS.podium);
  });

  // The scarce thing punctuality buys. A student who sat four weeks later had
  // four more weeks to prepare, so they cannot take a placing from someone who
  // met the deadline.
  it('gives the second sitting winner neither topper nor podium', () => {
    const out = examBadgesFor(input({ sitting: 'second' }));
    expect(out).not.toContain(EXAM_BADGE_IDS.topper);
    expect(out).not.toContain(EXAM_BADGE_IDS.podium);
  });

  // And it does not tell them their work was worth nothing.
  it('still gives the second sitting regular and personal best', () => {
    const out = examBadgesFor(
      input({ sitting: 'second', examsSat: 3, percentage: 80, previousBestPct: 60 }),
    );
    expect(out).toContain(EXAM_BADGE_IDS.regular);
    expect(out).toContain(EXAM_BADGE_IDS.personalBest);
  });

  it('gives an absent student nothing at all', () => {
    expect(examBadgesFor(input({ rank: null }))).toEqual([]);
  });

  it('withholds the podium from a sitting too small for it to mean anything', () => {
    expect(examBadgesFor(input({ candidates: EXAM_PODIUM_MIN_CANDIDATES - 1 }))).not.toContain(
      EXAM_BADGE_IDS.topper,
    );
  });
});

describe('examPointsFor', () => {
  it('scales with the score, so effort moves the leaderboard and not only placing', () => {
    expect(examPointsFor(0)).toBe(0);
    expect(examPointsFor(62)).toBe(62);
    expect(examPointsFor(100)).toBe(100);
  });

  it('clamps out-of-range input rather than trusting it', () => {
    expect(examPointsFor(-20)).toBe(0);
    expect(examPointsFor(140)).toBe(100);
    expect(examPointsFor(NaN)).toBe(0);
  });
});
