// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  deriveAccountStatus,
  deriveEngagement,
  deriveLifecycleStage,
  profileCompleteness,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_MEANINGS,
  deriveExamYear,
  batchCodeForExamYear,
  examYearForBatchCode,
  activityGroupOf,
  ACTIVITY_GROUPS,
  PEOPLE_STAGE_LABELS,
} from './lifecycle-rules';

const now = new Date('2026-09-25T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('deriveLifecycleStage', () => {
  it.each([
    ['graduated beats everything, even a live enrolment', { is_alumni: true, has_live_enrollment: true }, 'alumni'],
    ['archived lead', { lifecycle_status: 'archived', has_lead_profile: true }, 'archived'],
    ['staff pause', { has_live_enrollment: true, participation_status: 'dormant', dormant_source: 'staff', nexus_entered_at: daysAgo(3) }, 'paused'],
    ['not started is not paused', { has_live_enrollment: true, participation_status: 'dormant', dormant_source: 'auto' }, 'enrolled'],
    ['entered Nexus', { has_live_enrollment: true, nexus_entered_at: daysAgo(1) }, 'active_student'],
    ['paid through the site, no classroom yet', { application_status: 'enrolled' }, 'enrolled'],
    ['student profile only', { has_student_profile: true }, 'enrolled'],
    ['submitted form', { application_status: 'submitted', has_lead_profile: true }, 'applicant'],
    ['approved but unpaid is still an applicant', { application_status: 'approved' }, 'applicant'],
    ['draft form is a lead', { application_status: 'draft', has_lead_profile: true }, 'lead'],
    ['verified phone only', { phone_verified: true }, 'lead'],
    ['booked a demo', { demo_registration_count: 1 }, 'lead'],
    ['Google sign-up and nothing else', {}, 'prospect'],
  ])('%s', (_label, input, stage) => {
    expect(deriveLifecycleStage(input)).toBe(stage);
  });

  it('disabling an account does not change the lifecycle stage', () => {
    expect(deriveLifecycleStage({ is_disabled: true, has_live_enrollment: true, nexus_entered_at: daysAgo(1) })).toBe('active_student');
    expect(deriveAccountStatus({ is_disabled: true })).toBe('deactivated');
    expect(deriveAccountStatus({})).toBe('active');
  });

  it('has a label and a plain-language meaning for every stage', () => {
    for (const stage of Object.keys(LIFECYCLE_STAGE_LABELS)) {
      expect(LIFECYCLE_STAGE_MEANINGS[stage as keyof typeof LIFECYCLE_STAGE_MEANINGS]).toBeTruthy();
    }
  });
});

describe('deriveEngagement', () => {
  it.each([
    ['joined this week', null, daysAgo(2), 'new'],
    ['active in the last 7 days', daysAgo(6), daysAgo(200), 'engaged'],
    ['quiet for 2 weeks', daysAgo(14), daysAgo(200), 'low'],
    ['quiet for 2 months', daysAgo(60), daysAgo(200), 'inactive'],
    ['quiet for 4 months', daysAgo(120), daysAgo(200), 'dormant'],
    ['never did anything', null, daysAgo(200), 'dormant'],
  ])('%s', (_label, last, created, state) => {
    expect(deriveEngagement(last, created, now)).toBe(state);
  });
});

describe('profileCompleteness', () => {
  it('turns missing keys into labels and a percentage', () => {
    expect(profileCompleteness([])).toEqual({ percent: 100, items: [] });
    expect(profileCompleteness(['phone_verified', 'city'])).toEqual({ percent: 67, items: ['Phone not verified', 'City'] });
    expect(profileCompleteness(null).percent).toBe(100);
  });
});

describe('deriveExamYear (mirrors exam_year in user_lifecycle_view, 20261018090000)', () => {
  it('a batch wins over a stated year and the sign-up date', () => {
    expect(deriveExamYear({ academicYear: '2026-27', targetYear: 2028, createdAt: '2026-03-01T00:00:00Z' })).toEqual({
      year: 2027,
      source: 'batch',
    });
  });

  it('a stated year wins over the sign-up date', () => {
    expect(deriveExamYear({ targetYear: 2028, createdAt: '2026-08-01T00:00:00Z' })).toEqual({ year: 2028, source: 'stated' });
  });

  it('an odd batch value is ignored, not parsed', () => {
    expect(deriveExamYear({ academicYear: '2027', createdAt: '2026-08-01T00:00:00Z' }).source).toBe('signup');
  });

  it.each([
    // 30 June 23:59 India time is still the 2026 season.
    ['2026-06-30T18:29:00Z', 2026],
    // 1 July 00:00 India time (30 June 18:30 UTC) starts the 2027 season.
    ['2026-06-30T18:30:00Z', 2027],
    ['2026-03-15T10:00:00Z', 2026],
    ['2026-12-31T10:00:00Z', 2027],
    ['2027-01-10T10:00:00Z', 2027],
  ])('sign-up at %s is the %i exam, estimated', (createdAt, year) => {
    expect(deriveExamYear({ createdAt })).toEqual({ year, source: 'signup' });
  });

  it('nothing to go on gives no year', () => {
    expect(deriveExamYear({})).toEqual({ year: null, source: null });
  });
});

describe('batch codes and exam years', () => {
  it('convert both ways', () => {
    expect(batchCodeForExamYear(2027)).toBe('2026-27');
    expect(batchCodeForExamYear(2030)).toBe('2029-30');
    expect(examYearForBatchCode('2026-27')).toBe(2027);
    expect(examYearForBatchCode('current')).toBeNull();
    expect(examYearForBatchCode(null)).toBeNull();
  });
});

describe('activity groups', () => {
  it('fold the five engagement states into three', () => {
    expect(activityGroupOf('new')).toBe('recent');
    expect(activityGroupOf('engaged')).toBe('recent');
    expect(activityGroupOf('low')).toBe('recent');
    expect(activityGroupOf('inactive')).toBe('quiet');
    expect(activityGroupOf('dormant')).toBe('gone');
    expect(activityGroupOf(null)).toBe('gone');
  });

  it('cover every engagement state exactly once', () => {
    const states = Object.values(ACTIVITY_GROUPS).flatMap((g) => g.states).sort();
    expect(states).toEqual(['dormant', 'engaged', 'inactive', 'low', 'new']);
  });

  it('have plain-words stage labels for every stage', () => {
    expect(Object.keys(PEOPLE_STAGE_LABELS).sort()).toEqual(Object.keys(LIFECYCLE_STAGE_LABELS).sort());
  });
});
