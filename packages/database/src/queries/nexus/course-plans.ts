// @ts-nocheck — tables not yet in generated types (migration pending)
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

// ============================================================
// Course Plan CRUD Queries
// ============================================================

/**
 * Get all course plans for a classroom with week and session counts
 */
export async function getCoursePlansByClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plans')
    .select(`
      *,
      weeks:nexus_course_plan_weeks(id),
      sessions:nexus_course_plan_sessions(id)
    `)
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Map to include counts
  return (data || []).map((plan: any) => ({
    ...plan,
    week_count: plan.weeks?.length || 0,
    session_count: plan.sessions?.length || 0,
    weeks: undefined,
    sessions: undefined,
  }));
}

/**
 * Get a course plan by ID with nested weeks → sessions, tests, drill count
 */
export async function getCoursePlanById(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Fetch plan
  const { data: plan, error: planError } = await supabase
    .from('nexus_course_plans')
    .select('*')
    .eq('id', planId)
    .single();
  if (planError) {
    if (planError.code === 'PGRST116') return null;
    throw planError;
  }

  // Fetch weeks
  const { data: weeks, error: weeksError } = await supabase
    .from('nexus_course_plan_weeks')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (weeksError) throw weeksError;

  // Fetch sessions with topic, teacher, homework count
  const { data: sessions, error: sessionsError } = await supabase
    .from('nexus_course_plan_sessions')
    .select(`
      *,
      topic:nexus_topics(id, title),
      teacher:users!nexus_course_plan_sessions_teacher_id_fkey(id, name, avatar_url),
      homework:nexus_course_plan_homework(id)
    `)
    .eq('plan_id', planId)
    .order('day_number', { ascending: true });
  if (sessionsError) throw sessionsError;

  // Fetch tests
  const { data: tests, error: testsError } = await supabase
    .from('nexus_course_plan_tests')
    .select('*, week:nexus_course_plan_weeks(id, week_number, title)')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (testsError) throw testsError;

  // Fetch drill count
  const { count: drillCount, error: drillError } = await supabase
    .from('nexus_course_plan_drill')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('is_active', true);
  if (drillError) throw drillError;

  // Nest sessions under weeks
  const weekMap = (weeks || []).map((week: any) => ({
    ...week,
    sessions: (sessions || [])
      .filter((s: any) => s.week_id === week.id)
      .map((s: any) => ({
        ...s,
        homework_count: s.homework?.length || 0,
        homework: undefined,
      })),
  }));

  return {
    ...plan,
    weeks: weekMap,
    tests: tests || [],
    drill_count: drillCount || 0,
  } as any;
}

/**
 * Create a course plan with auto-generated week shells and session shells
 */
export async function createCoursePlan(
  data: {
    classroom_id: string;
    name: string;
    description?: string;
    duration_weeks: number;
    days_per_week: string[];
    sessions_per_day: Array<{ slot: string; label?: string }>;
    teaching_team?: Array<{ user_id: string; name: string; role?: string }>;
    status?: string;
    created_by?: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Insert plan
  const { data: plan, error: planError } = await supabase
    .from('nexus_course_plans')
    .insert({
      classroom_id: data.classroom_id,
      name: data.name,
      description: data.description,
      duration_weeks: data.duration_weeks,
      days_per_week: data.days_per_week,
      sessions_per_day: data.sessions_per_day as any,
      teaching_team: data.teaching_team as any,
      status: data.status || 'draft',
      created_by: data.created_by,
    } as any)
    .select()
    .single();
  if (planError) throw planError;

  // Auto-generate week shells
  const weekInserts = Array.from({ length: data.duration_weeks }, (_, i) => ({
    plan_id: plan.id,
    week_number: i + 1,
    title: `Week ${i + 1}`,
    sort_order: i,
  }));

  const { data: weeks, error: weeksError } = await supabase
    .from('nexus_course_plan_weeks')
    .insert(weekInserts as any)
    .select();
  if (weeksError) throw weeksError;

  // Auto-generate session shells per week
  const sessionInserts: any[] = [];
  let globalDayNumber = 0;

  for (const week of (weeks || [])) {
    for (let dayIdx = 0; dayIdx < data.days_per_week.length; dayIdx++) {
      globalDayNumber++;
      const dayOfWeek = data.days_per_week[dayIdx];
      for (const sessionDef of data.sessions_per_day) {
        sessionInserts.push({
          week_id: week.id,
          plan_id: plan.id,
          day_number: globalDayNumber,
          day_of_week: dayOfWeek,
          slot: sessionDef.slot,
          title: sessionDef.label || `Day ${globalDayNumber} - ${sessionDef.slot.toUpperCase()}`,
          status: 'planned',
        });
      }
    }
  }

  if (sessionInserts.length > 0) {
    const { error: sessionsError } = await supabase
      .from('nexus_course_plan_sessions')
      .insert(sessionInserts as any);
    if (sessionsError) throw sessionsError;
  }

  return plan;
}

/**
 * Partial update a course plan
 */
export async function updateCoursePlan(
  planId: string,
  updates: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plans')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * List sessions for a plan, optionally filtered by week. Includes topic, teacher, homework, scheduled_class joins.
 */
export async function getSessionsByPlan(
  planId: string,
  weekId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_course_plan_sessions')
    .select(`
      *,
      topic:nexus_topics(id, title),
      teacher:users!nexus_course_plan_sessions_teacher_id_fkey(id, name, avatar_url),
      homework:nexus_course_plan_homework(id, title, type, max_points, due_date),
      scheduled_class:nexus_scheduled_classes(id, scheduled_date, start_time, end_time, status, teams_meeting_url)
    `)
    .eq('plan_id', planId)
    .order('day_number', { ascending: true });

  if (weekId) {
    query = query.eq('week_id', weekId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Partial update a session
 */
export async function updateSession(
  sessionId: string,
  updates: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Set week date range
 */
export async function updateWeekDates(
  weekId: string,
  startDate: string,
  endDate: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_weeks')
    .update({ start_date: startDate, end_date: endDate } as any)
    .eq('id', weekId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * List tests for a plan with week info
 */
export async function getTestsByPlan(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_tests')
    .select('*, week:nexus_course_plan_weeks(id, week_number, title)')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Insert a test for a plan
 */
export async function createPlanTest(
  data: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: test, error } = await supabase
    .from('nexus_course_plan_tests')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return test;
}

/**
 * List resources for a plan with optional topic/session filter
 */
export async function getResourcesByPlan(
  planId: string,
  filters?: { topic_id?: string; session_id?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_course_plan_resources')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });

  if (filters?.topic_id) {
    query = query.eq('topic_id', filters.topic_id);
  }
  if (filters?.session_id) {
    query = query.eq('session_id', filters.session_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Insert a resource
 */
export async function createResource(
  data: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: resource, error } = await supabase
    .from('nexus_course_plan_resources')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return resource;
}

// ============================================================
// Bulk Populate Plan — CSV upload populates sessions, weeks, etc.
// ============================================================

/**
 * Bulk-populate a course plan from parsed CSV data.
 *
 * Updates existing week and session rows (matched by plan_id + week_number
 * or plan_id + day_number + slot) and inserts new homework, tests, drills,
 * and resources.
 *
 * Returns a summary of how many rows were affected in each table.
 */
export async function bulkPopulatePlan(
  planId: string,
  data: {
    weeks: Array<{ week_number: number; title: string; goal: string }>;
    sessions: Array<{
      day_number: number;
      slot: string;
      title: string;
      teacher_id?: string;
      description?: string;
    }>;
    homework: Array<{
      session_day_number: number;
      session_slot: string;
      title: string;
      type?: string;
      max_points?: number;
      estimated_minutes?: number;
    }>;
    tests: Array<{
      week_number: number;
      title: string;
      question_count?: number;
      duration_minutes?: number;
      scope?: string;
    }>;
    drills: Array<{
      question_text: string;
      answer_text: string;
      explanation?: string;
      frequency_note?: string;
    }>;
    resources: Array<{
      title: string;
      url: string;
      type?: string;
    }>;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  const summary = {
    weeks_updated: 0,
    sessions_updated: 0,
    homework_inserted: 0,
    tests_inserted: 0,
    drills_inserted: 0,
    resources_inserted: 0,
  };

  // ---- Fetch existing weeks and sessions for this plan ----

  const { data: existingWeeks, error: weeksErr } = await supabase
    .from('nexus_course_plan_weeks')
    .select('id, week_number')
    .eq('plan_id', planId);
  if (weeksErr) throw weeksErr;

  const { data: existingSessions, error: sessionsErr } = await supabase
    .from('nexus_course_plan_sessions')
    .select('id, day_number, slot')
    .eq('plan_id', planId);
  if (sessionsErr) throw sessionsErr;

  // Build lookup maps
  const weekMap = new Map<number, string>(); // week_number → id
  for (const w of existingWeeks || []) {
    weekMap.set((w as any).week_number, (w as any).id);
  }

  const sessionMap = new Map<string, string>(); // "day_number:slot" → id
  for (const s of existingSessions || []) {
    sessionMap.set(`${(s as any).day_number}:${(s as any).slot}`, (s as any).id);
  }

  // ---- 1. Update weeks (match by plan_id + week_number) ----

  for (const week of data.weeks) {
    const weekId = weekMap.get(week.week_number);
    if (!weekId) continue;

    const updates: Record<string, unknown> = {};
    if (week.title) updates.title = week.title;
    if (week.goal) updates.goal = week.goal;
    if (Object.keys(updates).length === 0) continue;

    const { error } = await supabase
      .from('nexus_course_plan_weeks')
      .update(updates as any)
      .eq('id', weekId);
    if (error) throw error;
    summary.weeks_updated++;
  }

  // ---- 2. Update sessions (match by plan_id + day_number + slot) ----

  for (const session of data.sessions) {
    const key = `${session.day_number}:${session.slot}`;
    const sessionId = sessionMap.get(key);
    if (!sessionId) continue;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (session.title) updates.title = session.title;
    if (session.teacher_id) updates.teacher_id = session.teacher_id;
    if (session.description) updates.description = session.description;

    const { error } = await supabase
      .from('nexus_course_plan_sessions')
      .update(updates as any)
      .eq('id', sessionId);
    if (error) throw error;
    summary.sessions_updated++;
  }

  // ---- 3. Insert homework (find session_id by day_number + slot) ----

  const homeworkInserts: any[] = [];
  for (const hw of data.homework) {
    const key = `${hw.session_day_number}:${hw.session_slot}`;
    const sessionId = sessionMap.get(key);
    if (!sessionId) continue;

    homeworkInserts.push({
      session_id: sessionId,
      plan_id: planId,
      title: hw.title,
      type: hw.type || 'mixed',
      max_points: hw.max_points || null,
      estimated_minutes: hw.estimated_minutes || null,
      sort_order: homeworkInserts.length,
    });
  }

  if (homeworkInserts.length > 0) {
    const { error } = await supabase
      .from('nexus_course_plan_homework')
      .insert(homeworkInserts as any);
    if (error) throw error;
    summary.homework_inserted = homeworkInserts.length;
  }

  // ---- 4. Insert tests (find week_id by week_number) ----

  const testInserts: any[] = [];
  for (const test of data.tests) {
    const weekId = weekMap.get(test.week_number);
    if (!weekId) continue;

    testInserts.push({
      plan_id: planId,
      week_id: weekId,
      title: test.title,
      question_count: test.question_count || null,
      duration_minutes: test.duration_minutes || null,
      scope: test.scope || null,
      sort_order: testInserts.length,
    });
  }

  if (testInserts.length > 0) {
    const { error } = await supabase
      .from('nexus_course_plan_tests')
      .insert(testInserts as any);
    if (error) throw error;
    summary.tests_inserted = testInserts.length;
  }

  // ---- 5. Insert drill questions ----

  const drillInserts: any[] = [];
  for (const drill of data.drills) {
    drillInserts.push({
      plan_id: planId,
      question_text: drill.question_text,
      answer_text: drill.answer_text,
      explanation: drill.explanation || null,
      frequency_note: drill.frequency_note || null,
      sort_order: drillInserts.length,
      is_active: true,
    });
  }

  if (drillInserts.length > 0) {
    const { error } = await supabase
      .from('nexus_course_plan_drill')
      .insert(drillInserts as any);
    if (error) throw error;
    summary.drills_inserted = drillInserts.length;
  }

  // ---- 6. Insert resources (attach to first session for CHECK constraint) ----

  if (data.resources.length > 0) {
    // Find the first session ID for the plan to satisfy
    // CHECK (topic_id IS NOT NULL OR session_id IS NOT NULL)
    const firstSessionId = existingSessions && existingSessions.length > 0
      ? (existingSessions[0] as any).id
      : null;

    if (!firstSessionId) {
      // No sessions exist — cannot insert resources without a session_id or topic_id
      // Skip silently; caller should handle this edge case
    } else {
      const resourceInserts: any[] = [];
      for (const res of data.resources) {
        resourceInserts.push({
          plan_id: planId,
          session_id: firstSessionId,
          title: res.title,
          url: res.url,
          type: res.type || 'reference',
          sort_order: resourceInserts.length,
        });
      }

      const { error } = await supabase
        .from('nexus_course_plan_resources')
        .insert(resourceInserts as any);
      if (error) throw error;
      summary.resources_inserted = resourceInserts.length;
    }
  }

  return summary;
}
