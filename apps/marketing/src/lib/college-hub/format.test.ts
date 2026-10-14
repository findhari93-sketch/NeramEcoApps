import { describe, it, expect } from 'vitest';
import {
  admissionLabel,
  admissionSystems,
  cutoffLabel,
  examLabel,
  examList,
  feeLabel,
  formatRupees,
  initials,
  naacLabel,
  packageLabel,
  ratingLabel,
  seatsLabel,
  shortName,
  typeLabel,
} from './format';

describe('formatRupees', () => {
  it('uses K below a lakh and one decimal of L above', () => {
    expect(formatRupees(25000)).toBe('₹25K');
    expect(formatRupees(200000)).toBe('₹2.0L');
    expect(formatRupees(1250000)).toBe('₹12.5L');
    expect(formatRupees(500)).toBe('₹500');
  });
});

describe('feeLabel', () => {
  it('leads with the number, short form adds /yr', () => {
    expect(feeLabel({ annual_fee_approx: 200000 })).toBe('₹2.0L');
    expect(feeLabel({ annual_fee_approx: 200000 }, 'short')).toBe('₹2.0L/yr');
  });
  it('falls back to the minimum fee', () => {
    expect(feeLabel({ annual_fee_approx: null, annual_fee_min: 50000 })).toBe('₹50K');
  });
  it('says why a fee is missing instead of N/A', () => {
    expect(feeLabel({ annual_fee_approx: null, counseling_systems: ['JoSAA'] })).toBe('Via JoSAA');
    expect(feeLabel({ annual_fee_approx: null, counseling_systems: ['TNEA'] })).toBe('Not published');
  });
});

describe('seatsLabel', () => {
  it('shows the number, with a unit on mobile', () => {
    expect(seatsLabel({ total_barch_seats: 80 })).toBe('80');
    expect(seatsLabel({ total_barch_seats: 80 }, 'short')).toBe('80 seats');
  });
  it('explains missing seats', () => {
    expect(seatsLabel({ total_barch_seats: null, counseling_systems: ['JoSAA'] })).toBe('Via JoSAA');
    expect(seatsLabel({ total_barch_seats: null, counseling_systems: ['JoSAA'] }, 'short')).toBe('JEE only');
    expect(seatsLabel({ total_barch_seats: null })).toBe('Not published');
  });
});

describe('cutoffLabel', () => {
  it('formats scores, ranks and percentiles', () => {
    expect(cutoffLabel({ cutoff_value: 182.5, cutoff_type: 'score', cutoff_system: 'TNEA', cutoff_year: '2025-26' })).toBe('TNEA 2025 · 182.5');
    expect(cutoffLabel({ cutoff_value: 1234, cutoff_type: 'rank', cutoff_system: 'JoSAA', cutoff_year: '2025' })).toBe('JoSAA 2025 · rank 1,234');
    expect(cutoffLabel({ cutoff_value: 128, cutoff_type: 'score' }, 'short')).toBe('Cutoff 128');
    expect(cutoffLabel({ cutoff_value: 1234, cutoff_type: 'rank' }, 'short')).toBe('Rank 1,234');
  });
  it('is null without a cutoff', () => {
    expect(cutoffLabel({ cutoff_value: null })).toBeNull();
  });
});

describe('admissionSystems', () => {
  it('reads counselling from both fields and every spelling', () => {
    expect(admissionSystems({ counseling_systems: [], accepted_exams: ['NATA', 'TNEA'] })).toEqual(['TNEA']);
    expect(admissionSystems({ counseling_systems: ['TS_EAPCET', 'JoSAA'], accepted_exams: ['MHT-CET', 'JEE Main'] })).toEqual(['TS EAPCET', 'JoSAA', 'MHT CET']);
    expect(admissionSystems({ counseling_systems: ['other'], accepted_exams: null })).toEqual([]);
  });
});

describe('other labels', () => {
  it('admission falls back to a hint, never blank', () => {
    expect(admissionLabel({ counseling_systems: ['TNEA'] })).toBe('TNEA');
    expect(admissionLabel({ counseling_systems: ['JoSAA', 'KCET', 'KEAM'] })).toBe('JoSAA · KCET');
    expect(admissionLabel({ counseling_systems: [] })).toBe('Check with college');
  });
  it('package reads rupees or LPA and hides when unknown', () => {
    expect(packageLabel({ avg_placement_salary: 420000 })).toBe('₹4.2 LPA');
    expect(packageLabel({ avg_placement_salary: 4.2 })).toBe('₹4.2 LPA');
    expect(packageLabel({ avg_placement_salary: null })).toBeNull();
  });
  it('type labels ignore case and have a short form', () => {
    expect(typeLabel('private')).toBe('Private');
    expect(typeLabel('Government', 'short')).toBe('Govt');
    expect(typeLabel('deemed')).toBe('Deemed university');
    expect(typeLabel(null)).toBe('Type not listed');
  });
  it('exam spellings collapse to one label', () => {
    expect(examLabel('JEE Main')).toBe('JEE Main Paper 2');
    expect(examLabel('JEE_PAPER_2', 'short')).toBe('JEE P2');
    expect(examList(['NATA', 'JEE Main', 'JEE_PAPER_2', 'KEAM'])).toEqual(['NATA', 'JEE Main Paper 2']);
  });
  it('NAAC, rating, initials and short names', () => {
    expect(naacLabel('A+')).toBe('NAAC A+');
    expect(naacLabel(null)).toBe('No NAAC grade');
    expect(ratingLabel({ review_avg: 4.16, review_count: 12 })).toBe('4.2');
    expect(ratingLabel({ review_avg: 4.1, review_count: 0 })).toBeNull();
    expect(initials('Sir J.J. College of Architecture')).toBe('SJ');
    expect(shortName({ short_name: 'MSEC', name: 'Mohamed Sathak Engineering College' })).toBe('MSEC');
  });
  it('never uses a dash between facts', () => {
    const all = [
      cutoffLabel({ cutoff_value: 1, cutoff_type: 'rank', cutoff_system: 'JoSAA', cutoff_year: '2025' }),
      admissionLabel({ counseling_systems: ['JoSAA', 'KCET'] }),
    ].join(' ');
    expect(all).not.toMatch(/—|--/);
  });
});
