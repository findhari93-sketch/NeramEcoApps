import { describe, it, expect } from 'vitest';
import { enrolmentStageFrom, type EnrolmentLinkRow } from './class-setup-stage';

const link = (status: string, submitted_at: string | null = null, rejected_at: string | null = null): EnrolmentLinkRow => ({
  status,
  submitted_at,
  rejected_at,
});

describe('enrolmentStageFrom', () => {
  it('counts a used direct link as enrolled', () => {
    expect(enrolmentStageFrom([link('used')], false, 'lead')).toBe('enrolled');
  });

  it('counts a student enrolled without any link (approved application, office)', () => {
    expect(enrolmentStageFrom([], true, 'lead')).toBe('enrolled');
    expect(enrolmentStageFrom([], false, 'student')).toBe('enrolled');
  });

  it('is checking while a sent payment waits for staff', () => {
    expect(enrolmentStageFrom([link('active', '2026-10-20T10:00:00Z')], false, 'lead')).toBe('checking');
  });

  it('is checking again after a rejected payment is sent a second time', () => {
    expect(enrolmentStageFrom([link('active', '2026-10-21T10:00:00Z', '2026-10-20T10:00:00Z')], false, 'lead')).toBe('checking');
  });

  it('is not enrolled while the last payment stands rejected', () => {
    expect(enrolmentStageFrom([link('active', '2026-10-20T10:00:00Z', '2026-10-21T10:00:00Z')], false, 'lead')).toBeNull();
  });

  it('ignores cancelled links and unsent ones', () => {
    expect(enrolmentStageFrom([link('cancelled', '2026-10-20T10:00:00Z'), link('active')], false, null)).toBeNull();
  });
});
