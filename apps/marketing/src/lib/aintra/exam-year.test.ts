import { describe, it, expect } from 'vitest';
import { assistantAskedExamYear, extractExamYearAnswer, askExamYearPrompt } from './exam-year';

const now = new Date('2026-10-19T06:00:00Z'); // season 2027, plausible 2026..2031

describe('assistantAskedExamYear', () => {
  it('spots the question in an earlier assistant turn', () => {
    expect(assistantAskedExamYear(['Great question! Which year are you planning to write NATA?'])).toBe(true);
    expect(assistantAskedExamYear(['By the way, what is your exam year?'])).toBe(true);
    expect(assistantAskedExamYear(['Our fees are listed on the fees page.'])).toBe(false);
  });
});

describe('extractExamYearAnswer', () => {
  it('reads a plain year after the assistant asked', () => {
    expect(extractExamYearAnswer('2028', { justAsked: true, now })).toBe(2028);
    expect(extractExamYearAnswer('I will write in 2027', { justAsked: true, now })).toBe(2027);
  });

  it('reads a cohort code as the exam year it leads to', () => {
    expect(extractExamYearAnswer('2027-28 batch', { justAsked: true, now })).toBe(2028);
  });

  it('reads this year and next year only when the question was just asked', () => {
    expect(extractExamYearAnswer('this year', { justAsked: true, now })).toBe(2027);
    expect(extractExamYearAnswer('next year', { justAsked: true, now })).toBe(2028);
    expect(extractExamYearAnswer('what are the fees this year', { justAsked: false, now })).toBeNull();
  });

  it('takes an unprompted year only when the message is about the exam', () => {
    expect(extractExamYearAnswer('I am preparing for NATA 2028', { justAsked: false, now })).toBe(2028);
    expect(extractExamYearAnswer('Was the college founded in 2028?', { justAsked: false, now })).toBeNull();
  });

  it('refuses two different years, or an implausible one', () => {
    expect(extractExamYearAnswer('2027 or 2028, not sure', { justAsked: true, now })).toBeNull();
    expect(extractExamYearAnswer('I wrote NATA in 2019', { justAsked: true, now })).toBeNull();
    expect(extractExamYearAnswer('NATA 2035', { justAsked: true, now })).toBeNull();
    expect(extractExamYearAnswer('not sure yet', { justAsked: true, now })).toBeNull();
  });
});

describe('askExamYearPrompt', () => {
  it('offers this season and the next two, with no em dashes', () => {
    const p = askExamYearPrompt(now);
    expect(p).toContain('2027, 2028 or 2029');
    expect(p).not.toMatch(/—|--/);
  });
});
