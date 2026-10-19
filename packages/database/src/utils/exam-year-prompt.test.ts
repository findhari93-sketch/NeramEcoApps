import { describe, it, expect } from 'vitest';
import {
  readExamYearPromptState,
  snoozeExamYearPrompt,
  isExamYearPromptDue,
} from './exam-year-prompt';

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-19T06:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe('readExamYearPromptState', () => {
  it('starts empty for missing or junk metadata', () => {
    for (const raw of [undefined, null, 'x', 42, {}, { dismissed_count: 'two' }]) {
      expect(readExamYearPromptState(raw)).toEqual({
        dismissed_count: 0,
        last_dismissed_at: null,
        last_action: null,
        snooze_until: null,
      });
    }
  });
});

describe('isExamYearPromptDue + snoozeExamYearPrompt', () => {
  it('a student who never answered is asked', () => {
    expect(isExamYearPromptDue(readExamYearPromptState(undefined), t0)).toBe(true);
  });

  it('the first "Later" waits one day', () => {
    const s = snoozeExamYearPrompt(readExamYearPromptState(undefined), 'later', t0);
    expect(s.dismissed_count).toBe(1);
    expect(isExamYearPromptDue(s, at(0.5))).toBe(false);
    expect(isExamYearPromptDue(s, at(1))).toBe(true);
  });

  it('after two snoozes it asks at most once a week', () => {
    const one = snoozeExamYearPrompt(readExamYearPromptState(undefined), 'later', t0);
    const two = snoozeExamYearPrompt(one, 'later', at(1));
    expect(two.dismissed_count).toBe(2);
    expect(isExamYearPromptDue(two, at(1 + 6.9))).toBe(false);
    expect(isExamYearPromptDue(two, at(1 + 7))).toBe(true);
    const three = snoozeExamYearPrompt(two, 'later', at(8));
    expect(isExamYearPromptDue(three, at(8 + 6))).toBe(false);
    expect(isExamYearPromptDue(three, at(8 + 7))).toBe(true);
  });

  it('"Not sure yet" counts as a snooze with a 30 day wait', () => {
    const s = snoozeExamYearPrompt(readExamYearPromptState(undefined), 'not_sure', t0);
    expect(s.dismissed_count).toBe(1);
    expect(s.last_action).toBe('not_sure');
    expect(isExamYearPromptDue(s, at(29))).toBe(false);
    expect(isExamYearPromptDue(s, at(30))).toBe(true);
  });

  it('falls back to the count rule when snooze_until is missing', () => {
    const legacy = readExamYearPromptState({ dismissed_count: 3, last_dismissed_at: t0.toISOString() });
    expect(isExamYearPromptDue(legacy, at(3))).toBe(false);
    expect(isExamYearPromptDue(legacy, at(7))).toBe(true);
  });

  it('an unreadable date never hides the sheet forever', () => {
    const broken = readExamYearPromptState({ dismissed_count: 1, last_dismissed_at: 'soon', snooze_until: 'never' });
    expect(isExamYearPromptDue(broken, t0)).toBe(true);
  });
});
