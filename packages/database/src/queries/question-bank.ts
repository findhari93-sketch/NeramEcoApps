// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Question Bank Queries (v2)
 *
 * Database queries for the NATA Question Sharing feature.
 * v2: Upvote/downvote, suggested improvements, confidence level, admin badges.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  QuestionPost,
  QuestionPostDisplay,
  QuestionComment,
  QuestionCommentDisplay,
  QuestionImprovement,
  QuestionImprovementDisplay,
  CreateQuestionPostInput,
  CreateQuestionCommentInput,
  CreateImprovementInput,
  NataQuestionCategory,
  QuestionPostStatus,
  QuestionSession,
  QuestionSessionDisplay,
  CreateQuestionSessionInput,
  VoteType,
  QuestionChangeRequest,
  QuestionChangeRequestDisplay,
  QuestionChangeRequestStatus,
  QuestionChangeRequestType,
} from '../types';

// ============================================
// PUBLIC QUERIES (approved questions)
// ============================================

/**
 * Get approved questions with pagination and filters.
 * Joins author info (including user_type for admin badge).
 */
export async function getApprovedQuestions(
  options: {
    examType?: string;
    category?: NataQuestionCategory;
    page?: number;
    limit?: number;
    sortBy?: 'newest' | 'most_voted';
    userId?: string;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: QuestionPostDisplay[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const page = options.page || 1;
  const limit = options.limit || 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('question_posts')
    .select('*, users!question_posts_user_id_fkey(id, name, avatar_url, user_type)', { count: 'exact' })
    .eq('status', 'approved');

  if (options.examType) {
    query = query.eq('exam_type', options.examType);
  }

  if (options.category) {
    query = query.eq('category', options.category);
  }

  if (options.sortBy === 'most_voted') {
    query = query.order('vote_score', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching approved questions:', error);
    return { data: [], count: 0 };
  }

  // Check user's votes on each question
  let userVotes = new Map<string, VoteType>();
  if (options.userId && data?.length) {
    const questionIds = data.map((q: Record<string, unknown>) => q.id);
    const { data: votes } = await supabase
      .from('question_votes')
      .select('question_id, vote')
      .eq('user_id', options.userId)
      .in('question_id', questionIds);

    if (votes) {
      for (const v of votes) {
        userVotes.set(v.question_id as string, v.vote as VoteType);
      }
    }
  }

  const questions: QuestionPostDisplay[] = (data || []).map((q: Record<string, unknown>) => ({
    ...q,
    author: q.users || { id: q.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    user_vote: userVotes.get(q.id as string) || null,
  })) as QuestionPostDisplay[];

  return { data: questions, count: count || 0 };
}

/**
 * Get a single question by ID with author info.
 * Includes user_type for admin badge and best_improvement.
 */
export async function getQuestionById(
  id: string,
  userId?: string,
  client?: TypedSupabaseClient
): Promise<QuestionPostDisplay | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_posts')
    .select('*, users!question_posts_user_id_fkey(id, name, avatar_url, user_type)')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching question:', error);
    return null;
  }

  let userVote: VoteType | null = null;
  if (userId) {
    const { data: vote } = await supabase
      .from('question_votes')
      .select('vote')
      .eq('question_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    userVote = vote?.vote as VoteType || null;
  }

  // Get best improvement (highest voted, approved, or accepted)
  let bestImprovement: QuestionImprovementDisplay | null = null;
  const { data: improvements } = await supabase
    .from('question_improvements')
    .select('*, users!question_improvements_user_id_fkey(id, name, avatar_url, user_type)')
    .eq('question_id', id)
    .eq('status', 'approved')
    .order('is_accepted', { ascending: false })
    .order('vote_score', { ascending: false })
    .limit(1);

  if (improvements?.length) {
    const imp = improvements[0] as Record<string, unknown>;
    let impUserVote: VoteType | null = null;
    if (userId) {
      const { data: impVote } = await supabase
        .from('improvement_votes')
        .select('vote')
        .eq('improvement_id', imp.id)
        .eq('user_id', userId)
        .maybeSingle();
      impUserVote = impVote?.vote as VoteType || null;
    }
    bestImprovement = {
      ...imp,
      author: imp.users || { id: imp.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
      user_vote: impUserVote,
    } as QuestionImprovementDisplay;
  }

  return {
    ...data,
    author: (data as Record<string, unknown>).users || { id: data.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    user_vote: userVote,
    best_improvement: bestImprovement,
  } as QuestionPostDisplay;
}

/**
 * Create a new question post.
 * Admin posts are auto-approved with is_admin_post=true.
 */
export async function createQuestionPost(
  userId: string,
  input: CreateQuestionPostInput,
  isAdmin: boolean = false,
  client?: TypedSupabaseClient
): Promise<QuestionPost> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('question_posts')
    .insert({
      user_id: userId,
      title: input.title,
      body: input.body,
      category: input.category,
      exam_type: input.exam_type || 'NATA',
      exam_year: input.exam_year ?? null,
      exam_month: input.exam_month ?? null,
      exam_session: input.exam_session || null,
      image_urls: input.image_urls || [],
      tags: input.tags || [],
      confidence_level: input.confidence_level || 3,
      status: isAdmin ? 'approved' : 'pending',
      is_admin_post: isAdmin,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create question: ${error.message}`);
  }
  return data as QuestionPost;
}

/**
 * Get a user's own questions (all statuses).
 */
export async function getUserQuestions(
  userId: string,
  client?: TypedSupabaseClient
): Promise<QuestionPost[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user questions:', error);
    return [];
  }

  return (data || []) as QuestionPost[];
}

// ============================================
// VOTE QUERIES (replaces like queries)
// ============================================

/**
 * Vote on a question (up/down). Toggle behavior:
 * - Same vote as existing → remove vote
 * - Different vote → change vote direction
 * - No existing vote → insert new vote
 */
export async function voteOnQuestion(
  questionId: string,
  userId: string,
  vote: VoteType,
  client?: TypedSupabaseClient
): Promise<{ vote: VoteType | null; voteScore: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('question_votes')
    .select('id, vote')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.vote === vote) {
      // Same vote → remove it
      await supabase.from('question_votes').delete().eq('id', existing.id);
    } else {
      // Different vote → update direction
      await (supabase as any).from('question_votes').update({ vote }).eq('id', existing.id);
    }
  } else {
    // No existing vote → insert
    await (supabase as any).from('question_votes').insert({
      question_id: questionId,
      user_id: userId,
      vote,
    });
  }

  // Get updated score
  const { data: question } = await supabase
    .from('question_posts')
    .select('vote_score')
    .eq('id', questionId)
    .single();

  const newVote = existing?.vote === vote ? null : vote;
  return {
    vote: newVote,
    voteScore: (question as Record<string, unknown>)?.vote_score as number || 0,
  };
}

/**
 * Vote on a comment (up/down). Same toggle behavior as question votes.
 */
export async function voteOnComment(
  commentId: string,
  userId: string,
  vote: VoteType,
  client?: TypedSupabaseClient
): Promise<{ vote: VoteType | null; voteScore: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('comment_votes')
    .select('id, vote')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.vote === vote) {
      await supabase.from('comment_votes').delete().eq('id', existing.id);
    } else {
      await (supabase as any).from('comment_votes').update({ vote }).eq('id', existing.id);
    }
  } else {
    await (supabase as any).from('comment_votes').insert({
      comment_id: commentId,
      user_id: userId,
      vote,
    });
  }

  const { data: comment } = await supabase
    .from('question_comments')
    .select('vote_score')
    .eq('id', commentId)
    .single();

  const newVote = existing?.vote === vote ? null : vote;
  return {
    vote: newVote,
    voteScore: (comment as Record<string, unknown>)?.vote_score as number || 0,
  };
}

// ============================================
// IMPROVEMENT QUERIES
// ============================================

/**
 * Get improvements for a question (approved ones, sorted by vote_score).
 */
export async function getImprovements(
  questionId: string,
  userId?: string,
  client?: TypedSupabaseClient
): Promise<QuestionImprovementDisplay[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_improvements')
    .select('*, users!question_improvements_user_id_fkey(id, name, avatar_url, user_type)')
    .eq('question_id', questionId)
    .eq('status', 'approved')
    .order('is_accepted', { ascending: false })
    .order('vote_score', { ascending: false });

  if (error) {
    console.error('Error fetching improvements:', error);
    return [];
  }

  // Check user votes
  let userVotes = new Map<string, VoteType>();
  if (userId && data?.length) {
    const impIds = data.map((i: Record<string, unknown>) => i.id);
    const { data: votes } = await supabase
      .from('improvement_votes')
      .select('improvement_id, vote')
      .eq('user_id', userId)
      .in('improvement_id', impIds);

    if (votes) {
      for (const v of votes) {
        userVotes.set(v.improvement_id as string, v.vote as VoteType);
      }
    }
  }

  return (data || []).map((imp: Record<string, unknown>) => ({
    ...imp,
    author: imp.users || { id: imp.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    user_vote: userVotes.get(imp.id as string) || null,
  })) as QuestionImprovementDisplay[];
}

/**
 * Create an improvement suggestion (status=pending, goes through moderation).
 */
export async function createImprovement(
  userId: string,
  input: CreateImprovementInput,
  client?: TypedSupabaseClient
): Promise<QuestionImprovement> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('question_improvements')
    .insert({
      question_id: input.question_id,
      user_id: userId,
      body: input.body,
      image_urls: input.image_urls || [],
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create improvement: ${error.message}`);
  }
  return data as QuestionImprovement;
}

/**
 * Vote on an improvement (up/down). Same toggle behavior.
 */
export async function voteOnImprovement(
  improvementId: string,
  userId: string,
  vote: VoteType,
  client?: TypedSupabaseClient
): Promise<{ vote: VoteType | null; voteScore: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('improvement_votes')
    .select('id, vote')
    .eq('improvement_id', improvementId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.vote === vote) {
      await supabase.from('improvement_votes').delete().eq('id', existing.id);
    } else {
      await (supabase as any).from('improvement_votes').update({ vote }).eq('id', existing.id);
    }
  } else {
    await (supabase as any).from('improvement_votes').insert({
      improvement_id: improvementId,
      user_id: userId,
      vote,
    });
  }

  const { data: imp } = await supabase
    .from('question_improvements')
    .select('vote_score')
    .eq('id', improvementId)
    .single();

  const newVote = existing?.vote === vote ? null : vote;
  return {
    vote: newVote,
    voteScore: (imp as Record<string, unknown>)?.vote_score as number || 0,
  };
}

// ============================================
// COMMENT QUERIES
// ============================================

/**
 * Get comments for a question, threaded (top-level + replies).
 * Uses vote system instead of likes.
 */
export async function getQuestionComments(
  questionId: string,
  userId?: string,
  client?: TypedSupabaseClient
): Promise<QuestionCommentDisplay[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_comments')
    .select('*, users!question_comments_user_id_fkey(id, name, avatar_url, user_type)')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching comments:', error);
    return [];
  }

  // Check user votes
  let userVotes = new Map<string, VoteType>();
  if (userId && data?.length) {
    const commentIds = data.map((c: Record<string, unknown>) => c.id);
    const { data: votes } = await supabase
      .from('comment_votes')
      .select('comment_id, vote')
      .eq('user_id', userId)
      .in('comment_id', commentIds);

    if (votes) {
      for (const v of votes) {
        userVotes.set(v.comment_id as string, v.vote as VoteType);
      }
    }
  }

  // Build threaded structure
  const commentMap = new Map<string, QuestionCommentDisplay>();
  const topLevel: QuestionCommentDisplay[] = [];

  for (const c of (data || [])) {
    const comment: QuestionCommentDisplay = {
      ...(c as Record<string, unknown>),
      author: (c as Record<string, unknown>).users || { id: c.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
      user_vote: userVotes.get(c.id as string) || null,
      replies: [],
    } as QuestionCommentDisplay;

    commentMap.set(c.id as string, comment);

    if (!c.parent_id) {
      topLevel.push(comment);
    }
  }

  // Attach replies to parents (max 2 levels)
  for (const c of (data || [])) {
    if (c.parent_id) {
      const parent = commentMap.get(c.parent_id as string);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(commentMap.get(c.id as string)!);
      } else {
        topLevel.push(commentMap.get(c.id as string)!);
      }
    }
  }

  return topLevel;
}

/**
 * Create a comment on a question.
 */
export async function createComment(
  userId: string,
  input: CreateQuestionCommentInput,
  client?: TypedSupabaseClient
): Promise<QuestionComment> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('question_comments')
    .insert({
      question_id: input.question_id,
      user_id: userId,
      body: input.body,
      parent_id: input.parent_id || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create comment: ${error.message}`);
  }
  return data as QuestionComment;
}

// ============================================
// ADMIN MODERATION QUERIES
// ============================================

/**
 * Get questions by status (for admin moderation).
 */
export async function getQuestionsByStatus(
  status: QuestionPostStatus,
  page: number = 1,
  limit: number = 25,
  client?: TypedSupabaseClient
): Promise<{ data: QuestionPostDisplay[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const supabase = client || getSupabaseAdminClient();
  const offset = (page - 1) * limit;

  let query = supabase
    .from('question_posts')
    .select('*, users!question_posts_user_id_fkey(id, name, avatar_url, user_type)', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching questions by status:', error);
    return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  const total = count || 0;
  return {
    data: (data || []).map((q: Record<string, unknown>) => ({
      ...q,
      author: q.users || { id: q.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    })) as QuestionPostDisplay[],
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Approve a question.
 */
export async function approveQuestion(
  questionId: string,
  adminId?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('question_posts')
    .update({
      status: 'approved',
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', questionId);

  if (error) {
    throw new Error(`Failed to approve question: ${error.message}`);
  }
}

/**
 * Admin edit a question's fields.
 */
export async function adminEditQuestion(
  questionId: string,
  fields: {
    title?: string;
    body?: string;
    category?: NataQuestionCategory;
    exam_year?: number | null;
    exam_month?: number | null;
    exam_session?: string | null;
    confidence_level?: number;
    tags?: string[];
  },
  client?: TypedSupabaseClient
): Promise<QuestionPost> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.title !== undefined) updateData.title = fields.title;
  if (fields.body !== undefined) updateData.body = fields.body;
  if (fields.category !== undefined) updateData.category = fields.category;
  if (fields.exam_year !== undefined) updateData.exam_year = fields.exam_year;
  if (fields.exam_month !== undefined) updateData.exam_month = fields.exam_month;
  if (fields.exam_session !== undefined) updateData.exam_session = fields.exam_session;
  if (fields.confidence_level !== undefined) updateData.confidence_level = fields.confidence_level;
  if (fields.tags !== undefined) updateData.tags = fields.tags;

  const { data, error } = await (supabase as any)
    .from('question_posts')
    .update(updateData)
    .eq('id', questionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update question: ${error.message}`);
  return data as QuestionPost;
}

/**
 * Reject a question with reason.
 */
export async function rejectQuestion(
  questionId: string,
  reason: string,
  adminId?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('question_posts')
    .update({
      status: 'rejected',
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', questionId);

  if (error) {
    throw new Error(`Failed to reject question: ${error.message}`);
  }
}

/**
 * Get moderation stats (counts by status).
 */
export async function getQuestionModerationStats(
  client?: TypedSupabaseClient
): Promise<{ pending: number; approved: number; rejected: number }> {
  const supabase = client || getSupabaseAdminClient();

  const [pending, approved, rejected] = await Promise.all([
    supabase.from('question_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('question_posts').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('question_posts').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);

  return {
    pending: pending.count || 0,
    approved: approved.count || 0,
    rejected: rejected.count || 0,
  };
}

/**
 * Get improvements by status (for admin moderation).
 */
export async function getImprovementsByStatus(
  status: QuestionPostStatus,
  page: number = 1,
  limit: number = 25,
  client?: TypedSupabaseClient
): Promise<{ data: QuestionImprovementDisplay[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const supabase = client || getSupabaseAdminClient();
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('question_improvements')
    .select('*, users!question_improvements_user_id_fkey(id, name, avatar_url, user_type), question_posts!question_improvements_question_id_fkey(title)', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching improvements by status:', error);
    return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  const total = count || 0;
  return {
    data: (data || []).map((imp: Record<string, unknown>) => ({
      ...imp,
      author: imp.users || { id: imp.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    })) as QuestionImprovementDisplay[],
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Approve an improvement.
 */
export async function approveImprovement(
  improvementId: string,
  adminId?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('question_improvements')
    .update({
      status: 'approved',
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', improvementId);

  if (error) {
    throw new Error(`Failed to approve improvement: ${error.message}`);
  }
}

/**
 * Reject an improvement with reason.
 */
export async function rejectImprovement(
  improvementId: string,
  reason: string,
  adminId?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('question_improvements')
    .update({
      status: 'rejected',
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', improvementId);

  if (error) {
    throw new Error(`Failed to reject improvement: ${error.message}`);
  }
}

/**
 * Accept an improvement as the "best version".
 */
export async function acceptImprovement(
  improvementId: string,
  questionId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Unset any previously accepted improvement for this question
  await (supabase as any)
    .from('question_improvements')
    .update({ is_accepted: false })
    .eq('question_id', questionId)
    .eq('is_accepted', true);

  // Set the new one as accepted
  const { error } = await (supabase as any)
    .from('question_improvements')
    .update({ is_accepted: true })
    .eq('id', improvementId);

  if (error) {
    throw new Error(`Failed to accept improvement: ${error.message}`);
  }
}

// ============================================
// SESSION TRACKING QUERIES
// ============================================

/**
 * Get sessions for a question (who else got this question).
 */
export async function getQuestionSessions(
  questionId: string,
  client?: TypedSupabaseClient
): Promise<QuestionSessionDisplay[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_sessions')
    .select('*, users!question_sessions_user_id_fkey(id, name, avatar_url)')
    .eq('question_id', questionId)
    .order('exam_year', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  return (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    author: s.users || { id: s.user_id, name: 'Unknown', avatar_url: null },
  })) as QuestionSessionDisplay[];
}

/**
 * Report "I got this question too" with session details.
 */
export async function createQuestionSession(
  userId: string,
  input: CreateQuestionSessionInput,
  client?: TypedSupabaseClient
): Promise<QuestionSession> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('question_sessions')
    .insert({
      question_id: input.question_id,
      user_id: userId,
      exam_year: input.exam_year,
      exam_date: input.exam_date || null,
      session_label: input.session_label || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('You have already reported this session');
    }
    throw new Error(`Failed to create session: ${error.message}`);
  }
  return data as QuestionSession;
}

/**
 * Delete a session report (user can undo their report).
 */
export async function deleteQuestionSession(
  sessionId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('question_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

// ============================================
// QUESTION CHANGE REQUESTS (migration 20260307)
// ============================================

/**
 * Create an edit request for a question (user must be the author).
 * Fails if there's already a pending request for this question.
 */
export async function createEditRequest(
  userId: string,
  questionId: string,
  input: {
    proposed_title: string;
    proposed_body: string;
    proposed_category?: NataQuestionCategory;
    proposed_image_urls?: string[];
    proposed_tags?: string[];
  },
  client?: TypedSupabaseClient
): Promise<QuestionChangeRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Verify user owns the question
  const { data: question, error: qErr } = await supabase
    .from('question_posts')
    .select('id, user_id')
    .eq('id', questionId)
    .single();

  if (qErr || !question) throw new Error('Question not found');
  if (question.user_id !== userId) throw new Error('You can only edit your own questions');

  // Check for existing pending request
  const { data: existing } = await supabase
    .from('question_change_requests')
    .select('id')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error('You already have a pending change request for this question');
  }

  const { data, error } = await (supabase as any)
    .from('question_change_requests')
    .insert({
      question_id: questionId,
      user_id: userId,
      request_type: 'edit',
      proposed_title: input.proposed_title,
      proposed_body: input.proposed_body,
      proposed_category: input.proposed_category || null,
      proposed_image_urls: input.proposed_image_urls || [],
      proposed_tags: input.proposed_tags || [],
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create edit request: ${error.message}`);
  return data as QuestionChangeRequest;
}

/**
 * Create a delete request for a question (user must be the author).
 */
export async function createDeleteRequest(
  userId: string,
  questionId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<QuestionChangeRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Verify user owns the question
  const { data: question, error: qErr } = await supabase
    .from('question_posts')
    .select('id, user_id')
    .eq('id', questionId)
    .single();

  if (qErr || !question) throw new Error('Question not found');
  if (question.user_id !== userId) throw new Error('You can only delete your own questions');

  // Check for existing pending request
  const { data: existing } = await supabase
    .from('question_change_requests')
    .select('id')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error('You already have a pending change request for this question');
  }

  const { data, error } = await (supabase as any)
    .from('question_change_requests')
    .insert({
      question_id: questionId,
      user_id: userId,
      request_type: 'delete',
      reason,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create delete request: ${error.message}`);
  return data as QuestionChangeRequest;
}

/**
 * Get user's pending change requests for a specific question (or all questions).
 */
export async function getUserPendingRequests(
  userId: string,
  questionId?: string,
  client?: TypedSupabaseClient
): Promise<QuestionChangeRequest[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('question_change_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (questionId) {
    query = query.eq('question_id', questionId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching user pending requests:', error);
    return [];
  }
  return (data || []) as QuestionChangeRequest[];
}

/**
 * Get all user's change requests (any status) for "My Questions" page.
 */
export async function getUserChangeRequests(
  userId: string,
  client?: TypedSupabaseClient
): Promise<QuestionChangeRequest[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_change_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user change requests:', error);
    return [];
  }
  return (data || []) as QuestionChangeRequest[];
}

/**
 * Get change requests by status (admin moderation).
 */
export async function getChangeRequestsByStatus(
  status: QuestionChangeRequestStatus,
  requestType?: QuestionChangeRequestType,
  page: number = 1,
  limit: number = 25,
  client?: TypedSupabaseClient
): Promise<{ data: QuestionChangeRequestDisplay[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const supabase = client || getSupabaseAdminClient();
  const offset = (page - 1) * limit;

  let query = supabase
    .from('question_change_requests')
    .select(
      '*, users!question_change_requests_user_id_fkey(id, name, avatar_url, user_type), question_posts!question_change_requests_question_id_fkey(id, title, body, category, status)',
      { count: 'exact' }
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (requestType) {
    query = query.eq('request_type', requestType);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching change requests by status:', error);
    return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  const total = count || 0;
  return {
    data: (data || []).map((cr: Record<string, unknown>) => ({
      ...cr,
      author: cr.users || { id: cr.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
      question: cr.question_posts || { id: cr.question_id, title: 'Unknown', body: '', category: 'other', status: 'pending' },
    })) as QuestionChangeRequestDisplay[],
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Approve an edit request - applies the proposed changes to the question.
 */
export async function approveEditRequest(
  requestId: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Get the change request
  const { data: cr, error: crErr } = await supabase
    .from('question_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('request_type', 'edit')
    .eq('status', 'pending')
    .single();

  if (crErr || !cr) throw new Error('Edit request not found or already processed');

  // Update the request status
  const { error: updateErr } = await (supabase as any)
    .from('question_change_requests')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateErr) throw new Error(`Failed to approve edit request: ${updateErr.message}`);

  // Apply the edit to the question
  const updateData: Record<string, unknown> = {};
  if (cr.proposed_title) updateData.title = cr.proposed_title;
  if (cr.proposed_body) updateData.body = cr.proposed_body;
  if (cr.proposed_category) updateData.category = cr.proposed_category;
  if (cr.proposed_image_urls && cr.proposed_image_urls.length > 0) updateData.image_urls = cr.proposed_image_urls;
  if (cr.proposed_tags && cr.proposed_tags.length > 0) updateData.tags = cr.proposed_tags;

  if (Object.keys(updateData).length > 0) {
    const { error: qErr } = await (supabase as any)
      .from('question_posts')
      .update(updateData)
      .eq('id', cr.question_id);

    if (qErr) throw new Error(`Failed to apply edit to question: ${qErr.message}`);
  }
}

/**
 * Approve a delete request - sets question status to 'flagged' (soft delete).
 */
export async function approveDeleteRequest(
  requestId: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Get the change request
  const { data: cr, error: crErr } = await supabase
    .from('question_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('request_type', 'delete')
    .eq('status', 'pending')
    .single();

  if (crErr || !cr) throw new Error('Delete request not found or already processed');

  // Update the request status
  const { error: updateErr } = await (supabase as any)
    .from('question_change_requests')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateErr) throw new Error(`Failed to approve delete request: ${updateErr.message}`);

  // Soft-delete the question by setting status to 'flagged'
  const { error: qErr } = await (supabase as any)
    .from('question_posts')
    .update({ status: 'flagged' })
    .eq('id', cr.question_id);

  if (qErr) throw new Error(`Failed to delete question: ${qErr.message}`);
}

/**
 * Reject a change request with reason.
 */
export async function rejectChangeRequest(
  requestId: string,
  reason: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('question_change_requests')
    .update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to reject change request: ${error.message}`);
}

/**
 * Get change request moderation stats.
 */
export async function getChangeRequestStats(
  client?: TypedSupabaseClient
): Promise<{ pending_edits: number; pending_deletes: number; total_pending: number }> {
  const supabase = client || getSupabaseAdminClient();

  const [edits, deletes] = await Promise.all([
    supabase.from('question_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('request_type', 'edit'),
    supabase.from('question_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('request_type', 'delete'),
  ]);

  const pending_edits = edits.count || 0;
  const pending_deletes = deletes.count || 0;
  return { pending_edits, pending_deletes, total_pending: pending_edits + pending_deletes };
}

/**
 * Get full change history for a question (admin audit trail).
 */
export async function getQuestionChangeHistory(
  questionId: string,
  client?: TypedSupabaseClient
): Promise<QuestionChangeRequestDisplay[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('question_change_requests')
    .select(
      '*, users!question_change_requests_user_id_fkey(id, name, avatar_url, user_type), question_posts!question_change_requests_question_id_fkey(id, title, body, category, status)'
    )
    .eq('question_id', questionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching question change history:', error);
    return [];
  }

  return (data || []).map((cr: Record<string, unknown>) => ({
    ...cr,
    author: cr.users || { id: cr.user_id, name: 'Unknown', avatar_url: null, user_type: 'student' },
    question: cr.question_posts || { id: cr.question_id, title: 'Unknown', body: '', category: 'other', status: 'pending' },
  })) as QuestionChangeRequestDisplay[];
}

// ============================================
// DEPRECATED (kept for backward compat)
// ============================================

/** @deprecated Use voteOnQuestion instead */
export async function toggleQuestionLike(
  questionId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<{ liked: boolean; likeCount: number }> {
  const result = await voteOnQuestion(questionId, userId, 'up', client);
  return { liked: result.vote === 'up', likeCount: result.voteScore };
}

/** @deprecated Use voteOnComment instead */
export async function toggleCommentLike(
  commentId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<{ liked: boolean; likeCount: number }> {
  const result = await voteOnComment(commentId, userId, 'up', client);
  return { liked: result.vote === 'up', likeCount: result.voteScore };
}
