import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  DrawingQuestion,
  DrawingSubmission,
  DrawingSubmissionWithQuestion,
  DrawingSubmissionWithDetails,
  DrawingThreadStatusRecord,
  DrawingSubmissionComment,
  DrawingSubmissionCommentWithAuthor,
  DrawingThreadView,
  DrawingThreadAttempt,
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

  // Enrich with thread info
  if (results.length > 0) {
    const questionIds = results.filter(s => s.question?.id).map(s => s.question!.id);
    if (questionIds.length > 0) {
      const { data: threads } = await supabase
        .from('drawing_thread_status')
        .select('*')
        .in('question_id', questionIds);

      const threadMap = new Map((threads || []).map((t: any) => [`${t.student_id}_${t.question_id}`, t]));
      results = results.map(s => ({
        ...s,
        thread_info: s.question ? threadMap.get(`${s.student_id}_${s.question.id}`) || null : null,
      }));
    }
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

// ============================================================
// Drawing Threads
// ============================================================

export async function getDrawingThread(
  studentId: string,
  questionId: string,
  client?: TypedSupabaseClient
): Promise<DrawingThreadView | null> {
  const supabase = client || getSupabaseAdminClient();

  // Get thread status
  const { data: threadStatus, error: tsError } = await supabase
    .from('drawing_thread_status')
    .select('*')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .single();

  if (tsError) {
    if (tsError.code === 'PGRST116') return null;
    throw tsError;
  }

  // Get question
  const { data: question } = await supabase
    .from('drawing_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  if (!question) return null;

  // Get all attempts in this thread
  const { data: submissions, error: subError } = await supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('thread_id', threadStatus.thread_id)
    .order('attempt_number', { ascending: true });

  if (subError) throw subError;

  // Get comments for all submissions in the thread
  const submissionIds = (submissions || []).map((s: any) => s.id);
  let allComments: any[] = [];
  if (submissionIds.length > 0) {
    const { data: comments } = await supabase
      .from('drawing_submission_comments')
      .select('*, author:users!drawing_submission_comments_author_id_fkey(id, name, avatar_url)')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: true });
    allComments = comments || [];
  }

  // Group comments by submission
  const commentsBySubmission: Record<string, any[]> = {};
  for (const c of allComments) {
    if (!commentsBySubmission[c.submission_id]) commentsBySubmission[c.submission_id] = [];
    commentsBySubmission[c.submission_id].push(c);
  }

  const attempts: DrawingThreadAttempt[] = (submissions || []).map((s: any) => ({
    ...s,
    comments: commentsBySubmission[s.id] || [],
  }));

  return {
    thread_status: threadStatus as DrawingThreadStatusRecord,
    question: question as any,
    attempts,
  };
}

export async function createDrawingSubmissionWithThread(
  data: {
    student_id: string;
    question_id: string | null;
    source_type: string;
    original_image_url: string;
    self_note?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<{ submission: DrawingSubmission; isRedo: boolean; attemptNumber: number }> {
  const supabase = client || getSupabaseAdminClient();

  // If no question_id, create a simple submission (no thread)
  if (!data.question_id) {
    const submission = await createDrawingSubmission(data, supabase);
    // Update thread_id to self
    await supabase.from('drawing_submissions').update({ thread_id: submission.id, attempt_number: 1 }).eq('id', submission.id);
    return { submission: { ...submission, thread_id: submission.id, attempt_number: 1 }, isRedo: false, attemptNumber: 1 };
  }

  // Check if a thread exists for this student+question
  const { data: existingThread } = await supabase
    .from('drawing_thread_status')
    .select('*')
    .eq('student_id', data.student_id)
    .eq('question_id', data.question_id)
    .single();

  if (!existingThread) {
    // First attempt — create submission + thread
    const { data: submission, error } = await supabase
      .from('drawing_submissions')
      .insert({
        student_id: data.student_id,
        question_id: data.question_id,
        source_type: data.source_type,
        original_image_url: data.original_image_url,
        self_note: data.self_note || null,
        status: 'submitted',
        attempt_number: 1,
        thread_id: '00000000-0000-0000-0000-000000000000', // placeholder
      })
      .select('*')
      .single();

    if (error) throw error;

    // Set thread_id to self
    await supabase.from('drawing_submissions').update({ thread_id: submission.id }).eq('id', submission.id);

    // Create thread status
    await supabase.from('drawing_thread_status').insert({
      student_id: data.student_id,
      question_id: data.question_id,
      thread_id: submission.id,
      status: 'active',
      total_attempts: 1,
      latest_submission_id: submission.id,
    });

    return {
      submission: { ...submission, thread_id: submission.id } as DrawingSubmission,
      isRedo: false,
      attemptNumber: 1,
    };
  }

  // Thread exists — check if redo is allowed
  if (existingThread.status !== 'redo') {
    throw new Error('Cannot submit: thread is not in redo state. Wait for teacher review or the thread is already completed.');
  }

  // Create next attempt
  const nextAttempt = (existingThread.total_attempts || 1) + 1;

  const { data: submission, error } = await supabase
    .from('drawing_submissions')
    .insert({
      student_id: data.student_id,
      question_id: data.question_id,
      source_type: data.source_type,
      original_image_url: data.original_image_url,
      self_note: data.self_note || null,
      status: 'submitted',
      thread_id: existingThread.thread_id,
      attempt_number: nextAttempt,
    })
    .select('*')
    .single();

  if (error) throw error;

  // Update thread status
  await supabase
    .from('drawing_thread_status')
    .update({
      status: 'active',
      total_attempts: nextAttempt,
      latest_submission_id: submission.id,
    })
    .eq('id', existingThread.id);

  return {
    submission: submission as DrawingSubmission,
    isRedo: true,
    attemptNumber: nextAttempt,
  };
}

export async function saveDrawingReviewWithAction(
  submissionId: string,
  review: {
    tutor_rating?: number | null;
    tutor_feedback?: string | null;
    reviewed_image_url?: string | null;
    tutor_resources?: Array<{ type: string; url: string; title: string }>;
  },
  action: 'redo' | 'complete',
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const submissionStatus = action === 'redo' ? 'redo' : 'completed';

  const { data: submission, error } = await supabase
    .from('drawing_submissions')
    .update({
      tutor_rating: review.tutor_rating || null,
      tutor_feedback: review.tutor_feedback || null,
      reviewed_image_url: review.reviewed_image_url || null,
      tutor_resources: review.tutor_resources || [],
      status: submissionStatus,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw error;

  // Update thread status if question_id exists
  if (submission.question_id) {
    const threadUpdate: any = {
      status: action === 'redo' ? 'redo' : 'completed',
    };
    if (action === 'complete') {
      threadUpdate.completed_at = new Date().toISOString();
    }

    await supabase
      .from('drawing_thread_status')
      .update(threadUpdate)
      .eq('student_id', submission.student_id)
      .eq('question_id', submission.question_id);
  }

  return submission as DrawingSubmission;
}

// ============================================================
// Drawing Submission Comments
// ============================================================

export async function getDrawingSubmissionComments(
  submissionId: string,
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionCommentWithAuthor[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submission_comments')
    .select('*, author:users!drawing_submission_comments_author_id_fkey(id, name, avatar_url)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as unknown as DrawingSubmissionCommentWithAuthor[]) || [];
}

export async function addDrawingSubmissionComment(
  data: {
    submission_id: string;
    author_id: string;
    author_role: 'student' | 'teacher';
    comment_text: string;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionComment> {
  const supabase = client || getSupabaseAdminClient();

  const { data: comment, error } = await supabase
    .from('drawing_submission_comments')
    .insert(data)
    .select('*')
    .single();

  if (error) throw error;
  return comment as DrawingSubmissionComment;
}
