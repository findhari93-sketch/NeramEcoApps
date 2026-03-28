/**
 * Post-Enrollment Onboarding Steps - Query Functions
 *
 * CRUD for step definitions + student progress tracking
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OnboardingStepDefinition,
  StudentOnboardingProgress,
  StudentOnboardingStepWithDefinition,
  OnboardingCompletedByType,
  EnrollmentType,
  OnboardingPhase,
} from '../types';

// ============================================
// Step Definitions (Admin CRUD)
// ============================================

export async function listOnboardingStepDefinitions(
  supabase: SupabaseClient,
  options?: { activeOnly?: boolean }
) {
  let query = supabase
    .from('onboarding_step_definitions')
    .select('*')
    .order('display_order', { ascending: true });

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as OnboardingStepDefinition[];
}

export async function getOnboardingStepDefinitionById(
  id: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('onboarding_step_definitions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as OnboardingStepDefinition;
}

export async function createOnboardingStepDefinition(
  input: {
    step_key: string;
    title: string;
    description?: string;
    icon_name?: string;
    action_type?: string;
    action_config?: Record<string, unknown>;
    display_order?: number;
    is_active?: boolean;
    is_required?: boolean;
    applies_to?: EnrollmentType[];
    phase?: OnboardingPhase;
  },
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('onboarding_step_definitions')
    .insert({
      step_key: input.step_key,
      title: input.title,
      description: input.description || null,
      icon_name: input.icon_name || null,
      action_type: input.action_type || 'manual',
      action_config: input.action_config || {},
      display_order: input.display_order ?? 0,
      is_active: input.is_active ?? true,
      is_required: input.is_required ?? true,
      applies_to: input.applies_to || ['regular', 'direct'],
      phase: input.phase || 'get_ready',
    })
    .select()
    .single();

  if (error) throw error;
  return data as OnboardingStepDefinition;
}

export async function updateOnboardingStepDefinition(
  id: string,
  updates: Partial<{
    step_key: string;
    title: string;
    description: string | null;
    icon_name: string | null;
    action_type: string;
    action_config: Record<string, unknown>;
    display_order: number;
    is_active: boolean;
    is_required: boolean;
    applies_to: EnrollmentType[];
    phase: OnboardingPhase;
  }>,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('onboarding_step_definitions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as OnboardingStepDefinition;
}

export async function deleteOnboardingStepDefinition(
  id: string,
  supabase: SupabaseClient
) {
  const { error } = await supabase
    .from('onboarding_step_definitions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reorderOnboardingSteps(
  orderedIds: string[],
  supabase: SupabaseClient
) {
  // Update display_order for each step based on array position
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('onboarding_step_definitions')
      .update({ display_order: index + 1 })
      .eq('id', id)
  );

  await Promise.all(updates);
}

// ============================================
// Student Onboarding Progress
// ============================================

/**
 * Initialize onboarding steps for a newly enrolled student.
 * Creates progress rows for all active step definitions that apply to the enrollment type.
 */
export async function initializeStudentOnboarding(
  studentProfileId: string,
  userId: string,
  enrollmentType: EnrollmentType,
  supabase: SupabaseClient
) {
  // Use the DB function for atomic initialization
  const { error } = await supabase.rpc('initialize_student_onboarding', {
    p_student_profile_id: studentProfileId,
    p_user_id: userId,
    p_enrollment_type: enrollmentType,
  });

  if (error) throw error;
}

/**
 * Get all onboarding steps for a student with their progress, joined with definitions.
 */
export async function getStudentOnboardingProgress(
  studentProfileId: string,
  supabase: SupabaseClient
): Promise<StudentOnboardingStepWithDefinition[]> {
  const { data, error } = await supabase
    .from('student_onboarding_progress')
    .select(`
      *,
      step_definition:onboarding_step_definitions(*)
    `)
    .eq('student_profile_id', studentProfileId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Sort by step definition display_order
  const results = (data || []) as StudentOnboardingStepWithDefinition[];
  return results.sort((a, b) =>
    (a.step_definition?.display_order ?? 0) - (b.step_definition?.display_order ?? 0)
  );
}

/**
 * Get onboarding progress by user_id (for student app where we know user but not profile ID)
 */
export async function getStudentOnboardingProgressByUserId(
  userId: string,
  supabase: SupabaseClient
): Promise<StudentOnboardingStepWithDefinition[]> {
  const { data, error } = await supabase
    .from('student_onboarding_progress')
    .select(`
      *,
      step_definition:onboarding_step_definitions(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const results = (data || []) as StudentOnboardingStepWithDefinition[];
  return results.sort((a, b) =>
    (a.step_definition?.display_order ?? 0) - (b.step_definition?.display_order ?? 0)
  );
}

/**
 * Mark a step as completed.
 */
export async function markOnboardingStepComplete(
  progressId: string,
  completedByType: OnboardingCompletedByType,
  completedByUserId: string,
  supabase: SupabaseClient,
  adminNotes?: string
) {
  const updateData: Record<string, unknown> = {
    is_completed: true,
    completed_at: new Date().toISOString(),
    completed_by_type: completedByType,
    completed_by_user_id: completedByUserId,
  };
  if (adminNotes !== undefined) {
    updateData.admin_notes = adminNotes;
  }

  const { data, error } = await supabase
    .from('student_onboarding_progress')
    .update(updateData)
    .eq('id', progressId)
    .select()
    .single();

  if (error) throw error;
  return data as StudentOnboardingProgress;
}

/**
 * Mark a step as incomplete (undo completion).
 */
export async function markOnboardingStepIncomplete(
  progressId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('student_onboarding_progress')
    .update({
      is_completed: false,
      completed_at: null,
      completed_by_type: null,
      completed_by_user_id: null,
    })
    .eq('id', progressId)
    .select()
    .single();

  if (error) throw error;
  return data as StudentOnboardingProgress;
}

/**
 * Admin overview: get all students with their onboarding completion stats.
 */
export async function getOnboardingOverview(
  supabase: SupabaseClient,
  options?: {
    search?: string;
    batchId?: string;
    courseId?: string;
    completionFilter?: 'all' | 'complete' | 'incomplete';
    page?: number;
    limit?: number;
  }
) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;
  const offset = (page - 1) * limit;

  // Get students with their profiles and onboarding progress
  let query = supabase
    .from('student_profiles')
    .select(`
      id,
      user_id,
      batch_id,
      course_id,
      enrollment_date,
      user:users!inner(id, first_name, last_name, phone, email),
      course:courses(name),
      batch:batches(name),
      onboarding_progress:student_onboarding_progress(
        id,
        is_completed,
        step_definition_id,
        completed_by_type,
        step_definition:onboarding_step_definitions(step_key, title, display_order)
      )
    `, { count: 'exact' });

  if (options?.batchId) {
    query = query.eq('batch_id', options.batchId);
  }
  if (options?.courseId) {
    query = query.eq('course_id', options.courseId);
  }
  if (options?.search) {
    query = query.or(
      `user.first_name.ilike.%${options.search}%,user.last_name.ilike.%${options.search}%,user.phone.ilike.%${options.search}%,user.email.ilike.%${options.search}%`
    );
  }

  query = query
    .order('enrollment_date', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Process: compute completion stats per student
  const students = (data || []).map((student: any) => {
    const progress = student.onboarding_progress || [];
    const totalSteps = progress.length;
    const completedSteps = progress.filter((p: any) => p.is_completed).length;
    return {
      ...student,
      total_steps: totalSteps,
      completed_steps: completedSteps,
      is_fully_complete: totalSteps > 0 && completedSteps === totalSteps,
    };
  });

  // Apply completion filter client-side (since it's computed)
  let filtered = students;
  if (options?.completionFilter === 'complete') {
    filtered = students.filter((s: any) => s.is_fully_complete);
  } else if (options?.completionFilter === 'incomplete') {
    filtered = students.filter((s: any) => !s.is_fully_complete);
  }

  return {
    data: filtered,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

/**
 * Bulk mark a step as complete for multiple students.
 */
export async function bulkMarkOnboardingStepComplete(
  studentProfileIds: string[],
  stepDefinitionId: string,
  adminUserId: string,
  supabase: SupabaseClient
) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('student_onboarding_progress')
    .update({
      is_completed: true,
      completed_at: now,
      completed_by_type: 'admin' as OnboardingCompletedByType,
      completed_by_user_id: adminUserId,
    })
    .in('student_profile_id', studentProfileIds)
    .eq('step_definition_id', stepDefinitionId)
    .select();

  if (error) throw error;
  return data as StudentOnboardingProgress[];
}
