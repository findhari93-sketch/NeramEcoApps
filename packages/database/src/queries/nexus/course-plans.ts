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
      topic:nexus_topics(id, name),
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
      topic:nexus_topics(id, name),
      teacher:users!nexus_course_plan_sessions_teacher_id_fkey(id, name, avatar_url),
      homework:nexus_course_plan_homework(id, title, type, max_points, due_date),
      scheduled_class:nexus_scheduled_classes(id, scheduled_date, start_time, end_time, status, meeting_url)
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
