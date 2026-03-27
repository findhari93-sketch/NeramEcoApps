import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch enrollment data from lead_profiles to pre-fill Nexus onboarding fields.
 * Maps enrollment academic data → Nexus onboarding standard/year/exam.
 */
export interface OnboardingPrefillData {
  currentStandard: string | null; // '10th' | '11th' | '12th' | 'gap_year'
  academicYear: string | null;    // '2025-26' format
  examInterest: string | null;    // 'nata' | 'jee_paper2' | 'both'
  // Enhanced fields from enrollment
  schoolName: string | null;
  applicantCategory: string | null;
  casteCategory: string | null;
  schoolType: string | null;
  parentContact: string | null;
  enrollmentSource: string | null; // 'direct_link' | 'regular'
}

export async function getEnrollmentPrefillData(
  userId: string,
  supabase: SupabaseClient
): Promise<OnboardingPrefillData | null> {
  const { data: lead, error } = await (supabase as any)
    .from('lead_profiles')
    .select('academic_data, target_exam_year, interest_course, applicant_category, caste_category, school_type, source')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !lead) return null;

  // Also fetch parent contact from student_profiles
  const { data: studentProfile } = await (supabase as any)
    .from('student_profiles')
    .select('parent_contact')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    currentStandard: mapClassToStandard(lead.academic_data, lead.applicant_category),
    academicYear: inferAcademicYear(lead.target_exam_year),
    examInterest: lead.interest_course || null,
    schoolName: lead.academic_data?.school_name || lead.academic_data?.college_name || null,
    applicantCategory: lead.applicant_category || null,
    casteCategory: lead.caste_category || null,
    schoolType: lead.school_type || null,
    parentContact: studentProfile?.parent_contact || null,
    enrollmentSource: lead.source || null,
  };
}

/**
 * Map enrollment academic_data.current_class to Nexus standard format.
 * Enrollment: "Class 12", "Class 11", "Class 10"
 * Nexus: "12th", "11th", "10th", "gap_year"
 */
function mapClassToStandard(
  academicData: Record<string, any> | null,
  applicantCategory: string | null
): string | null {
  // Professionals, diploma, and college students → gap_year
  if (applicantCategory === 'professional' || applicantCategory === 'diploma_student' || applicantCategory === 'college_student') {
    return 'gap_year';
  }

  const currentClass = academicData?.current_class;
  if (!currentClass) return null;

  const classStr = String(currentClass).toLowerCase();
  if (classStr === '12_completed' || classStr.includes('12th completed')) return 'gap_year';
  if (classStr.includes('12') || classStr === 'class 12') return '12th';
  if (classStr.includes('11') || classStr === 'class 11') return '11th';
  if (classStr.includes('10') || classStr === 'class 10') return '10th';

  return null;
}

/**
 * Infer Nexus academic_year from enrollment target_exam_year.
 * target_exam_year "2026-27" → academic_year "2025-26" (year before exam)
 * target_exam_year "2027" → academic_year "2026-27"
 */
function inferAcademicYear(targetExamYear: string | null): string | null {
  if (!targetExamYear) return null;

  // Handle "YYYY-YY" format (e.g., "2026-27")
  const rangeMatch = targetExamYear.match(/^(\d{4})-(\d{2})$/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1]) - 1;
    const endYear = startYear + 1;
    return `${startYear}-${String(endYear).slice(-2)}`;
  }

  // Handle "YYYY" format (e.g., "2027")
  const yearMatch = targetExamYear.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    return `${year - 1}-${String(year).slice(-2)}`;
  }

  return null;
}
