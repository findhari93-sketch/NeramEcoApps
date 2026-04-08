import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

// ============================================
// NATA Exam Date Generation
// ============================================

interface PhaseConfig {
  phase: 'phase_1' | 'phase_2';
  label: string;
  start: string;
  end: string;
  max_attempts: number;
  dates: string[];
}

function formatISO(d: Date): string {
  // Use local time values (not UTC) to avoid timezone shift
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generatePhase1Dates(year: number): string[] {
  const start = new Date(year, 3, 4);  // April 4
  const end = new Date(year, 5, 13);   // June 13
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === 5 || d.getDay() === 6) { // Fri=5, Sat=6
      dates.push(formatISO(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getPhaseConfig(phase: string, year: number): PhaseConfig {
  if (phase === 'phase_2') {
    return {
      phase: 'phase_2',
      label: 'Phase 2',
      start: `${year}-08-07`,
      end: `${year}-08-08`,
      max_attempts: 1,
      dates: [`${year}-08-07`, `${year}-08-08`],
    };
  }
  const dates = generatePhase1Dates(year);
  return {
    phase: 'phase_1',
    label: 'Phase 1',
    start: `${year}-04-04`,
    end: `${year}-06-13`,
    max_attempts: 2,
    dates,
  };
}

// ============================================
// Week Grouping
// ============================================

interface WeekGroup {
  weekNumber: number;
  friday: string | null;
  saturday: string | null;
  weekStart: Date; // Monday of the week
}

function groupDatesByWeek(dates: string[]): WeekGroup[] {
  const weekMap = new Map<string, { friday: string | null; saturday: string | null }>();
  const weekStarts: string[] = [];

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00');
    // Find Monday of this week
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...
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
  return weeks.length - 1; // past all weeks, show last
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
// ============================================

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));
    const phase = request.nextUrl.searchParams.get('phase') || 'phase_1';
    const weekOffsetParam = parseInt(request.nextUrl.searchParams.get('week_offset') || '0');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify enrollment
    const { data: enrollment } = await db
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    // Generate phase dates
    const config = getPhaseConfig(phase, year);
    const weeks = groupDatesByWeek(config.dates);
    const totalWeeks = weeks.length;

    // Determine current week index
    const currentWeekIdx = getWeekOffset(weeks);
    const requestedIdx = Math.max(0, Math.min(weeks.length - 1, currentWeekIdx + weekOffsetParam));
    const week = weeks[requestedIdx];

    // Get ALL attempts for this classroom + exam type (including soft-deleted for teacher view)
    const includeDeleted = request.nextUrl.searchParams.get('include_deleted') === 'true';
    let attemptsQuery = db
      .from('nexus_student_exam_attempts')
      .select('id, student_id, exam_date, exam_date_id, exam_city, exam_session, attempt_number, state, exam_completed_at, deleted_at, deletion_reason')
      .eq('classroom_id', classroomId)
      .eq('exam_type', examType);

    if (!includeDeleted) {
      attemptsQuery = attemptsQuery.is('deleted_at', null);
    }

    const { data: allAttempts } = await attemptsQuery;

    // Filter to only those with a date, and resolve exam_date_id fallback
    let attempts = (allAttempts || []).filter((a: any) => a.exam_date || a.exam_date_id);

    // For attempts with exam_date_id but no exam_date, resolve from nexus_exam_dates
    // Note: nexus_exam_dates.exam_date may be a timestamptz - normalize to YYYY-MM-DD
    const needsResolution = attempts.filter((a: any) => !a.exam_date && a.exam_date_id);
    if (needsResolution.length > 0) {
      const dateIds = [...new Set(needsResolution.map((a: any) => a.exam_date_id))] as string[];
      const { data: resolvedDates } = await db
        .from('nexus_exam_dates')
        .select('id, exam_date')
        .in('id', dateIds);

      const dateMap: Record<string, string> = {};
      // Normalize timestamp to YYYY-MM-DD to match phase date strings
      for (const d of (resolvedDates || [])) dateMap[d.id] = d.exam_date?.split('T')[0] || d.exam_date;

      attempts = attempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date?.split('T')[0] || dateMap[a.exam_date_id] || null,
      })).filter((a: any) => a.exam_date);
    } else {
      // Also normalize exam_date in case it's a timestamp
      attempts = attempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date?.split('T')[0] || null,
      })).filter((a: any) => a.exam_date);
    }

    // Get all enrolled students
    const { data: allStudents } = await db
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    const allStudentIds = (allStudents || []).map((s: any) => s.user_id) as string[];

    // Get student names + academic year for ALL enrolled students
    const studentNameMap: Record<string, string> = {};
    const academicYearMap: Record<string, string | null> = {};

    if (allStudentIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, name')
        .in('id', allStudentIds);
      for (const u of (users || [])) {
        studentNameMap[u.id] = getUserName(u);
      }

      const { data: onboarding } = await db
        .from('nexus_student_onboarding')
        .select('student_id, academic_year')
        .eq('classroom_id', classroomId)
        .in('student_id', allStudentIds);
      for (const o of (onboarding || [])) {
        academicYearMap[o.student_id] = o.academic_year;
      }
    }

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

    // Stats: across the entire phase (use allStudentIds already fetched above)
    const submittedStudentIds = new Set(attempts.map((a: any) => a.student_id));
    const notSubmittedIds = allStudentIds.filter(id => !submittedStudentIds.has(id));

    // This week's exam count
    const thisWeekDates = [week.friday, week.saturday].filter(Boolean);
    const thisWeekCount = attempts.filter((a: any) => thisWeekDates.includes(a.exam_date)).length;

    // Completed count
    const completedCount = attempts.filter((a: any) =>
      a.state === 'completed' || a.state === 'scorecard_uploaded'
    ).length;

    // Build full student summary list for popup (all enrolled students)
    function buildStudentSummary(studentId: string) {
      const academicYear = academicYearMap[studentId] ?? null;
      const studentAttempts = attempts.filter((a: any) => a.student_id === studentId);
      // Pick the most recent/upcoming attempt for summary
      const primaryAttempt = studentAttempts.sort((a: any, b: any) =>
        (b.exam_date || '').localeCompare(a.exam_date || '')
      )[0];
      return {
        student_id: studentId,
        name: studentNameMap[studentId] || 'Unknown',
        academic_year: academicYear,
        not_this_year: academicYear ? academicYear > '2025-26' : false,
        has_date: studentAttempts.length > 0,
        exam_date: primaryAttempt?.exam_date ?? null,
        exam_city: primaryAttempt?.exam_city ?? null,
        exam_session: primaryAttempt?.exam_session ?? null,
        state: primaryAttempt?.state ?? null,
        exam_completed_at: primaryAttempt?.exam_completed_at ?? null,
        attempt_id: primaryAttempt?.id ?? null,
      };
    }

    const allStudentSummaries = allStudentIds.map(buildStudentSummary);

    // Submitted students (sorted by exam_completed_at desc for popup)
    const submittedSummaries = allStudentSummaries
      .filter(s => s.has_date)
      .sort((a, b) => (b.exam_completed_at || '').localeCompare(a.exam_completed_at || ''));

    // Soft-deleted attempts (for teacher view)
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

    const stats = {
      total_students: allStudentIds.length,
      submitted_count: submittedStudentIds.size,
      not_submitted_count: notSubmittedIds.length,
      this_week_exam_count: thisWeekCount,
      completed_count: completedCount,
      students: allStudentSummaries,
      submitted_students: submittedSummaries,
      removed_students: removedSummaries,
    };

    // Not submitted students with names
    const notSubmitted = notSubmittedIds.map(id => ({
      id,
      name: studentNameMap[id] || 'Unknown',
    }));

    // Recently completed (last 7 days)
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

    // My attempts (current user's submissions)
    const myAttempts = attempts
      .filter((a: any) => a.student_id === user.id)
      .map((a: any) => ({
        attempt_number: a.attempt_number || 1,
        exam_date: a.exam_date,
        exam_city: a.exam_city,
        exam_session: a.exam_session,
        state: a.state,
      }));

    // Navigation bounds
    const navigation = {
      min_week_offset: -currentWeekIdx,
      max_week_offset: weeks.length - 1 - currentWeekIdx,
      current_week_offset: 0,
    };

    return NextResponse.json({
      phase_info: {
        phase: config.phase,
        label: config.label,
        start_date: config.start,
        end_date: config.end,
        total_weeks: totalWeeks,
        max_attempts: config.max_attempts,
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
