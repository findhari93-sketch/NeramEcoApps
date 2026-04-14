import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getExamConfig, getPhaseConfig as getPhaseConfigFromLib, generatePhaseDates } from '@/lib/exam-config';
import { getExamRoster, getStudentInfo } from '@/lib/exam-roster';

// ============================================
// Week Grouping
// ============================================

function formatISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface WeekGroup {
  weekNumber: number;
  friday: string | null;
  saturday: string | null;
  weekStart: Date;
}

function groupDatesByWeek(dates: string[]): WeekGroup[] {
  const weekMap = new Map<string, { friday: string | null; saturday: string | null }>();
  const weekStarts: string[] = [];

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const key = formatISO(monday);

    if (!weekMap.has(key)) {
      weekMap.set(key, { friday: null, saturday: null });
      weekStarts.push(key);
    }
    const week = weekMap.get(key)!;
    if (d.getDay() === 5) week.friday = dateStr;
    if (d.getDay() === 6) week.saturday = dateStr;
  }

  weekStarts.sort();
  return weekStarts.map((key, i) => ({
    weekNumber: i + 1,
    ...weekMap.get(key)!,
    weekStart: new Date(key + 'T00:00:00'),
  }));
}

function getWeekOffset(weeks: WeekGroup[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeks.length; i++) {
    const weekEnd = new Date(weeks[i].weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (today <= weekEnd) return i;
  }
  return weeks.length - 1;
}

function formatWeekLabel(week: WeekGroup): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts: string[] = [];
  if (week.friday) {
    const d = new Date(week.friday + 'T00:00:00');
    parts.push(`${months[d.getMonth()]} ${d.getDate()}`);
  }
  if (week.saturday) {
    const d = new Date(week.saturday + 'T00:00:00');
    parts.push(`${d.getDate()}`);
  }
  return parts.join(' - ');
}

function getUserName(u: any): string {
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
  return u.name || 'Unknown';
}

// ============================================
// GET /api/exam-schedule
// Exam data aggregated across all classrooms.
// ============================================

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));
    const phase = request.nextUrl.searchParams.get('phase') || 'phase_1';
    const weekOffsetParam = parseInt(request.nextUrl.searchParams.get('week_offset') || '0');

    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Get aggregated roster across all classrooms
    const { studentIds: allStudentIds, isTeacher } = await getExamRoster(db, user.id);
    if (allStudentIds.length === 0 && !isTeacher) {
      return NextResponse.json({ error: 'Not enrolled in any classroom' }, { status: 403 });
    }

    // Get phase config from static config
    const phaseConfig = getPhaseConfigFromLib(examType, phase);
    if (!phaseConfig) {
      return NextResponse.json({ error: `Unknown exam type or phase: ${examType}/${phase}` }, { status: 400 });
    }

    // Generate phase dates
    const phaseDates = generatePhaseDates(phaseConfig);
    const weeks = groupDatesByWeek(phaseDates);
    const totalWeeks = weeks.length;

    // Determine current week index
    const currentWeekIdx = getWeekOffset(weeks);
    const requestedIdx = Math.max(0, Math.min(weeks.length - 1, currentWeekIdx + weekOffsetParam));
    const week = weeks[requestedIdx];

    // Get ALL attempts for this exam type across all classrooms (no classroom filter)
    const includeDeleted = request.nextUrl.searchParams.get('include_deleted') === 'true';
    let attemptsQuery = db
      .from('nexus_student_exam_attempts')
      .select('id, student_id, exam_date, exam_date_id, exam_city, exam_session, attempt_number, state, exam_completed_at, deleted_at, deletion_reason')
      .eq('exam_type', examType)
      .in('student_id', allStudentIds);

    if (!includeDeleted) {
      attemptsQuery = attemptsQuery.is('deleted_at', null);
    }

    const { data: allAttempts } = await attemptsQuery;

    // Filter to only those with a date, and resolve exam_date_id fallback
    let attempts = (allAttempts || []).filter((a: any) => a.exam_date || a.exam_date_id);

    const needsResolution = attempts.filter((a: any) => !a.exam_date && a.exam_date_id);
    if (needsResolution.length > 0) {
      const dateIds = [...new Set(needsResolution.map((a: any) => a.exam_date_id))] as string[];
      const { data: resolvedDates } = await db
        .from('nexus_exam_dates')
        .select('id, exam_date')
        .in('id', dateIds);

      const dateMap: Record<string, string> = {};
      for (const d of (resolvedDates || [])) dateMap[d.id] = d.exam_date?.split('T')[0] || d.exam_date;

      attempts = attempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date?.split('T')[0] || dateMap[a.exam_date_id] || null,
      })).filter((a: any) => a.exam_date);
    } else {
      attempts = attempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date?.split('T')[0] || null,
      })).filter((a: any) => a.exam_date);
    }

    // Get exam plans for all students
    const { data: examPlans } = await db
      .from('nexus_student_exam_plans')
      .select('student_id, state, target_year, application_number')
      .eq('exam_type', examType)
      .in('student_id', allStudentIds);

    const planMap: Record<string, { state: string; target_year: string | null; application_number: string | null }> = {};
    for (const p of (examPlans || [])) planMap[p.student_id] = p;

    // Get student names + academic year
    const { data: myEnrollments } = await db
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const classroomIds = (myEnrollments || []).map((e: any) => e.classroom_id);
    const { nameMap: studentNameMap, academicYearMap } = await getStudentInfo(db, allStudentIds, classroomIds);

    // Also get names for attempt students not in enrollment list
    const attemptStudentIds = [...new Set(attempts.map((a: any) => a.student_id))] as string[];
    const extraIds = attemptStudentIds.filter(id => !studentNameMap[id]);
    if (extraIds.length > 0) {
      const { data: extraUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, name')
        .in('id', extraIds);
      for (const u of (extraUsers || [])) {
        studentNameMap[u.id] = getUserName(u);
      }
    }

    // Build day data for the requested week
    const today = formatISO(new Date());

    function buildDayData(dateStr: string | null) {
      if (!dateStr) return null;
      const dayAttempts = attempts.filter((a: any) => a.exam_date === dateStr);
      const studentsByCity: Record<string, any[]> = {};

      for (const a of dayAttempts) {
        const city = a.exam_city || 'Unspecified';
        if (!studentsByCity[city]) studentsByCity[city] = [];
        const academicYear = academicYearMap[a.student_id] ?? null;
        studentsByCity[city].push({
          student_id: a.student_id,
          name: studentNameMap[a.student_id] || 'Unknown',
          session: a.exam_session,
          attempt_number: a.attempt_number || 1,
          state: a.state,
          academic_year: academicYear,
          not_this_year: academicYear ? academicYear > '2025-26' : false,
        });
      }

      const d = new Date(dateStr + 'T00:00:00');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      return {
        date: dateStr,
        day_name: days[d.getDay()],
        is_past: dateStr < today,
        students_by_city: studentsByCity,
        total_students: dayAttempts.length,
      };
    }

    const currentWeek = {
      week_number: week.weekNumber,
      week_label: formatWeekLabel(week),
      friday: buildDayData(week.friday),
      saturday: buildDayData(week.saturday),
      is_current_week: weekOffsetParam === 0,
      is_past: (week.friday || week.saturday || '') < today,
    };

    // Stats
    const submittedStudentIds = new Set(attempts.map((a: any) => a.student_id));
    const notSubmittedIds = allStudentIds.filter(id => !submittedStudentIds.has(id));

    const thisWeekDates = [week.friday, week.saturday].filter(Boolean);
    const thisWeekCount = attempts.filter((a: any) => thisWeekDates.includes(a.exam_date)).length;

    const completedCount = attempts.filter((a: any) =>
      a.state === 'completed' || a.state === 'scorecard_uploaded'
    ).length;

    function buildStudentSummary(studentId: string) {
      const academicYear = academicYearMap[studentId] ?? null;
      const plan = planMap[studentId] ?? null;
      const studentAttempts = attempts.filter((a: any) => a.student_id === studentId);
      const primaryAttempt = studentAttempts.sort((a: any, b: any) =>
        (b.exam_date || '').localeCompare(a.exam_date || '')
      )[0];
      return {
        student_id: studentId,
        name: studentNameMap[studentId] || 'Unknown',
        academic_year: academicYear,
        not_this_year: plan?.state === 'not_this_year' || (academicYear ? academicYear > '2025-26' : false),
        has_date: studentAttempts.length > 0,
        exam_date: primaryAttempt?.exam_date ?? null,
        exam_city: primaryAttempt?.exam_city ?? null,
        exam_session: primaryAttempt?.exam_session ?? null,
        state: primaryAttempt?.state ?? null,
        exam_completed_at: primaryAttempt?.exam_completed_at ?? null,
        attempt_id: primaryAttempt?.id ?? null,
        plan_state: plan?.state ?? null,
        target_year: plan?.target_year ?? null,
        application_number: plan?.application_number ?? null,
      };
    }

    const allStudentSummaries = allStudentIds.map(buildStudentSummary);
    const submittedSummaries = allStudentSummaries
      .filter(s => s.has_date)
      .sort((a, b) => (b.exam_completed_at || '').localeCompare(a.exam_completed_at || ''));

    const deletedAttempts = includeDeleted
      ? (allAttempts || []).filter((a: any) => a.deleted_at)
      : [];
    const removedSummaries = deletedAttempts.map((a: any) => ({
      student_id: a.student_id,
      name: studentNameMap[a.student_id] || 'Unknown',
      academic_year: academicYearMap[a.student_id] ?? null,
      not_this_year: false,
      has_date: false,
      exam_date: a.exam_date,
      exam_city: a.exam_city,
      exam_session: a.exam_session,
      state: 'deleted',
      exam_completed_at: null,
      attempt_id: a.id,
      deleted_at: a.deleted_at,
      deletion_reason: a.deletion_reason,
    }));

    const buckets = {
      date_booked: allStudentIds.filter(id => submittedStudentIds.has(id)).length,
      applied_no_date: allStudentIds.filter(id =>
        !submittedStudentIds.has(id) && planMap[id]?.state === 'applied'
      ).length,
      planning: allStudentIds.filter(id =>
        !submittedStudentIds.has(id) &&
        ['planning_to_write', 'still_thinking'].includes(planMap[id]?.state ?? '')
      ).length,
      not_this_year: allStudentIds.filter(id => planMap[id]?.state === 'not_this_year').length,
      no_response: allStudentIds.filter(id =>
        !submittedStudentIds.has(id) && !planMap[id]
      ).length,
    };

    const stats = {
      total_students: allStudentIds.length,
      submitted_count: submittedStudentIds.size,
      not_submitted_count: notSubmittedIds.length,
      this_week_exam_count: thisWeekCount,
      completed_count: completedCount,
      students: allStudentSummaries,
      submitted_students: submittedSummaries,
      removed_students: removedSummaries,
      buckets,
    };

    const notSubmitted = notSubmittedIds
      .filter(id => planMap[id]?.state !== 'not_this_year')
      .map(id => ({
        id,
        name: studentNameMap[id] || 'Unknown',
      }));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyCompleted = attempts
      .filter((a: any) =>
        (a.state === 'completed' || a.state === 'scorecard_uploaded') &&
        a.exam_completed_at &&
        new Date(a.exam_completed_at) >= sevenDaysAgo
      )
      .map((a: any) => ({
        student_id: a.student_id,
        name: studentNameMap[a.student_id] || 'Unknown',
        exam_date: a.exam_date,
        completed_at: a.exam_completed_at,
        city: a.exam_city,
      }));

    const myAttempts = attempts
      .filter((a: any) => a.student_id === user.id)
      .map((a: any) => ({
        attempt_number: a.attempt_number || 1,
        exam_date: a.exam_date,
        exam_city: a.exam_city,
        exam_session: a.exam_session,
        state: a.state,
      }));

    const navigation = {
      min_week_offset: -currentWeekIdx,
      max_week_offset: weeks.length - 1 - currentWeekIdx,
      current_week_offset: 0,
    };

    return NextResponse.json({
      phase_info: {
        phase: phaseConfig.phase,
        label: phaseConfig.label,
        start_date: phaseConfig.startDate,
        end_date: phaseConfig.endDate,
        total_weeks: totalWeeks,
        max_attempts: phaseConfig.maxAttempts,
      },
      current_week: currentWeek,
      stats,
      not_submitted: notSubmitted,
      recently_completed: recentlyCompleted,
      navigation,
      my_attempts: myAttempts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
