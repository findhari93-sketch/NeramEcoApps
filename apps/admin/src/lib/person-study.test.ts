import { describe, expect, it } from 'vitest';
import { demoClassToStage, resolveStudyStage, twelfthYearOptions } from './person-study';

describe('demoClassToStage', () => {
  it('reads the demo booking classes', () => {
    expect(demoClassToStage('12th-pass')).toBe('gap_year');
    expect(demoClassToStage('12th')).toBe('12th');
    expect(demoClassToStage(' 11th ')).toBe('11th');
    expect(demoClassToStage('other')).toBeNull();
    expect(demoClassToStage(null)).toBeNull();
  });
});

describe('resolveStudyStage', () => {
  it('takes Nexus first, then staff, then the application, then the demo booking', () => {
    const all = { enrolment: '12th', staff: 'gap_year', application: '11th' as const, demo: '10th' };
    expect(resolveStudyStage(all)).toMatchObject({ stage: '12th', source: 'nexus' });
    expect(resolveStudyStage({ ...all, enrolment: null })).toMatchObject({ stage: 'gap_year', source: 'staff' });
    expect(resolveStudyStage({ ...all, enrolment: null, staff: null })).toMatchObject({
      stage: '11th',
      source: 'application',
    });
    expect(resolveStudyStage({ demo: '12th-pass' })).toMatchObject({ stage: 'gap_year', source: 'demo' });
    expect(resolveStudyStage({})).toEqual({ stage: null, source: null, twelfthPassedYear: null });
  });

  it('ignores a value outside the four stages', () => {
    expect(resolveStudyStage({ enrolment: '9th', staff: '12th' })).toMatchObject({ stage: '12th', source: 'staff' });
  });

  it('gives the finished-12th year only for a break year, staff before the application', () => {
    expect(resolveStudyStage({ staff: 'gap_year', staffTwelfthYear: 2025, applicationTwelfthYear: '2024' }).twelfthPassedYear).toBe(2025);
    expect(resolveStudyStage({ application: 'gap_year', applicationTwelfthYear: '2024' }).twelfthPassedYear).toBe(2024);
    expect(resolveStudyStage({ application: 'gap_year', applicationTwelfthYear: 'last year' }).twelfthPassedYear).toBeNull();
    expect(resolveStudyStage({ staff: '12th', staffTwelfthYear: 2025 }).twelfthPassedYear).toBeNull();
  });
});

describe('twelfthYearOptions', () => {
  it('runs from this year back to 2015', () => {
    const years = twelfthYearOptions(new Date('2026-10-24'));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2015);
  });
});
