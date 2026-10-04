import { describe, it, expect } from 'vitest';
import { formatCentreHours, formatClock } from './centre-hours';

describe('centre hours', () => {
  it('formats clock times', () => {
    expect(formatClock('09:00')).toBe('9 am');
    expect(formatClock('13:30')).toBe('1:30 pm');
    expect(formatClock('12:00')).toBe('12 pm');
  });

  it('groups consecutive days with the same hours', () => {
    const day = { open: '09:00', close: '18:00' };
    expect(
      formatCentreHours({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: { open: '09:00', close: '14:00' }, sun: null }),
    ).toEqual(['Mon to Fri: 9 am to 6 pm', 'Sat: 9 am to 2 pm', 'Sun: closed']);
  });

  it('accepts long day names and returns nothing for missing hours', () => {
    expect(formatCentreHours({ monday: { open: '10:00', close: '17:00' } })[0]).toBe('Mon: 10 am to 5 pm');
    expect(formatCentreHours(null)).toEqual([]);
  });
});
