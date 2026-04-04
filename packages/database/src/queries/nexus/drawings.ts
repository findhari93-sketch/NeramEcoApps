import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  DrawingQuestion,
  DrawingSubmission,
  DrawingSubmissionWithQuestion,
  DrawingSubmissionWithDetails,
} from '../../types';

// ============================================================
// Drawing Questions
// ============================================================

export async function getDrawingQuestions(
  filters?: {
    category?: string;
    sub_type?: string;
    difficulty_tag?: string;
    year?: number;
    search?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<{ data: DrawingQuestion[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_questions')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.sub_type) query = query.eq('sub_type', filters.sub_type);
  if (filters?.difficulty_tag) query = query.eq('difficulty_tag', filters.difficulty_tag);
  if (filters?.year) query = query.eq('year', filters.year);
  if (filters?.search) query = query.ilike('question_text', `%${filters.search}%`);

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data as DrawingQuestion[]) || [], count: count || 0 };
}

export async function getDrawingQuestionById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingQuestion | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_questions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DrawingQuestion;
}

export async function seedDrawingQuestions(
  questions: Omit<DrawingQuestion, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'reference_images' | 'solution_images'>[],
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const rows = questions.map((q) => ({
    year: q.year,
    session_date: q.session_date || null,
    source_student: q.source_student || null,
    category: q.category,
    sub_type: q.sub_type,
    question_text: q.question_text,
    objects: q.objects || [],
    color_constraint: q.color_constraint || null,
    design_principle: q.design_principle || null,
    difficulty_tag: q.difficulty_tag || 'medium',
    tags: q.tags || [],
    reference_images: [],
    solution_images: null,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('drawing_questions')
    .insert(rows)
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

// ============================================================
// Drawing Submissions — Student
// ============================================================

export async function createDrawingSubmission(
  data: {
    student_id: string;
    question_id?: string | null;
    source_type: string;
    original_image_url: string;
    self_note?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const { data: submission, error } = await supabase
    .from('drawing_submissions')
    .insert({
      student_id: data.student_id,
      question_id: data.question_id || null,
      source_type: data.source_type,
      original_image_url: data.original_image_url,
      self_note: data.self_note || null,
      status: 'submitted',
    })
    .select('*')
    .single();

  if (error) throw error;
  return submission as DrawingSubmission;
}

export async function getStudentDrawingSubmissions(
  studentId: string,
  filters?: {
    status?: string;
    question_id?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithQuestion[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*)')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.question_id) query = query.eq('question_id', filters.question_id);

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data as DrawingSubmissionWithQuestion[]) || [];
}

export async function getDrawingSubmissionById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithDetails | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as unknown as DrawingSubmissionWithDetails;
}

// ============================================================
// Drawing Submissions — Teacher
// ============================================================

export async function getDrawingReviewQueue(
  filters?: {
    status?: string;
    category?: string;
    student_id?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithDetails[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .order('submitted_at', { ascending: true });

  const status = filters?.status || 'submitted';
  query = query.eq('status', status);

  if (filters?.student_id) query = query.eq('student_id', filters.student_id);

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data as unknown as DrawingSubmissionWithDetails[]) || [];

  // Filter by category if specified (requires joining through question)
  if (filters?.category) {
    results = results.filter((s) => s.question?.category === filters.category);
  }

  return results;
}

export async function saveDrawingReview(
  submissionId: string,
  review: {
    tutor_rating: number;
    tutor_feedback?: string | null;
    reviewed_image_url?: string | null;
    tutor_resources?: Array<{ type: string; url: string; title: string }>;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions')
    .update({
      tutor_rating: review.tutor_rating,
      tutor_feedback: review.tutor_feedback || null,
      reviewed_image_url: review.reviewed_image_url || null,
      tutor_resources: review.tutor_resources || [],
      status: 'reviewed',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as DrawingSubmission;
}
