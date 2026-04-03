// @ts-nocheck — tables not yet in generated types (migration pending)
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

// ============================================================
// Course Plan Drill Queries
// ============================================================

/**
 * Get active drill questions for a plan, ordered by sort_order
 */
export async function getDrillQuestions(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Get all drill questions including inactive (for teacher management)
 */
export async function getAllDrillQuestions(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Create a drill question
 */
export async function createDrillQuestion(
  data: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: drill, error } = await supabase
    .from('nexus_course_plan_drill')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return drill;
}

/**
 * Partial update a drill question
 */
export async function updateDrillQuestion(
  drillId: string,
  updates: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .update(updates as any)
    .eq('id', drillId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Get drill progress for a student with drill question join
 */
export async function getDrillProgress(
  planId: string,
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all active drill questions for the plan
  const { data: drills, error: drillError } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (drillError) throw drillError;

  // Get student's progress records
  const drillIds = (drills || []).map((d: any) => d.id);
  let progressRecords: any[] = [];
  if (drillIds.length > 0) {
    const { data: progress, error: progressError } = await supabase
      .from('nexus_drill_progress')
      .select('*')
      .in('drill_id', drillIds)
      .eq('student_id', studentId);
    if (progressError) throw progressError;
    progressRecords = progress || [];
  }

  // Join progress onto drill questions
  const progressMap = new Map(progressRecords.map((p: any) => [p.drill_id, p]));
  return (drills || []).map((drill: any) => ({
    ...drill,
    progress: progressMap.get(drill.id) || null,
  }));
}

/**
 * Upsert drill progress for a student
 */
export async function updateDrillProgress(
  drillId: string,
  studentId: string,
  mastered: boolean,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drill_progress')
    .upsert(
      {
        drill_id: drillId,
        student_id: studentId,
        mastered,
        attempts: 1, // Will be incremented via RPC or manually if needed
        last_attempted_at: new Date().toISOString(),
      } as any,
      { onConflict: 'drill_id,student_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Get per-question mastery stats for teacher view
 * Returns each drill question with counts of mastered/attempted/total students
 */
export async function getDrillMasteryStats(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all active drill questions
  const { data: drills, error: drillError } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (drillError) throw drillError;

  // Get all progress records for these drills
  const drillIds = (drills || []).map((d: any) => d.id);
  let progressRecords: any[] = [];
  if (drillIds.length > 0) {
    const { data: progress, error: progressError } = await supabase
      .from('nexus_drill_progress')
      .select('*')
      .in('drill_id', drillIds);
    if (progressError) throw progressError;
    progressRecords = progress || [];
  }

  // Aggregate stats per question
  return (drills || []).map((drill: any) => {
    const records = progressRecords.filter((p: any) => p.drill_id === drill.id);
    const masteredCount = records.filter((p: any) => p.mastered).length;
    const attemptedCount = records.length;
    return {
      ...drill,
      mastered_count: masteredCount,
      attempted_count: attemptedCount,
      mastery_rate: attemptedCount > 0 ? Math.round((masteredCount / attemptedCount) * 100) : 0,
    };
  });
}
