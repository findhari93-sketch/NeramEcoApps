import { describe, test, expect, vi } from 'vitest';
import { getEnrollmentPrefillData } from '../nexus/onboarding-prefill';

/**
 * Unit tests for onboarding prefill logic.
 * Verifies mapping from enrollment data → Nexus onboarding fields.
 */

function createMockSupabase(leadData: any) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: leadData, error: null })),
  };
  // Make each method return the chain
  for (const method of ['from', 'select', 'eq', 'order', 'limit']) {
    const original = chain[method];
    chain[method] = vi.fn((...args: any[]) => { original(...args); return chain; });
  }
  return chain;
}

describe('getEnrollmentPrefillData', () => {
  test('should map "Class 12" to "12th"', async () => {
    const mock = createMockSupabase({
      academic_data: { current_class: 'Class 12' },
      target_exam_year: '2026-27',
      interest_course: 'nata',
      applicant_category: 'school_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);

    expect(result).not.toBeNull();
    expect(result!.currentStandard).toBe('12th');
    expect(result!.academicYear).toBe('2025-26');
    expect(result!.examInterest).toBe('nata');
  });

  test('should map "11" to "11th"', async () => {
    const mock = createMockSupabase({
      academic_data: { current_class: '11' },
      target_exam_year: null,
      interest_course: 'nata',
      applicant_category: 'school_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);

    expect(result!.currentStandard).toBe('11th');
    expect(result!.academicYear).toBeNull();
  });

  test('should map "10" to "10th"', async () => {
    const mock = createMockSupabase({
      academic_data: { current_class: '10' },
      target_exam_year: '2027-28',
      interest_course: 'jee_paper2',
      applicant_category: 'school_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);

    expect(result!.currentStandard).toBe('10th');
    expect(result!.academicYear).toBe('2026-27');
    expect(result!.examInterest).toBe('jee_paper2');
  });

  test('should return gap_year for professional applicants', async () => {
    const mock = createMockSupabase({
      academic_data: {},
      target_exam_year: '2026',
      interest_course: 'both',
      applicant_category: 'professional',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);

    expect(result!.currentStandard).toBe('gap_year');
    expect(result!.academicYear).toBe('2025-26');
  });

  test('should return gap_year for diploma students', async () => {
    const mock = createMockSupabase({
      academic_data: { college_name: 'Test' },
      target_exam_year: null,
      interest_course: 'nata',
      applicant_category: 'diploma_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);
    expect(result!.currentStandard).toBe('gap_year');
  });

  test('should return gap_year for college students', async () => {
    const mock = createMockSupabase({
      academic_data: {},
      target_exam_year: null,
      interest_course: null,
      applicant_category: 'college_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);
    expect(result!.currentStandard).toBe('gap_year');
  });

  test('should handle year format "2027" → "2026-27"', async () => {
    const mock = createMockSupabase({
      academic_data: { current_class: '12' },
      target_exam_year: '2027',
      interest_course: 'nata',
      applicant_category: 'school_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);
    expect(result!.academicYear).toBe('2026-27');
  });

  test('should return null when no lead profile found', async () => {
    const mock = createMockSupabase(null);
    const result = await getEnrollmentPrefillData('user-1', mock as any);
    expect(result).toBeNull();
  });

  test('should return null standard when academic_data has no current_class', async () => {
    const mock = createMockSupabase({
      academic_data: { school_name: 'Test School' },
      target_exam_year: '2026-27',
      interest_course: 'nata',
      applicant_category: 'school_student',
    });

    const result = await getEnrollmentPrefillData('user-1', mock as any);
    expect(result!.currentStandard).toBeNull();
  });
});
