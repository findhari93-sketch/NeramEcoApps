/**
 * NATA and B.Arch eligibility rules (Council of Architecture), as one pure
 * function. Used by the public demo and the full checker so they always agree.
 */

// Education status options
export const EDUCATION_OPTIONS = [
  'Appearing in 10+1',
  'Appearing in 10+2',
  'Passed 10+2',
  '10+3 Diploma (Appearing)',
  '10+3 Diploma (Passed)',
];

// Subjects list from COA guidelines
export const SUBJECTS = [
  'Physics',
  'Mathematics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'IT',
  'Informatics Practices',
  'Engineering Graphics',
  'Business Studies',
  'Technical Vocational',
];

// Subjects that qualify as the "third subject" for B.Arch
export const BARCH_THIRD_SUBJECTS = [
  'Chemistry',
  'Biology',
  'Technical Vocational',
  'Computer Science',
  'IT',
  'Informatics Practices',
  'Engineering Graphics',
  'Business Studies',
];

export interface EligibilityResult {
  nataEligible: boolean;
  barchEligible: boolean | null; // null = not checked
  conditions: {
    label: string;
    met: boolean;
    explanation: string;
  }[];
}

export interface EligibilityInput {
  education: string;
  subjects: string[];
  /** Aggregate percentage as typed, may be empty. */
  aggregate: string;
  /** 'Just NATA Exam' or 'B.Arch Admission'. */
  purpose: string;
}

export function evaluateEligibility({ education, subjects, aggregate, purpose }: EligibilityInput): EligibilityResult {
  const isDiploma = education === '10+3 Diploma (Appearing)' || education === '10+3 Diploma (Passed)';
  const conditions: EligibilityResult['conditions'] = [];
  let nataEligible = true;
  let barchEligible: boolean | null = null;

  // NATA Appearance Eligibility

  // Condition 1: Education status
  const validEducation = education !== '';
  conditions.push({
    label: 'Education Qualification',
    met: validEducation,
    explanation: validEducation
      ? `${education} is a valid qualification for NATA`
      : 'Please select your education status',
  });
  if (!validEducation) nataEligible = false;

  // Condition 2: Subjects
  if (isDiploma) {
    const hasMath = subjects.includes('Mathematics');
    conditions.push({
      label: 'Mathematics (Diploma)',
      met: hasMath,
      explanation: hasMath
        ? 'Mathematics is included in your diploma subjects'
        : 'Diploma students must have Mathematics in their curriculum',
    });
    if (!hasMath) nataEligible = false;
  } else {
    // 10+2 path: subjects should be from COA approved list
    const hasSubjects = subjects.length > 0;
    conditions.push({
      label: 'Subjects from COA List',
      met: hasSubjects,
      explanation: hasSubjects
        ? `${subjects.length} subject(s) selected from COA approved list`
        : 'Select at least one subject from the approved list',
    });
    if (!hasSubjects) nataEligible = false;
  }

  // B.Arch Admission Eligibility (only if selected)
  if (purpose === 'B.Arch Admission') {
    barchEligible = true;

    if (isDiploma) {
      // Diploma path for B.Arch
      const hasMath = subjects.includes('Mathematics');
      conditions.push({
        label: 'Mathematics (B.Arch - Diploma)',
        met: hasMath,
        explanation: hasMath
          ? 'Mathematics requirement met for B.Arch through Diploma'
          : 'Diploma students need Mathematics for B.Arch admission',
      });
      if (!hasMath) barchEligible = false;

      // Check if passed for percentage requirement
      if (education === '10+3 Diploma (Passed)') {
        const aggValue = parseFloat(aggregate);
        const hasMinAggregate = !isNaN(aggValue) && aggValue >= 45;
        conditions.push({
          label: 'Minimum 45% Aggregate (Diploma)',
          met: hasMinAggregate,
          explanation: hasMinAggregate
            ? `Your aggregate of ${aggValue}% meets the minimum 45% requirement`
            : aggregate
              ? `Your aggregate of ${aggregate}% is below the minimum 45% requirement`
              : 'Enter your aggregate percentage (minimum 45% required)',
        });
        if (!hasMinAggregate) barchEligible = false;
      } else {
        conditions.push({
          label: 'Minimum 45% Aggregate (Diploma)',
          met: true,
          explanation:
            'You are still appearing; ensure you score at least 45% aggregate upon completion',
        });
      }
    } else {
      // 10+2 path for B.Arch
      const hasPhysics = subjects.includes('Physics');
      conditions.push({
        label: 'Physics (B.Arch)',
        met: hasPhysics,
        explanation: hasPhysics
          ? 'Physics requirement met'
          : 'Physics is mandatory for B.Arch admission',
      });
      if (!hasPhysics) barchEligible = false;

      const hasMath = subjects.includes('Mathematics');
      conditions.push({
        label: 'Mathematics (B.Arch)',
        met: hasMath,
        explanation: hasMath
          ? 'Mathematics requirement met'
          : 'Mathematics is mandatory for B.Arch admission',
      });
      if (!hasMath) barchEligible = false;

      // Third subject check
      const hasThirdSubject = subjects.some((s) => BARCH_THIRD_SUBJECTS.includes(s));
      conditions.push({
        label: 'Third Subject (B.Arch)',
        met: hasThirdSubject,
        explanation: hasThirdSubject
          ? `Additional subject requirement met (${subjects.filter((s) => BARCH_THIRD_SUBJECTS.includes(s)).join(', ')})`
          : 'Need one of: Chemistry, Biology, Technical Vocational, CS, IT, Informatics Practices, Engineering Graphics, or Business Studies',
      });
      if (!hasThirdSubject) barchEligible = false;

      // Percentage check (only for Passed 10+2)
      if (education === 'Passed 10+2') {
        const aggValue = parseFloat(aggregate);
        const hasMinAggregate = !isNaN(aggValue) && aggValue >= 45;
        conditions.push({
          label: 'Minimum 45% Aggregate',
          met: hasMinAggregate,
          explanation: hasMinAggregate
            ? `Your aggregate of ${aggValue}% meets the minimum 45% requirement`
            : aggregate
              ? `Your aggregate of ${aggregate}% is below the minimum 45% requirement`
              : 'Enter your aggregate percentage (minimum 45% required)',
        });
        if (!hasMinAggregate) barchEligible = false;
      } else if (education === 'Appearing in 10+2' || education === 'Appearing in 10+1') {
        conditions.push({
          label: 'Minimum 45% Aggregate',
          met: true,
          explanation:
            'You are still appearing; ensure you score at least 45% aggregate upon completion',
        });
      }
    }
  }
  return { nataEligible, barchEligible, conditions };
}
