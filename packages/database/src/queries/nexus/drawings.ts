// @ts-nocheck — drawing tables not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  DrawingQuestion,
  DrawingQuestionEnriched,
  DrawingAttemptStatus,
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
    .from('drawing_questions' as any)
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('year', { ascending: false })
    .order('created_at', { ascending: true });

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

/**
 * Get distinct years that have active drawing questions.
 */
export async function getAvailableDrawingYears(
  client?: TypedSupabaseClient
): Promise<number[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_questions' as any)
    .select('year')
    .eq('is_active', true)
    .order('year', { ascending: false });

  if (error) throw error;
  const years = [...new Set((data || []).map((d: any) => d.year as number))];
  return years;
}

/**
 * Batch-fetch attempt statuses for a student across multiple questions.
 * Returns a map from question_id to attempt status.
 */
export async function getDrawingQuestionAttemptStatuses(
  studentId: string,
  questionIds: string[],
  client?: TypedSupabaseClient
): Promise<Record<string, DrawingAttemptStatus>> {
  if (questionIds.length === 0) return {};
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_thread_status' as any)
    .select('question_id, status')
    .eq('student_id', studentId)
    .in('question_id', questionIds);

  if (error) throw error;

  const statusMap: Record<string, DrawingAttemptStatus> = {};
  for (const qId of questionIds) {
    statusMap[qId] = 'not_attempted';
  }
  for (const row of (data || []) as Array<{ question_id: string; status: string }>) {
    if (row.status === 'completed') statusMap[row.question_id] = 'completed';
    else if (row.status === 'redo') statusMap[row.question_id] = 'redo';
    else statusMap[row.question_id] = 'in_progress';
  }
  return statusMap;
}

/**
 * Enrich drawing questions with QB data: repeat counts, solution URLs.
 * Fetches linked QB questions and their sources in two batch queries.
 */
export async function enrichDrawingQuestions(
  questions: DrawingQuestion[],
  studentId: string | null,
  client?: TypedSupabaseClient
): Promise<DrawingQuestionEnriched[]> {
  if (questions.length === 0) return [];
  const supabase = client || getSupabaseAdminClient();

  const qbIds = questions
    .map((q) => q.qb_question_id)
    .filter((id): id is string => id !== null);

  // Batch-fetch QB data for linked questions
  let qbMap: Record<string, { repeat_group_id: string | null; solution_image_url: string | null; solution_video_url: string | null }> = {};
  if (qbIds.length > 0) {
    const { data: qbData } = await supabase
      .from('nexus_qb_questions' as any)
      .select('id, repeat_group_id, solution_image_url, solution_video_url')
      .in('id', qbIds);

    for (const qb of (qbData || []) as any[]) {
      qbMap[qb.id] = {
        repeat_group_id: qb.repeat_group_id,
        solution_image_url: qb.solution_image_url,
        solution_video_url: qb.solution_video_url,
      };
    }
  }

  // Collect unique repeat_group_ids for repeat count queries
  const repeatGroupIds = [...new Set(
    Object.values(qbMap)
      .map((v) => v.repeat_group_id)
      .filter((id): id is string => id !== null)
  )];

  // Fetch repeat counts: for each repeat_group_id, get all source years
  let repeatMap: Record<string, number[]> = {};
  if (repeatGroupIds.length > 0) {
    // Get all question IDs in those repeat groups
    const { data: groupQuestions } = await supabase
      .from('nexus_qb_questions' as any)
      .select('id, repeat_group_id')
      .in('repeat_group_id', repeatGroupIds);

    const groupQIds = (groupQuestions || []).map((g: any) => g.id);
    if (groupQIds.length > 0) {
      const { data: sources } = await supabase
        .from('nexus_qb_question_sources' as any)
        .select('question_id, year')
        .in('question_id', groupQIds);

      // Build repeat_group_id -> years map
      const qIdToGroup: Record<string, string> = {};
      for (const g of (groupQuestions || []) as any[]) {
        qIdToGroup[g.id] = g.repeat_group_id;
      }
      const groupYears: Record<string, Set<number>> = {};
      for (const s of (sources || []) as any[]) {
        const gid = qIdToGroup[s.question_id];
        if (gid) {
          if (!groupYears[gid]) groupYears[gid] = new Set();
          groupYears[gid].add(s.year);
        }
      }
      for (const [gid, years] of Object.entries(groupYears)) {
        repeatMap[gid] = [...years].sort((a, b) => b - a);
      }
    }
  }

  // Also fetch source years for questions NOT in a repeat group (single appearances)
  const nonGroupQbIds = qbIds.filter((id) => !qbMap[id]?.repeat_group_id);
  if (nonGroupQbIds.length > 0) {
    const { data: singleSources } = await supabase
      .from('nexus_qb_question_sources' as any)
      .select('question_id, year')
      .in('question_id', nonGroupQbIds);

    for (const s of (singleSources || []) as any[]) {
      // Use question_id as key for non-grouped questions
      const key = `_single_${s.question_id}`;
      if (!repeatMap[key]) repeatMap[key] = [];
      if (!repeatMap[key].includes(s.year)) repeatMap[key].push(s.year);
    }
    // Sort each
    for (const key of Object.keys(repeatMap)) {
      if (key.startsWith('_single_')) {
        repeatMap[key].sort((a, b) => b - a);
      }
    }
  }

  // Fetch attempt statuses if student is provided
  let attemptMap: Record<string, DrawingAttemptStatus> = {};
  if (studentId) {
    const questionIds = questions.map((q) => q.id);
    attemptMap = await getDrawingQuestionAttemptStatuses(studentId, questionIds, supabase);
  }

  // Assemble enriched questions
  return questions.map((q): DrawingQuestionEnriched => {
    const qb = q.qb_question_id ? qbMap[q.qb_question_id] : null;
    let repeatYears: number[] = [];

    if (qb?.repeat_group_id && repeatMap[qb.repeat_group_id]) {
      repeatYears = repeatMap[qb.repeat_group_id];
    } else if (q.qb_question_id && repeatMap[`_single_${q.qb_question_id}`]) {
      repeatYears = repeatMap[`_single_${q.qb_question_id}`];
    }

    return {
      ...q,
      repeat_count: repeatYears.length,
      repeat_years: repeatYears,
      solution_image_url: qb?.solution_image_url || null,
      solution_video_url: qb?.solution_video_url || null,
      attempt_status: attemptMap[q.id] || 'not_attempted',
    };
  });
}

export async function getDrawingQuestionById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingQuestion | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_questions' as any)
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
    .from('drawing_questions' as any)
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
    .from('drawing_submissions' as any)
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
    .from('drawing_submissions' as any)
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
    .from('drawing_submissions' as any)
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
    status?: string | string[];
    category?: string;
    student_id?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithDetails[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions' as any)
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .order('submitted_at', { ascending: true });

  const status = filters?.status || 'submitted';
  if (Array.isArray(status)) {
    query = (query as any).in('status', status);
  } else {
    query = query.eq('status', status);
  }

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
        .from('drawing_thread_status' as any)
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
    .from('drawing_submissions' as any)
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
    .from('drawing_thread_status' as any)
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
    .from('drawing_questions' as any)
    .select('*')
    .eq('id', questionId)
    .single();

  if (!question) return null;

  // Get all attempts in this thread
  const { data: submissions, error: subError } = await supabase
    .from('drawing_submissions' as any)
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('thread_id', threadStatus.thread_id)
    .order('attempt_number', { ascending: true });

  if (subError) throw subError;

  // Get comments for all submissions in the thread
  const submissionIds = (submissions || []).map((s: any) => s.id);
  let allComments: any[] = [];
  if (submissionIds.length > 0) {
    const { data: comments } = await supabase
      .from('drawing_submission_comments' as any)
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
    await supabase.from('drawing_submissions' as any).update({ thread_id: submission.id, attempt_number: 1 }).eq('id', submission.id);
    return { submission: { ...submission, thread_id: submission.id, attempt_number: 1 }, isRedo: false, attemptNumber: 1 };
  }

  // Check if a thread exists for this student+question
  const { data: existingThread } = await supabase
    .from('drawing_thread_status' as any)
    .select('*')
    .eq('student_id', data.student_id)
    .eq('question_id', data.question_id)
    .single();

  if (!existingThread) {
    // First attempt — insert without thread_id (nullable), then set to self
    const { data: submission, error } = await supabase
      .from('drawing_submissions' as any)
      .insert({
        student_id: data.student_id,
        question_id: data.question_id,
        source_type: data.source_type,
        original_image_url: data.original_image_url,
        self_note: data.self_note || null,
        status: 'submitted',
        attempt_number: 1,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Set thread_id to self (self-referencing)
    await supabase.from('drawing_submissions' as any).update({ thread_id: submission.id }).eq('id', submission.id);

    // Create thread status
    await supabase.from('drawing_thread_status' as any).insert({
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
    .from('drawing_submissions' as any)
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
    .from('drawing_thread_status' as any)
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
    corrected_image_url?: string | null;
    ai_overlay_annotations?: Array<{ area: string; label: string; severity: string }> | null;
    tutor_resources?: Array<{ type: string; url: string; title: string }>;
  },
  action: 'redo' | 'complete',
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const submissionStatus = action === 'redo' ? 'redo' : 'completed';

  const { data: submission, error } = await supabase
    .from('drawing_submissions' as any)
    .update({
      tutor_rating: review.tutor_rating || null,
      tutor_feedback: review.tutor_feedback || null,
      reviewed_image_url: review.reviewed_image_url || null,
      corrected_image_url: review.corrected_image_url || null,
      ai_overlay_annotations: review.ai_overlay_annotations || null,
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
      .from('drawing_thread_status' as any)
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
    .from('drawing_submission_comments' as any)
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
    .from('drawing_submission_comments' as any)
    .insert(data)
    .select('*')
    .single();

  if (error) throw error;
  return comment as DrawingSubmissionComment;
}

// ============================================================
// Delete / Reset Thread
// ============================================================

/**
 * Delete an entire thread (all attempts, comments, thread status).
 * Student can only delete non-completed threads. Teacher can delete any.
 */
export async function deleteDrawingThread(
  studentId: string,
  questionId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Get thread
  const { data: thread } = await supabase
    .from('drawing_thread_status' as any)
    .select('thread_id')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .single();

  if (!thread) return;

  // Delete comments for all submissions in the thread
  const { data: subs } = await supabase
    .from('drawing_submissions' as any)
    .select('id')
    .eq('thread_id', thread.thread_id);

  if (subs && subs.length > 0) {
    const subIds = subs.map((s: any) => s.id);
    await supabase.from('drawing_submission_comments' as any).delete().in('submission_id', subIds);
  }

  // Delete thread status first (has FK to submissions)
  await supabase.from('drawing_thread_status' as any).delete()
    .eq('student_id', studentId)
    .eq('question_id', questionId);

  // Delete all submissions in the thread
  await supabase.from('drawing_submissions' as any).delete()
    .eq('thread_id', thread.thread_id);
}

/**
 * Replace the image on the latest pending submission (before teacher reviews it).
 */
export async function replaceSubmissionImage(
  submissionId: string,
  newImageUrl: string,
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions' as any)
    .update({ original_image_url: newImageUrl })
    .eq('id', submissionId)
    .eq('status', 'submitted') // only if still pending
    .select('*')
    .single();

  if (error) throw error;
  return data as DrawingSubmission;
}
