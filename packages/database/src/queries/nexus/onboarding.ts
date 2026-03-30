import { getSupabaseAdminClient } from '../../client';
import type {
  NexusStudentOnboarding,
  NexusStudentOnboardingWithStudent,
  OnboardingStep,
  OnboardingStatus,
  DocumentStandard,
} from '../../types';
import { getEnrollmentPrefillData } from './onboarding-prefill';

// Cast to 'any' — onboarding table is not in generated Supabase types yet
const supabase = (): any => getSupabaseAdminClient();

// ============================================
// GET / CHECK ONBOARDING STATUS
// ============================================

export async function getOnboardingStatus(
  studentId: string
): Promise<NexusStudentOnboarding | null> {
  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .select('*')
    .eq('student_id', studentId)
    .single();

  if (error && error.code === 'PGRST116') return null; // not found
  if (error) throw error;
  return data as NexusStudentOnboarding;
}

export async function isOnboardingComplete(
  studentId: string
): Promise<boolean> {
  const record = await getOnboardingStatus(studentId);
  return record?.status === 'approved';
}

// ============================================
// CREATE / UPDATE ONBOARDING
// ============================================

export async function createOrGetOnboarding(
  studentId: string
): Promise<NexusStudentOnboarding> {
  // Try to get existing
  const existing = await getOnboardingStatus(studentId);
  if (existing) return existing;

  // Try to pre-fill from enrollment data
  const prefill = await getEnrollmentPrefillData(studentId, supabase()).catch(() => null);

  // Create new with pre-filled data if available
  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .insert({
      student_id: studentId,
      current_step: 'welcome',
      status: 'in_progress',
      current_standard: prefill?.currentStandard || null,
      academic_year: prefill?.academicYear || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as NexusStudentOnboarding;
}

export async function updateOnboardingStep(
  studentId: string,
  step: OnboardingStep,
  extraData?: {
    current_standard?: DocumentStandard;
    academic_year?: string;
  }
): Promise<NexusStudentOnboarding> {
  const updates: Record<string, unknown> = { current_step: step };
  if (extraData?.current_standard) updates.current_standard = extraData.current_standard;
  if (extraData?.academic_year) updates.academic_year = extraData.academic_year;

  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .update(updates)
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data as NexusStudentOnboarding;
}

export async function submitOnboarding(
  studentId: string
): Promise<NexusStudentOnboarding> {
  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .update({
      current_step: 'pending_review',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data as NexusStudentOnboarding;
}

// ============================================
// REVIEWER ACTIONS
// ============================================

export async function approveOnboarding(
  studentId: string,
  reviewerId: string
): Promise<NexusStudentOnboarding> {
  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data as NexusStudentOnboarding;
}

export async function rejectOnboarding(
  studentId: string,
  reviewerId: string,
  reason: string
): Promise<NexusStudentOnboarding> {
  const { data, error } = await supabase()
    .from('nexus_student_onboarding')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      current_step: 'documents', // Send back to documents step
    })
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data as NexusStudentOnboarding;
}

// ============================================
// PENDING REVIEWS LIST (for teachers)
// ============================================

export async function getPendingOnboardingReviews(
  classroomId?: string
): Promise<NexusStudentOnboardingWithStudent[]> {
  let query = supabase()
    .from('nexus_student_onboarding')
    .select('*, student:users!student_id(id, name, email, avatar_url)')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true });

  if (classroomId) {
    // Get student IDs enrolled in this classroom
    const { data: enrollments } = await supabase()
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', classroomId)
      .eq('is_active', true);
    const studentIds = (enrollments || []).map((e: any) => e.user_id);
    if (studentIds.length > 0) {
      query = query.in('student_id', studentIds);
    } else {
      return []; // No students in this classroom
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as NexusStudentOnboardingWithStudent[];
}

export async function getAllOnboardingRecords(
  classroomId?: string,
  statusFilter?: OnboardingStatus
): Promise<NexusStudentOnboardingWithStudent[]> {
  let query = supabase()
    .from('nexus_student_onboarding')
    .select('*, student:users!student_id(id, name, email, avatar_url)');

  if (classroomId) {
    // Get student IDs enrolled in this classroom
    const { data: enrollments } = await supabase()
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', classroomId)
      .eq('is_active', true);
    const studentIds = (enrollments || []).map((e: any) => e.user_id);
    if (studentIds.length > 0) {
      query = query.in('student_id', studentIds);
    } else {
      return []; // No students in this classroom
    }
  }

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusStudentOnboardingWithStudent[];
}

// ============================================
// NUDGE TRACKING
// ============================================

export async function recordNudge(
  studentId: string
): Promise<{ allowed: boolean; nextNudgeAt: string | null }> {
  const record = await getOnboardingStatus(studentId);
  if (!record) return { allowed: false, nextNudgeAt: null };

  // Check 24-hour cooldown
  if (record.last_nudge_at) {
    const lastNudge = new Date(record.last_nudge_at);
    const now = new Date();
    const hoursSinceNudge = (now.getTime() - lastNudge.getTime()) / (1000 * 60 * 60);
    if (hoursSinceNudge < 24) {
      const nextNudgeAt = new Date(lastNudge.getTime() + 24 * 60 * 60 * 1000);
      return { allowed: false, nextNudgeAt: nextNudgeAt.toISOString() };
    }
  }

  // Record the nudge
  const { error } = await supabase()
    .from('nexus_student_onboarding')
    .update({
      last_nudge_at: new Date().toISOString(),
      nudge_count: (record.nudge_count || 0) + 1,
    })
    .eq('student_id', studentId);

  if (error) throw error;
  return { allowed: true, nextNudgeAt: null };
}

// ============================================
// ONBOARDING-REQUIRED TEMPLATES
// ============================================

export async function getOnboardingRequiredTemplates() {
  const { data, error } = await supabase()
    .from('nexus_document_templates')
    .select('*')
    .eq('is_onboarding_required', true)
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data || [];
}

// ============================================
// EXAM PROMPT TRACKING
// ============================================

export async function getExamPlansNeedingPrompt(
  studentId: string,
  classroomId: string
): Promise<any[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase()
    .from('nexus_student_exam_plans')
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .in('state', ['still_thinking', 'planning_to_write'])
    .or(`next_prompt_at.is.null,next_prompt_at.lte.${now}`)
    .or(`prompt_snooze_until.is.null,prompt_snooze_until.lte.${now}`);

  if (error) throw error;
  return data || [];
}

export async function updateExamPlanPrompt(
  planId: string,
  action: 'applied' | 'planning' | 'snooze' | 'not_writing',
  extraData?: { application_number?: string; notes?: string }
): Promise<void> {
  const now = new Date();
  const updates: Record<string, unknown> = { last_prompted_at: now.toISOString() };

  switch (action) {
    case 'applied':
      updates.state = 'applied';
      updates.next_prompt_at = null; // Stop prompting
      if (extraData?.application_number) updates.application_number = extraData.application_number;
      break;
    case 'planning':
      // Next Monday
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
      nextMonday.setHours(0, 0, 0, 0);
      updates.state = 'planning_to_write';
      updates.next_prompt_at = nextMonday.toISOString();
      break;
    case 'snooze':
      // 3 days from now
      const snoozeUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      updates.prompt_snooze_until = snoozeUntil.toISOString();
      break;
    case 'not_writing':
      updates.state = 'completed';
      updates.next_prompt_at = null;
      updates.notes = 'Student decided not to write this exam';
      break;
  }

  const { error } = await supabase()
    .from('nexus_student_exam_plans')
    .update(updates)
    .eq('id', planId);

  if (error) throw error;
}
