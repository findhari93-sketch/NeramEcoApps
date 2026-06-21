import { describe, it, expect } from 'vitest';
import { deriveAcademicYearFromExamYear, currentAcademicYear } from './crm';

describe('deriveAcademicYearFromExamYear', () => {
  it('maps an exam year to the preparing academic year', () => {
    expect(deriveAcademicYearFromExamYear(2026)).toBe('2025-26');
    expect(deriveAcademicYearFromExamYear(2027)).toBe('2026-27');
    expect(deriveAcademicYearFromExamYear(2030)).toBe('2029-30');
  });

  it('pads the trailing two digits across a century boundary', () => {
    expect(deriveAcademicYearFromExamYear(2100)).toBe('2099-00');
  });

  it('returns null for missing or out-of-range input', () => {
    expect(deriveAcademicYearFromExamYear(null)).toBeNull();
    expect(deriveAcademicYearFromExamYear(undefined)).toBeNull();
    expect(deriveAcademicYearFromExamYear(1999)).toBeNull();
    expect(deriveAcademicYearFromExamYear(2.5 as unknown as number)).toBeNull();
  });

  it('always produces the YYYY-YY format', () => {
    for (let y = 2024; y <= 2032; y++) {
      expect(deriveAcademicYearFromExamYear(y)).toMatch(/^[0-9]{4}-[0-9]{2}$/);
    }
  });
});

describe('currentAcademicYear', () => {
  it('treats April as the start of the academic year (India)', () => {
    // Local-component dates avoid timezone parsing drift
    expect(currentAcademicYear(new Date(2026, 2, 31))).toBe('2025-26'); // March
    expect(currentAcademicYear(new Date(2026, 3, 1))).toBe('2026-27');  // April
  });

  it('returns the YYYY-YY format for the current date', () => {
    expect(currentAcademicYear()).toMatch(/^[0-9]{4}-[0-9]{2}$/);
  });
});
