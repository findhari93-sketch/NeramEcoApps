import { SupabaseClient } from '@supabase/supabase-js';
import { ACADEMIC_YEAR_REGEX, deriveAcademicYearFromExamYear } from '../../utils/academic-year';
import type { NexusStudyStage } from '../../types';

/**
 * Fetch enrollment data from lead_profiles to pre-fill Nexus onboarding fields.
 * Maps enrollment academic data → Nexus onboarding standard/year/exam.
 */
export interface OnboardingPrefillData {
  currentStandard: NexusStudyStage | null; // '10th' | '11th' | '12th' | 'gap_year'
  academicYear: string | null;    // 'YYYY-YY' format
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
 * Map `lead_profiles.academic_data.current_class` to a Nexus study stage.
 *
 * The stored values come from CLASS_OPTIONS on the apply and enroll wizards and
 * are bare strings: '8' | '9' | '10' | '11' | '12' | '12_completed'. Older rows
 * and the chat-widget flow can carry human text ('Class 12', '12th Standard'),
 * hence the substring fallbacks.
 *
 * Classes 8 and 9 map to null on purpose: Nexus only models 10th upward, so
 * there is no honest stage for them and "nobody has said yet" is the truthful
 * answer.
 */
export function mapClassToStandard(
  academicData: Record<string, any> | null,
  applicantCategory: string | null
): NexusStudyStage | null {
  // Anyone past school is preparing full time, which is what gap_year means.
  // 'working_professional' is the real enum value in the applicant_category type
  // ('professional' was a long-standing typo here that sent every working
  // professional down the current_class path, where they have no value to read).
  if (
    applicantCategory === 'working_professional' ||
    applicantCategory === 'professional' ||
    applicantCategory === 'diploma_student' ||
    applicantCategory === 'college_student'
  ) {
    return 'gap_year';
  }

  const currentClass = academicData?.current_class;
  if (!currentClass) return null;

  const classStr = String(currentClass).toLowerCase().trim();
  if (classStr === '12_completed' || classStr.includes('12th completed') || classStr.includes('completed 12')) {
    return 'gap_year';
  }
  if (classStr.includes('12')) return '12th';
  if (classStr.includes('11')) return '11th';
  if (classStr.includes('10')) return '10th';

  return null;
}

/**
 * Read `lead_profiles.target_exam_year` as a 'YYYY-YY' cohort.
 *
 * The column is INTEGER and admin writes a calendar exam year into it (2027),
 * so that is the path that fires in practice. The public apply form's
 * "Planning to Write Exam In" dropdown emits an academic-year string ('2026-27')
 * instead, which is accepted here as already being the cohort. That is the
 * opposite of what this function used to do: it subtracted a year from the
 * string form, contradicting `examYearFromAcademicYear` and the batch registry's
 * own labels ('2026-27' is seeded as 'NATA/JEE 2027').
 */
function inferAcademicYear(targetExamYear: string | number | null): string | null {
  if (targetExamYear === null || targetExamYear === undefined || targetExamYear === '') return null;

  // Already a cohort code, e.g. '2026-27' straight off the apply form.
  if (typeof targetExamYear === 'string' && ACADEMIC_YEAR_REGEX.test(targetExamYear)) {
    return targetExamYear;
  }

  // A calendar exam year, e.g. 2027 or '2027'. Rejects NaN and out-of-range.
  const asNumber = typeof targetExamYear === 'number' ? targetExamYear : Number(targetExamYear);
  return deriveAcademicYearFromExamYear(asNumber);
}
