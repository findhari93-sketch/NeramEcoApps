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
};

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

  it('awards an absent student nothing at all', () => {
    expect(examBadgesFor({ ...base, rank: null, examsSat: 9 })).toEqual([]);
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
