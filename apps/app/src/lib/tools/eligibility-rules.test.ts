import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from './eligibility-rules';

describe('eligibility rules', () => {
  it('passes 12th with PCM and 45%', () => {
    const r = evaluateEligibility({ education: 'Passed 10+2', subjects: ['Physics', 'Mathematics', 'Chemistry'], aggregate: '45', purpose: 'B.Arch Admission' });
    expect(r).toMatchObject({ nataEligible: true, barchEligible: true });
  });

  it('fails B.Arch without Mathematics but allows NATA', () => {
    const r = evaluateEligibility({ education: 'Passed 10+2', subjects: ['Physics', 'Biology'], aggregate: '80', purpose: 'B.Arch Admission' });
    expect(r.nataEligible).toBe(true);
    expect(r.barchEligible).toBe(false);
  });

  it('fails B.Arch under 45%', () => {
    const r = evaluateEligibility({ education: 'Passed 10+2', subjects: ['Physics', 'Mathematics', 'Chemistry'], aggregate: '44.5', purpose: 'B.Arch Admission' });
    expect(r.barchEligible).toBe(false);
  });

  it('accepts a diploma with Mathematics and 45%', () => {
    const r = evaluateEligibility({ education: '10+3 Diploma (Passed)', subjects: ['Mathematics'], aggregate: '60', purpose: 'B.Arch Admission' });
    expect(r.barchEligible).toBe(true);
  });

  it('does not judge B.Arch when only NATA was asked', () => {
    const r = evaluateEligibility({ education: 'Appearing in 10+2', subjects: ['Physics'], aggregate: '', purpose: 'Just NATA Exam' });
    expect(r.barchEligible).toBeNull();
  });
});
