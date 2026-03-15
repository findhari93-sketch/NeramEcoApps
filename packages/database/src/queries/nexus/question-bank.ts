import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBAttemptMode,
  QBFilterState,
  QBProgressStats,
  QBAttemptSummary,
  NexusQBTopic,
  NexusQBQuestion,
  NexusQBQuestionSource,
  NexusQBStudentAttempt,
  NexusQBStudyMark,
  NexusQBSavedPreset,
  NexusQBClassroomLink,
  NexusQBQuestionListItem,
  NexusQBQuestionDetail,
  NexusQBQuestionInsert,
  NexusQBQuestionUpdate,
  NexusQBQuestionSourceInsert,
} from '../../types';

// ============================================
// TOPIC QUERIES
// ============================================

/**
 * Fetch all active topics and build a nested tree (parent → children).
 */
export async function getQBTopicTree(
  client?: TypedSupabaseClient
): Promise<NexusQBTopic[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_topics')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const topics = (data || []) as NexusQBTopic[];

  // Build tree: group children under parents
  const topicMap = new Map<string, NexusQBTopic>();
  const roots: NexusQBTopic[] = [];

  for (const topic of topics) {
    topicMap.set(topic.id, { ...topic, children: [] });
  }

  for (const topic of topics) {
    const node = topicMap.get(topic.id)!;
    if (topic.parent_id && topicMap.has(topic.parent_id)) {
      topicMap.get(topic.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ============================================
// QUESTION LIST QUERIES
// ============================================

/**
 * Main filtered question list with pagination.
 * Applies all filters from QBFilterState, enriches with sources/topic,
 * and optionally computes attempt_summary per question for a student.
 */
export async function getQBQuestions(
  filters: QBFilterState,
  page: number,
  pageSize: number,
  studentId?: string,
  client?: TypedSupabaseClient
): Promise<{ questions: NexusQBQuestionListItem[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const offset = (page - 1) * pageSize;

  // --- Build the base query ---
  let query = supabase
    .from('nexus_qb_questions')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  // Apply filters
  if (filters.exam_relevance) {
    query = query.eq('exam_relevance', filters.exam_relevance);
  }
  if (filters.categories && filters.categories.length > 0) {
    query = query.overlaps('categories', filters.categories);
  }
  if (filters.difficulty && filters.difficulty.length > 0) {
    query = query.in('difficulty', filters.difficulty);
  }
  if (filters.question_format && filters.question_format.length > 0) {
    query = query.in('question_format', filters.question_format);
  }
  if (filters.topic_ids && filters.topic_ids.length > 0) {
    query = query.in('topic_id', filters.topic_ids);
  }
  if (filters.search_text) {
    query = query.ilike('question_text', `%${filters.search_text}%`);
  }

  // For exam_years filter, we need to get question IDs from sources first
  let yearFilteredIds: string[] | null = null;
  if (filters.exam_years && filters.exam_years.length > 0) {
    let sourceQuery = supabase
      .from('nexus_qb_question_sources')
      .select('question_id')
      .in('year', filters.exam_years);

    if (filters.exam_sessions && filters.exam_sessions.length > 0) {
      sourceQuery = sourceQuery.in('session', filters.exam_sessions);
    }

    const { data: sourceData, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;

    yearFilteredIds = [...new Set((sourceData || []).map((s: any) => s.question_id))];

    if (yearFilteredIds.length === 0) {
      return { questions: [], total: 0 };
    }
    query = query.in('id', yearFilteredIds);
  }

  // Order and paginate
  query = query
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  const { data: questionsRaw, error: questionsError, count } = await query;
  if (questionsError) throw questionsError;

  const questions = (questionsRaw || []) as NexusQBQuestion[];
  if (questions.length === 0) {
    return { questions: [], total: count || 0 };
  }

  const questionIds = questions.map(q => q.id);

  // --- Fetch sources for all questions ---
  const { data: sourcesRaw, error: sourcesError } = await supabase
    .from('nexus_qb_question_sources')
    .select('*')
    .in('question_id', questionIds);
  if (sourcesError) throw sourcesError;

  const sourcesMap = new Map<string, NexusQBQuestionSource[]>();
  for (const s of (sourcesRaw || []) as NexusQBQuestionSource[]) {
    if (!sourcesMap.has(s.question_id)) {
      sourcesMap.set(s.question_id, []);
    }
    sourcesMap.get(s.question_id)!.push(s);
  }

  // --- Fetch topics ---
  const topicIds = [...new Set(questions.map(q => q.topic_id).filter(Boolean))] as string[];
  let topicMap = new Map<string, NexusQBTopic>();

  if (topicIds.length > 0) {
    const { data: topicsRaw, error: topicsError } = await supabase
      .from('nexus_qb_topics')
      .select('*')
      .in('id', topicIds);
    if (topicsError) throw topicsError;

    for (const t of (topicsRaw || []) as NexusQBTopic[]) {
      topicMap.set(t.id, t);
    }
  }

  // --- Fetch attempt data if studentId provided ---
  let attemptMap = new Map<string, QBAttemptSummary>();

  if (studentId) {
    const { data: attemptsRaw, error: attemptsError } = await supabase
      .from('nexus_qb_student_attempts')
      .select('question_id, is_correct, created_at')
      .eq('student_id', studentId)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false });
    if (attemptsError) throw attemptsError;

    // Group attempts by question, compute summary
    const attemptsByQ = new Map<string, any[]>();
    for (const a of (attemptsRaw || []) as any[]) {
      if (!attemptsByQ.has(a.question_id)) {
        attemptsByQ.set(a.question_id, []);
      }
      attemptsByQ.get(a.question_id)!.push(a);
    }

    for (const [qId, attempts] of attemptsByQ) {
      const latest = attempts[0]; // already sorted desc
      attemptMap.set(qId, {
        total_attempts: attempts.length,
        last_attempt_at: latest.created_at,
        last_was_correct: latest.is_correct,
        best_result: attempts.some((a: any) => a.is_correct),
      });
    }
  }

  // --- Assemble list items ---
  let result: NexusQBQuestionListItem[] = questions.map(q => ({
    ...q,
    sources: sourcesMap.get(q.id) || [],
    topic: q.topic_id ? topicMap.get(q.topic_id) || null : null,
    attempt_summary: attemptMap.get(q.id) || null,
  }));

  // --- Post-filter by attempt_status ---
  let total = count || 0;

  if (studentId && filters.attempt_status && filters.attempt_status !== 'all') {
    const beforeCount = result.length;
    switch (filters.attempt_status) {
      case 'unattempted':
        result = result.filter(q => !q.attempt_summary);
        break;
      case 'correct':
        result = result.filter(q => q.attempt_summary?.best_result === true);
        break;
      case 'incorrect':
        result = result.filter(
          q => q.attempt_summary && q.attempt_summary.best_result === false
        );
        break;
    }
    // Adjust total estimate (approximation since we can't know server-side count)
    const filterRatio = beforeCount > 0 ? result.length / beforeCount : 0;
    total = Math.round(total * filterRatio);
  }

  return { questions: result, total };
}

// ============================================
// QUESTION DETAIL
// ============================================

/**
 * Fetch a single question with all enrichment data.
 */
export async function getQBQuestionDetail(
  questionId: string,
  studentId?: string,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestionDetail | null> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch question
  const { data: question, error: questionError } = await supabase
    .from('nexus_qb_questions')
    .select('*')
    .eq('id', questionId)
    .single();
  if (questionError) {
    if (questionError.code === 'PGRST116') return null;
    throw questionError;
  }

  const q = question as NexusQBQuestion;

  // Fetch sources
  const { data: sourcesRaw, error: sourcesError } = await supabase
    .from('nexus_qb_question_sources')
    .select('*')
    .eq('question_id', questionId)
    .order('year', { ascending: true });
  if (sourcesError) throw sourcesError;

  const sources = (sourcesRaw || []) as NexusQBQuestionSource[];

  // Fetch topic
  let topic: NexusQBTopic | null = null;
  if (q.topic_id) {
    const { data: topicData } = await supabase
      .from('nexus_qb_topics')
      .select('*')
      .eq('id', q.topic_id)
      .single();
    topic = topicData as NexusQBTopic | null;
  }

  // Fetch repeat_sources (other questions in same repeat group)
  let repeatSources: NexusQBQuestionSource[] = [];
  if (q.repeat_group_id) {
    // Get all question IDs in the same repeat group (excluding current)
    const { data: repeatQuestions } = await supabase
      .from('nexus_qb_questions')
      .select('id')
      .eq('repeat_group_id', q.repeat_group_id)
      .neq('id', questionId)
      .eq('is_active', true);

    const repeatQIds = (repeatQuestions || []).map((r: any) => r.id);
    if (repeatQIds.length > 0) {
      const { data: repeatSourcesRaw } = await supabase
        .from('nexus_qb_question_sources')
        .select('*')
        .in('question_id', repeatQIds)
        .order('year', { ascending: true });
      repeatSources = (repeatSourcesRaw || []) as NexusQBQuestionSource[];
    }
  }

  // Fetch student-specific data
  let attempts: NexusQBStudentAttempt[] = [];
  let isStudied = false;

  if (studentId) {
    const { data: attemptsRaw } = await supabase
      .from('nexus_qb_student_attempts')
      .select('*')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false });
    attempts = (attemptsRaw || []) as NexusQBStudentAttempt[];

    const { data: studyMark } = await supabase
      .from('nexus_qb_study_marks')
      .select('id')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
      .maybeSingle();
    isStudied = !!studyMark;
  }

  return {
    ...q,
    sources,
    topic,
    attempts,
    repeat_sources: repeatSources,
    is_studied: isStudied,
  };
}

// ============================================
// ATTEMPT SUBMISSION
// ============================================

/**
 * Pure function: check if a student's answer is correct.
 */
export function checkQBAnswer(
  format: QBQuestionFormat,
  studentAnswer: string,
  correctAnswer: string,
  tolerance?: number | null
): boolean {
  switch (format) {
    case 'MCQ':
      return studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    case 'NUMERICAL': {
      const studentVal = parseFloat(studentAnswer);
      const correctVal = parseFloat(correctAnswer);
      if (isNaN(studentVal) || isNaN(correctVal)) return false;
      const tol = tolerance ?? 0;
      return Math.abs(studentVal - correctVal) <= tol;
    }

    case 'DRAWING_PROMPT':
    case 'IMAGE_BASED':
      // Self-assessed formats — always treated as correct
      return true;

    default:
      return false;
  }
}

/**
 * Record a student's attempt on a question.
 */
export async function submitQBAttempt(
  studentId: string,
  questionId: string,
  answer: string,
  timeSpent: number | null,
  mode: QBAttemptMode,
  client?: TypedSupabaseClient
): Promise<{ attempt: NexusQBStudentAttempt; isCorrect: boolean }> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch question to get correct answer and format
  const { data: question, error: questionError } = await supabase
    .from('nexus_qb_questions')
    .select('correct_answer, question_format, answer_tolerance')
    .eq('id', questionId)
    .single();
  if (questionError) throw questionError;

  const q = question as Pick<NexusQBQuestion, 'correct_answer' | 'question_format' | 'answer_tolerance'>;
  const isCorrect = checkQBAnswer(q.question_format, answer, q.correct_answer, q.answer_tolerance);

  // Insert attempt
  const { data: attempt, error: attemptError } = await supabase
    .from('nexus_qb_student_attempts')
    .insert({
      student_id: studentId,
      question_id: questionId,
      selected_answer: answer,
      is_correct: isCorrect,
      time_spent_seconds: timeSpent,
      mode,
    })
    .select()
    .single();
  if (attemptError) throw attemptError;

  return {
    attempt: attempt as NexusQBStudentAttempt,
    isCorrect,
  };
}

// ============================================
// STUDY MARKS
// ============================================

/**
 * Toggle study mark for a question. Returns true if marked, false if unmarked.
 */
export async function toggleQBStudyMark(
  studentId: string,
  questionId: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  // Check if already marked
  const { data: existing } = await supabase
    .from('nexus_qb_study_marks')
    .select('id')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .maybeSingle();

  if (existing) {
    // Remove mark
    const { error } = await supabase
      .from('nexus_qb_study_marks')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;
    return false;
  }

  // Add mark
  const { error } = await supabase
    .from('nexus_qb_study_marks')
    .insert({
      student_id: studentId,
      question_id: questionId,
    });
  if (error) throw error;
  return true;
}

// ============================================
// STUDENT STATS
// ============================================

/**
 * Aggregate progress stats for a student, optionally filtered by exam relevance.
 */
export async function getStudentQBStats(
  studentId: string,
  examRelevance?: QBExamRelevance,
  client?: TypedSupabaseClient
): Promise<QBProgressStats> {
  const supabase = client || getSupabaseAdminClient();

  // Count total active questions
  let totalQuery = supabase
    .from('nexus_qb_questions')
    .select('id, categories, difficulty', { count: 'exact' })
    .eq('is_active', true);
  if (examRelevance) {
    totalQuery = totalQuery.eq('exam_relevance', examRelevance);
  }
  const { data: allQuestions, count: totalCount, error: totalError } = await totalQuery;
  if (totalError) throw totalError;

  const totalQuestions = totalCount || 0;
  const questionsData = (allQuestions || []) as Pick<NexusQBQuestion, 'id' | 'categories' | 'difficulty'>[];

  // Build maps for category/difficulty per question
  const questionCategoryMap = new Map<string, string[]>();
  const questionDifficultyMap = new Map<string, string>();
  for (const q of questionsData) {
    questionCategoryMap.set(q.id, q.categories || []);
    questionDifficultyMap.set(q.id, q.difficulty);
  }

  const allQuestionIds = questionsData.map(q => q.id);

  // Fetch all attempts for this student on the filtered questions
  let attemptsQuery = supabase
    .from('nexus_qb_student_attempts')
    .select('question_id, is_correct, created_at')
    .eq('student_id', studentId);
  if (allQuestionIds.length > 0) {
    attemptsQuery = attemptsQuery.in('question_id', allQuestionIds);
  }
  const { data: attemptsRaw, error: attemptsError } = await attemptsQuery;
  if (attemptsError) throw attemptsError;

  // Group by question, find latest attempt per question
  const attemptsByQ = new Map<string, { is_correct: boolean; created_at: string }[]>();
  for (const a of (attemptsRaw || []) as any[]) {
    if (!attemptsByQ.has(a.question_id)) {
      attemptsByQ.set(a.question_id, []);
    }
    attemptsByQ.get(a.question_id)!.push(a);
  }

  let attemptedCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  const byCategory: Record<string, { attempted: number; correct: number; total: number }> = {};
  const byDifficulty: Record<string, { attempted: number; correct: number; total: number }> = {};

  // Initialize totals for categories and difficulties
  for (const q of questionsData) {
    for (const cat of q.categories || []) {
      if (!byCategory[cat]) byCategory[cat] = { attempted: 0, correct: 0, total: 0 };
      byCategory[cat].total++;
    }
    const diff = q.difficulty;
    if (!byDifficulty[diff]) byDifficulty[diff] = { attempted: 0, correct: 0, total: 0 };
    byDifficulty[diff].total++;
  }

  // Compute per-question stats (using latest attempt)
  for (const [qId, attempts] of attemptsByQ) {
    // Sort descending by created_at to get latest
    attempts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = attempts[0];

    attemptedCount++;
    if (latest.is_correct) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    // Update category stats
    const cats = questionCategoryMap.get(qId) || [];
    for (const cat of cats) {
      if (!byCategory[cat]) byCategory[cat] = { attempted: 0, correct: 0, total: 0 };
      byCategory[cat].attempted++;
      if (latest.is_correct) byCategory[cat].correct++;
    }

    // Update difficulty stats
    const diff = questionDifficultyMap.get(qId);
    if (diff) {
      if (!byDifficulty[diff]) byDifficulty[diff] = { attempted: 0, correct: 0, total: 0 };
      byDifficulty[diff].attempted++;
      if (latest.is_correct) byDifficulty[diff].correct++;
    }
  }

  const accuracyPercentage = attemptedCount > 0
    ? Math.round((correctCount / attemptedCount) * 100)
    : 0;

  return {
    total_questions: totalQuestions,
    attempted_count: attemptedCount,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    accuracy_percentage: accuracyPercentage,
    by_category: byCategory,
    by_difficulty: byDifficulty,
  };
}

// ============================================
// SAVED PRESETS
// ============================================

export async function getStudentQBPresets(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusQBSavedPreset[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_saved_presets')
    .select('*')
    .eq('student_id', studentId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusQBSavedPreset[];
}

export async function createQBPreset(
  studentId: string,
  name: string,
  filters: QBFilterState,
  client?: TypedSupabaseClient
): Promise<NexusQBSavedPreset> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_saved_presets')
    .insert({
      student_id: studentId,
      name,
      filters: filters as any,
    })
    .select()
    .single();
  if (error) throw error;
  return data as NexusQBSavedPreset;
}

export async function deleteQBPreset(
  presetId: string,
  studentId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_qb_saved_presets')
    .delete()
    .eq('id', presetId)
    .eq('student_id', studentId);
  if (error) throw error;
}

// ============================================
// QUESTION CRUD (Admin/Teacher)
// ============================================

export async function createQBQuestion(
  data: NexusQBQuestionInsert,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestion> {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await supabase
    .from('nexus_qb_questions')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return question as NexusQBQuestion;
}

export async function updateQBQuestion(
  id: string,
  data: NexusQBQuestionUpdate,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestion> {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await supabase
    .from('nexus_qb_questions')
    .update({
      ...data as any,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return question as NexusQBQuestion;
}

export async function softDeleteQBQuestion(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_qb_questions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// ============================================
// QUESTION SOURCE CRUD
// ============================================

export async function addQuestionSource(
  data: NexusQBQuestionSourceInsert,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestionSource> {
  const supabase = client || getSupabaseAdminClient();
  const { data: source, error } = await supabase
    .from('nexus_qb_question_sources')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return source as NexusQBQuestionSource;
}

export async function removeQuestionSource(
  sourceId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_qb_question_sources')
    .delete()
    .eq('id', sourceId);
  if (error) throw error;
}

// ============================================
// CLASSROOM LINKS
// ============================================

export async function enableQBForClassroom(
  classroomId: string,
  enabledBy: string,
  client?: TypedSupabaseClient
): Promise<NexusQBClassroomLink> {
  const supabase = client || getSupabaseAdminClient();

  // Upsert: if exists but inactive, reactivate; if not exists, insert
  const { data, error } = await supabase
    .from('nexus_qb_classroom_links')
    .upsert(
      {
        classroom_id: classroomId,
        is_active: true,
        enabled_at: new Date().toISOString(),
        enabled_by: enabledBy,
      },
      { onConflict: 'classroom_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as NexusQBClassroomLink;
}

export async function disableQBForClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_qb_classroom_links')
    .update({ is_active: false })
    .eq('classroom_id', classroomId);
  if (error) throw error;
}

export async function isQBEnabledForClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_classroom_links')
    .select('is_active')
    .eq('classroom_id', classroomId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_active === true;
}
