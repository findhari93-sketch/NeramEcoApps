import { describe, expect, test } from 'vitest';
import {
  ageInYears,
  FEEDBACK_TOPICS,
  isMinorFromDob,
  nextTestimonialAllowedAt,
  parseFeedbackTopics,
  suggestDisplayName,
  TESTIMONIAL_COOLDOWN_DAYS,
} from './learner-feedback';

const NOW = new Date(2026, 8, 26, 12, 0, 0); // 26 Sep 2026, local time
const DAY = 86400000;

describe('ageInYears', () => {
  test('counts whole years, before and after the birthday', () => {
    expect(ageInYears('2008-09-26', NOW)).toBe(18);
    expect(ageInYears('2008-09-27', NOW)).toBe(17);
    expect(ageInYears('2000-01-01', NOW)).toBe(26);
  });

  test('accepts a full ISO timestamp', () => {
    expect(ageInYears('2008-09-26T00:00:00.000Z', NOW)).toBe(18);
  });

  test('returns null for unknown or invalid values', () => {
    expect(ageInYears(null, NOW)).toBeNull();
    expect(ageInYears(undefined, NOW)).toBeNull();
    expect(ageInYears('', NOW)).toBeNull();
    expect(ageInYears('not a date', NOW)).toBeNull();
    expect(ageInYears('2008-13-01', NOW)).toBeNull();
    expect(ageInYears('2030-01-01', NOW)).toBeNull(); // in the future
  });
});

describe('isMinorFromDob', () => {
  test('under 18 is a minor, 18 is not', () => {
    expect(isMinorFromDob('2008-09-27', NOW)).toBe(true);
    expect(isMinorFromDob('2008-09-26', NOW)).toBe(false);
    expect(isMinorFromDob('1999-05-10', NOW)).toBe(false);
  });

  test('an unknown date of birth counts as under 18', () => {
    expect(isMinorFromDob(null, NOW)).toBe(true);
    expect(isMinorFromDob(undefined, NOW)).toBe(true);
    expect(isMinorFromDob('garbage', NOW)).toBe(true);
  });
});

describe('nextTestimonialAllowedAt', () => {
  test('null when there is no earlier review', () => {
    expect(nextTestimonialAllowedAt(null, NOW)).toBeNull();
  });

  test('blocks for 30 days after the last review', () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * DAY).toISOString();
    const next = nextTestimonialAllowedAt(tenDaysAgo, NOW);
    expect(next).not.toBeNull();
    expect(Math.round((next!.getTime() - NOW.getTime()) / DAY)).toBe(TESTIMONIAL_COOLDOWN_DAYS - 10);
  });

  test('allows again after 30 days', () => {
    const longAgo = new Date(NOW.getTime() - 31 * DAY).toISOString();
    expect(nextTestimonialAllowedAt(longAgo, NOW)).toBeNull();
  });
});

describe('suggestDisplayName', () => {
  test('first name and last initial', () => {
    expect(suggestDisplayName({ first_name: 'Priya', last_name: 'sundar' })).toBe('Priya S.');
    expect(suggestDisplayName({ first_name: 'Priya', last_name: null })).toBe('Priya');
    expect(suggestDisplayName({ name: 'Arun Kumar Raj' })).toBe('Arun R.');
    expect(suggestDisplayName({ name: '' })).toBe('');
    expect(suggestDisplayName(null)).toBe('');
  });
});

describe('parseFeedbackTopics', () => {
  test('missing topics means none', () => {
    expect(parseFeedbackTopics(undefined)).toEqual({ ok: true, topics: [] });
    expect(parseFeedbackTopics(null)).toEqual({ ok: true, topics: [] });
    expect(parseFeedbackTopics([])).toEqual({ ok: true, topics: [] });
  });

  test('keeps known slugs, dedupes, and orders them like the list', () => {
    expect(parseFeedbackTopics(['sign_in', 'ui_ux', 'sign_in'])).toEqual({ ok: true, topics: ['ui_ux', 'sign_in'] });
  });

  test('refuses unknown slugs, labels and non-arrays', () => {
    expect(parseFeedbackTopics(['ui_ux', 'hacking'])).toEqual({ ok: false, invalid: ['hacking'] });
    expect(parseFeedbackTopics(['UI and UX'])).toEqual({ ok: false, invalid: ['UI and UX'] });
    expect(parseFeedbackTopics('ui_ux')).toEqual({ ok: false, invalid: ['ui_ux'] });
    expect(parseFeedbackTopics([1])).toEqual({ ok: false, invalid: [1] });
  });

  test('has the 14 agreed topics with unique slugs and no dashes in labels', () => {
    expect(FEEDBACK_TOPICS).toHaveLength(14);
    expect(new Set(FEEDBACK_TOPICS.map((t) => t.slug)).size).toBe(14);
    for (const t of FEEDBACK_TOPICS) {
      expect(t.slug).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.label).not.toMatch(/—|--/);
    }
  });
});
