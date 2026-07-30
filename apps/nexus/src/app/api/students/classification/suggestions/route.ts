import { NextRequest, NextResponse } from 'next/server';
import {
  deriveAcademicYearFromExamYear,
  expectedYearForStage,
  getCurrentBatch,
  getSupabaseAdminClient,
  loadClassroomRoster,
  mapClassToStandard,
  startYearOf,
  type NexusStudyStage,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/students/classification/suggestions?classroom=<id>
 *
 * What the student already told us on the application form, offered back as a
 * pre-filled suggestion for the class and exam year a teacher would otherwise
 * type by hand. Read-only: nothing is written here. The review sheet applies the
 * accepted rows through PATCH /api/students/classification.
 *
 * ONLY MISSING VALUES ARE SUGGESTED. A value that is already set is never
 * proposed for change, even when it looks wrong, because overwriting a decision a
 * human made from talking to the student would be worse than leaving it. Values
 * that are present but contradict each other are handled by the pairing check on
 * the students screen, which shows the expected value and lets staff choose.
 *
 * `academic_data.current_class` is the field worth reading. It is plain JSONB and
 * survived intact, whereas the form's exam-year answer was destroyed on the way in
 * (Number('2026-27') is NaN, so lead_profiles.target_exam_year landed NULL). Where
 * an integer exam year IS present it was written by admin and is trustworthy.
 */

const CLASS_LABEL: Record<string, string> = {
  '8': 'Class 8',
  '9': 'Class 9',
  '10': 'Class 10',
  '11': 'Class 11',
  '12': 'Class 12',
  '12_completed': '12th completed',
};

const CATEGORY_LABEL: Record<string, string> = {
  school_student: 'school student',
  diploma_student: 'diploma student',
  college_student: 'college student',
  working_professional: 'working professional',
  professional: 'working professional',
};

const STAGE_LABEL: Record<NexusStudyStage, string> = {
  gap_year: 'Break Year',
  '12th': 'Class 12',
  '11th': 'Class 11',
  '10th': 'Class 10',
};

export async function GET(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(staff, 'coord.student.stage');

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    const [roster, currentBatch] = await Promise.all([
      loadClassroomRoster(classroomId),
      getCurrentBatch(),
    ]);
    const currentCode = currentBatch?.code ?? null;

    if (!roster.members.length) {
      return NextResponse.json({ suggestions: [], currentBatch: currentCode });
    }

    const userIds = roster.members.map((m) => m.user_id);
    const supabase = getSupabaseAdminClient() as any;

    // One query for the whole classroom, not one per student. Ordered oldest
    // first so the newest row for each user overwrites the earlier ones as we
    // walk it, which leaves the latest application in the map.
    const [{ data: leads, error: leadError }, { data: users, error: userError }] = await Promise.all([
      supabase
        .from('lead_profiles')
        .select('user_id, academic_data, target_exam_year, applicant_category, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: true }),
      supabase.from('users').select('id, academic_year').in('id', userIds),
    ]);

    if (leadError) throw leadError;
    if (userError) throw userError;

    const leadByUser = new Map<string, any>();
    for (const lead of (leads || []) as any[]) leadByUser.set(lead.user_id, lead);

    const yearByUser = new Map<string, string | null>();
    for (const user of (users || []) as any[]) yearByUser.set(user.id, user.academic_year ?? null);

    const suggestions = [];

    for (const member of roster.members) {
      const currentStage = member.current_standard ?? null;
      const currentYear = yearByUser.get(member.user_id) ?? null;
      const hasStage = currentStage !== null;
      const hasYear = startYearOf(currentYear) !== null;
      if (hasStage && hasYear) continue; // nothing missing

      const lead = leadByUser.get(member.user_id);
      const evidence: string[] = [];

      // ── Stage ────────────────────────────────────────────────────────────
      let suggestedStage: NexusStudyStage | null = null;
      if (!hasStage && lead) {
        suggestedStage = mapClassToStandard(lead.academic_data ?? null, lead.applicant_category ?? null);
        if (suggestedStage) {
          const rawClass = lead.academic_data?.current_class;
          if (rawClass) {
            const label = CLASS_LABEL[String(rawClass)] ?? String(rawClass);
            evidence.push(`Application form: current class is ${label}`);
          } else if (lead.applicant_category) {
            const label = CATEGORY_LABEL[lead.applicant_category] ?? lead.applicant_category;
            evidence.push(`Application form: applied as a ${label}`);
          }
          const twelfthYear = lead.academic_data?.twelfth_year;
          if (suggestedStage === 'gap_year' && twelfthYear) {
            evidence.push(`Completed 12th in ${twelfthYear}`);
          }
        }
      }

      // ── Exam year ────────────────────────────────────────────────────────
      // An integer target_exam_year was written by admin, so prefer it. Otherwise
      // derive from whichever class we will end up with. Deriving is a suggestion,
      // not the automatic linking the two fields deliberately do not have.
      let suggestedYear: string | null = null;
      if (!hasYear) {
        const fromForm = deriveAcademicYearFromExamYear(
          typeof lead?.target_exam_year === 'number'
            ? lead.target_exam_year
            : Number(lead?.target_exam_year),
        );
        if (fromForm) {
          suggestedYear = fromForm;
          evidence.push(`Application form: writing the exam in ${examYearOf(fromForm)}`);
        } else if (currentCode) {
          const stageForYear = currentStage ?? suggestedStage;
          suggestedYear = expectedYearForStage(stageForYear, currentCode);
          if (suggestedYear && stageForYear) {
            evidence.push(`${STAGE_LABEL[stageForYear]} writes in ${examYearOf(suggestedYear)}`);
          }
        }
      }

      if (!suggestedStage && !suggestedYear) continue;

      suggestions.push({
        studentId: member.user_id,
        name: member.user.name ?? member.user.email ?? 'Student',
        avatarUrl: member.user.avatar_url ?? null,
        currentStage,
        currentYear,
        suggestedStage,
        suggestedYear,
        evidence,
      });
    }

    return NextResponse.json({ suggestions, currentBatch: currentCode });
  } catch (err) {
    return errorResponse(err, 'Failed to load classification suggestions');
  }
}

/** '2027-28' -> 2028, for copy that says which calendar year they sit the exam. */
function examYearOf(academicYear: string): number | null {
  const start = startYearOf(academicYear);
  return start === null ? null : start + 1;
}
