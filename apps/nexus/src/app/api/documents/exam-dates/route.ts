import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * The exam date registry. Since 20260804090000 this is also the single source of
 * the "days left until the exam" countdown on the student, parent and teacher
 * dashboards, which is why the write gate here is tighter than it used to be:
 * one edit on one row changes what every user in the school is told.
 */

/**
 * GET /api/documents/exam-dates?exam_type=nata&year=2026
 *
 * Open to every authenticated Nexus user, deliberately. Students read this on
 * /student/exam-recall, and the course-plan dialog reads it to populate its
 * target-exam selector. Do NOT add assertStaff here.
 */
export async function GET(request: NextRequest) {
  try {
    await getRequestUser(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    let query = (supabase as any)
      .from('nexus_exam_dates')
      .select('*')
      .eq('is_active', true);

    const examType = request.nextUrl.searchParams.get('exam_type');
    if (examType) query = query.eq('exam_type', examType);

    const year = request.nextUrl.searchParams.get('year');
    if (year) query = query.eq('year', parseInt(year, 10));

    // from_year lets a caller ask for "this year and later" in one request, which
    // is what the course-plan target selector wants: a plan running now can
    // target a session in either the current or the next calendar year.
    const fromYear = request.nextUrl.searchParams.get('from_year');
    if (fromYear) query = query.gte('year', parseInt(fromYear, 10));

    const { data, error } = await query
      .order('year', { ascending: true })
      .order('exam_date', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ exam_dates: data || [] });
  } catch (err) {
    return errorResponse(err, 'Failed to load exam dates');
  }
}

/**
 * POST /api/documents/exam-dates
 * Body: { exam_type, year, phase, attempt_number, exam_date, label?,
 *         registration_deadline?, date_confidence?, date_note? }
 *
 * Two-tier gate, mirroring PATCH /api/teaching-plans/[id]: adding a date is
 * ordinary cohort calendar upkeep, but marking one 'confirmed' publishes an
 * assertion to every student and parent in the school, so that takes admin.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'structure.batch.manage');

    const body = await request.json();
    const {
      exam_type,
      year,
      phase,
      attempt_number,
      exam_date,
      label,
      registration_deadline,
      date_confidence,
      date_note,
    } = body;

    if (!exam_type || !year || !phase || !attempt_number || !exam_date) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: exam_type, year, phase, attempt_number, exam_date',
        },
        { status: 400 },
      );
    }

    const confidence = date_confidence === 'confirmed' ? 'confirmed' : 'expected';
    if (confidence === 'confirmed') assertCapability(user, 'system.settings');

    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('nexus_exam_dates')
      .insert({
        exam_type,
        year,
        phase,
        attempt_number,
        exam_date,
        label: label || null,
        registration_deadline: registration_deadline || null,
        // Default to 'expected' rather than inheriting the column default of
        // 'confirmed'. That default exists only to protect rows created before
        // this feature; a date being typed in now is a guess until someone says
        // otherwise, and over-hedging is the safe direction.
        date_confidence: confidence,
        date_note: confidence === 'expected' ? date_note || null : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam_date: data }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Failed to create exam date');
  }
}
