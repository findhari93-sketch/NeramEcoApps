import { describe, it, expect } from 'vitest';
import { addMonths, classHealth, healthShortText, isMonthKey, monthRange } from './catchup-calendar';

const base = { scheduled_date: '2026-09-11', outstanding: 0, blocked: 0, recap_state: 'published' as const, not_taught: false };

describe('classHealth', () => {
  it('upcoming beats everything', () => {
    expect(classHealth({ ...base, scheduled_date: '2026-10-01', outstanding: 3 }, '2026-09-24')).toBe('upcoming');
  });
  it('not taught', () => {
    expect(classHealth({ ...base, not_taught: true, outstanding: 2 }, '2026-09-24')).toBe('not_taught');
  });
  it('recap missing only when it holds someone up', () => {
    expect(classHealth({ ...base, recap_state: 'draft', outstanding: 2, blocked: 2 }, '2026-09-24')).toBe('recap_missing');
    expect(classHealth({ ...base, recap_state: 'no_recording' }, '2026-09-24')).toBe('all_caught_up');
  });
  it('catching up and all caught up', () => {
    expect(classHealth({ ...base, outstanding: 3 }, '2026-09-24')).toBe('catching_up');
    expect(classHealth(base, '2026-09-24')).toBe('all_caught_up');
  });
});

describe('healthShortText', () => {
  it('always carries words, not only colour', () => {
    expect(healthShortText({ health: 'catching_up', outstanding: 3, blocked: 0 })).toBe('3 to catch up');
    expect(healthShortText({ health: 'recap_missing', outstanding: 1, blocked: 1 })).toBe('Recap missing, 1 waiting');
  });
});

describe('month helpers', () => {
  it('monthRange handles month lengths', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('addMonths crosses years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('isMonthKey', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});
