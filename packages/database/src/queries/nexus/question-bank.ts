import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBExamType,
  QBShift,
  QBAttemptMode,
  QBQuestionStatus,
  QBConfidenceTier,
  QBFilterState,
  QBProgressStats,
  QBAttemptSummary,
  QBExamTree,
  QBExamTreeExam,
  QBExamTreeYear,
  QBExamTreeSession,
  QBRecalledSessionCard,
  QBTopicIntelligenceItem,
  NexusQBTopic,
  NexusQBQuestion,
  NexusQBQuestionSource,
  NexusQBStudentAttempt,
  NexusQBStudyMark,
  NexusQBSavedPreset,
  NexusQBClassroomLink,
  NexusQBOriginalPaper,
  NexusQBPaperContributor,
  NexusQBQuestionListItem,
  NexusQBQuestionDetail,
  NexusQBQuestionInsert,
  NexusQBQuestionUpdate,
  NexusQBQuestionSourceInsert,
  NTAParsedQuestion,
  NexusQBAnswerKeyEntry,
  NexusQBQuestionReport,
  NexusQBReportWithContext,
} from '../../types';

// ============================================
// EXAM TREE QUERIES
// ============================================

const QB_EXAM_LABELS: Record<string, string> = {
  NATA: 'NATA',
  JEE_PAPER_2: 'JEE Paper 2',
};

/**
 * Parse a composite session key (e.g., "Session 1 (Forenoon)") into session + shift.
 * Used by sidebar/filter components to extract shift from display keys.
 */
export function parseSessionKey(key: string): { session: string; shift: QBShift | null } {
  const match = key.match(/^(.+?)\s*\((Forenoon|Afternoon)\)$/);
  if (match) {
    return { session: match[1].trim(), shift: match[2].toLowerCase() as QBShift };
  }
  return { session: key, shift: null };
}

/**
 * Get the exam tree for sidebar navigation: exam_type → year → session with counts.
 */
export async function getQBExamTree(
  client?: TypedSupabaseClient
): Promise<QBExamTree> {
  const supabase = client || getSupabaseAdminClient();

  // Get all sources for active questions, grouped by exam_type/year/session
  const { data, error } = await supabase
    .from('nexus_qb_question_sources')
    .select('exam_type, year, session, shift, question_id');

  if (error) throw error;

  // Filter to only active questions
  const activeQuestionIds = new Set<string>();
  const { data: activeQ, error: activeErr } = await supabase
    .from('nexus_qb_questions')
    .select('id')
    .eq('is_active', true)
    .eq('status' as any, 'active');
  if (activeErr) throw activeErr;
  for (const q of activeQ || []) {
    activeQuestionIds.add((q as any).id);
  }

  // Build grouped counts
  const examMap = new Map<string, Map<number, Map<string, Set<string>>>>();

  for (const row of (data || []) as any[]) {
    if (!activeQuestionIds.has(row.question_id)) continue;

    const examType = row.exam_type as string;
    const year = row.year as number;
    const rawSession = (row.session as string) || '';
    const shift = row.shift as string | null;
    const session = shift
      ? `${rawSession} (${shift === 'forenoon' ? 'Forenoon' : 'Afternoon'})`
      : rawSession;

    if (!examMap.has(examType)) examMap.set(examType, new Map());
    const yearMap = examMap.get(examType)!;
    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const sessionMap = yearMap.get(year)!;
    if (!sessionMap.has(session)) sessionMap.set(session, new Set());
    sessionMap.get(session)!.add(row.question_id);
  }

  // Convert to tree structure
  const exams: QBExamTreeExam[] = [];
  // Sort exam types: NATA first, then JEE
  const sortedExamTypes = [...examMap.keys()].sort((a, b) => {
    if (a === 'NATA') return -1;
    if (b === 'NATA') return 1;
    return a.localeCompare(b);
  });

  for (const examType of sortedExamTypes) {
    const yearMap = examMap.get(examType)!;
    const years: QBExamTreeYear[] = [];
    let examTotal = 0;

    // Sort years descending
    const sortedYears = [...yearMap.keys()].sort((a, b) => b - a);
    for (const year of sortedYears) {
      const sessionMap = yearMap.get(year)!;
      const sessions: QBExamTreeSession[] = [];
      const yearQuestionIds = new Set<string>();

      // Sort sessions
      const sortedSessions = [...sessionMap.keys()].sort();
      for (const session of sortedSessions) {
        const qIds = sessionMap.get(session)!;
        for (const id of qIds) yearQuestionIds.add(id);
        if (session !== '') {
          sessions.push({ session, count: qIds.size });
        }
      }

      years.push({
        year,
        count: yearQuestionIds.size,
        sessions,
      });
      examTotal += yearQuestionIds.size;
    }

    exams.push({
      exam_type: examType as QBExamType,
      label: QB_EXAM_LABELS[examType] || examType,
      total_count: examTotal,
      years,
    });
  }

  return { exams };
}

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

/**
 * Get count of active questions per topic_id.
 * Returns a map of topic_id → question count.
 */
export async function getQBTopicCounts(
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('topic_id')
    .eq('is_active', true)
    .eq('status' as any, 'active')
    .not('topic_id', 'is', null);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const tid = (row as any).topic_id as string;
    counts[tid] = (counts[tid] || 0) + 1;
  }
  return counts;
}

/**
 * Get count of active questions per category, optionally filtered by exam context.
 * Unnests the categories array and counts per value.
 */
export async function getQBCategoryCounts(
  filters?: { exam_type?: QBExamType; source_year?: number; source_session?: string },
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();

  let sql: string;
  if (filters?.exam_type) {
    // Filter by exam source
    const conditions: string[] = [
      `s.exam_type = '${filters.exam_type}'`,
    ];
    if (filters.source_year) conditions.push(`s.year = ${filters.source_year}`);
    if (filters.source_session) {
      const parsed = parseSessionKey(filters.source_session);
      conditions.push(`s.session = '${parsed.session.replace(/'/g, "''")}'`);
      if (parsed.shift) {
        conditions.push(`s.shift = '${parsed.shift}'`);
      }
    }

    sql = `
      SELECT cat, COUNT(DISTINCT q.id) as cnt
      FROM nexus_qb_questions q
      JOIN nexus_qb_question_sources s ON s.question_id = q.id
      CROSS JOIN LATERAL unnest(q.categories) AS cat
      WHERE q.is_active = true AND q.status = 'active'
        AND ${conditions.join(' AND ')}
      GROUP BY cat
      ORDER BY cnt DESC
    `;
  } else {
    // No filter — all active questions
    sql = `
      SELECT cat, COUNT(DISTINCT q.id) as cnt
      FROM nexus_qb_questions q
      CROSS JOIN LATERAL unnest(q.categories) AS cat
      WHERE q.is_active = true AND q.status = 'active'
      GROUP BY cat
      ORDER BY cnt DESC
    `;
  }

  const { data, error } = await supabase.rpc('exec_sql' as any, { query: sql }) as any;
  // Fallback: if rpc doesn't work, try via .from with raw
  if (error) {
    // Use direct fetch to Supabase REST
    // Fallback: fetch all categories and count client-side
    return getQBCategoryCountsFallback(filters, supabase);
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.cat] = parseInt(row.cnt, 10);
  }
  return counts;
}

/** Fallback: fetch categories for all matching questions and count client-side. */
async function getQBCategoryCountsFallback(
  filters?: { exam_type?: QBExamType; source_year?: number; source_session?: string },
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();

  let questionIds: string[] | null = null;

  if (filters?.exam_type) {
    let sourceQuery = supabase
      .from('nexus_qb_question_sources')
      .select('question_id')
      .eq('exam_type', filters.exam_type);
    if (filters.source_year) sourceQuery = sourceQuery.eq('year', filters.source_year);
    if (filters.source_session) {
      const parsed = parseSessionKey(filters.source_session);
      sourceQuery = sourceQuery.eq('session', parsed.session);
      if (parsed.shift) {
        sourceQuery = sourceQuery.eq('shift', parsed.shift);
      }
    }

    const { data: sourceData, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;
    questionIds = [...new Set((sourceData || []).map((s: any) => s.question_id))];
    if (questionIds.length === 0) return {};
  }

  let query = supabase
    .from('nexus_qb_questions')
    .select('categories')
    .eq('is_active', true)
    .eq('status' as any, 'active');

  if (questionIds) {
    query = query.in('id', questionIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const cats = (row as any).categories as string[] | null;
    if (!cats) continue;
    for (const cat of cats) {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  return counts;
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
    .eq('is_active', true)
    .eq('status' as any, 'active');

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
  if (filters.confidence_tier && filters.confidence_tier.length > 0) {
    query = query.in('confidence_tier', filters.confidence_tier);
  }
  if (filters.paper_source === 'recalled') {
    query = query.not('confidence_tier', 'is', null);
  }

  // Source-based filters from sidebar (exam_type + source_year + source_session)
  let sourceFilteredIds: string[] | null = null;
  if (filters.exam_type) {
    let sourceQuery = supabase
      .from('nexus_qb_question_sources')
      .select('question_id')
      .eq('exam_type', filters.exam_type);

    if (filters.source_year) {
      sourceQuery = sourceQuery.eq('year', filters.source_year);
    }
    if (filters.source_session) {
      const parsed = parseSessionKey(filters.source_session);
      sourceQuery = sourceQuery.eq('session', parsed.session);
      if (parsed.shift) {
        sourceQuery = sourceQuery.eq('shift', parsed.shift);
      }
    }
    if (filters.source_shift) {
      sourceQuery = sourceQuery.eq('shift', filters.source_shift);
    }

    const { data: sourceData, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;

    sourceFilteredIds = [...new Set((sourceData || []).map((s: any) => s.question_id))];

    if (sourceFilteredIds.length === 0) {
      return { questions: [], total: 0 };
    }
    query = query.in('id', sourceFilteredIds);
  }

  // For exam_years filter (legacy/preset-based), get question IDs from sources
  let yearFilteredIds: string[] | null = null;
  if (!filters.exam_type && filters.exam_years && filters.exam_years.length > 0) {
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
  if (!q.correct_answer) {
    throw new Error('Cannot submit attempt: question has no correct answer set');
  }
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
    .eq('is_active', true)
    .eq('status' as any, 'active');
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
// TEACHER STATS
// ============================================

/**
 * Aggregate stats for teacher view — counts ALL questions regardless of status/is_active.
 */
export async function getTeacherQBStats(
  examRelevance?: QBExamRelevance,
  client?: TypedSupabaseClient
): Promise<QBProgressStats> {
  const supabase = client || getSupabaseAdminClient();

  let totalQuery = supabase
    .from('nexus_qb_questions')
    .select('*', { count: 'exact' });
  if (examRelevance) {
    totalQuery = totalQuery.eq('exam_relevance', examRelevance);
  }
  const { data: allQuestions, count: totalCount, error: totalError } = await totalQuery;
  if (totalError) throw totalError;

  const totalQuestions = totalCount || 0;
  const questionsData = (allQuestions || []) as NexusQBQuestion[];

  // Count questions with solutions (answer_keyed, complete, or active)
  const withSolutions = questionsData.filter(
    (q) => q.status === 'answer_keyed' || q.status === 'complete' || q.status === 'active'
  ).length;

  const byCategory: Record<string, { attempted: number; correct: number; total: number }> = {};
  const byDifficulty: Record<string, { attempted: number; correct: number; total: number }> = {};

  for (const q of questionsData) {
    for (const cat of q.categories || []) {
      if (!byCategory[cat]) byCategory[cat] = { attempted: 0, correct: 0, total: 0 };
      byCategory[cat].total++;
    }
    const diff = q.difficulty;
    if (!byDifficulty[diff]) byDifficulty[diff] = { attempted: 0, correct: 0, total: 0 };
    byDifficulty[diff].total++;
  }

  return {
    total_questions: totalQuestions,
    attempted_count: withSolutions,
    correct_count: 0,
    incorrect_count: 0,
    accuracy_percentage: 0,
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

// ============================================
// BULK UPLOAD - ORIGINAL PAPERS
// ============================================

/**
 * Get or create an original paper record. Returns existing if duplicate.
 */
export async function getOrCreateOriginalPaper(
  examType: QBExamType,
  year: number,
  session: string | null,
  uploadedBy: string,
  shift?: QBShift | null,
  client?: TypedSupabaseClient
): Promise<{ paper: NexusQBOriginalPaper; isNew: boolean }> {
  const supabase = client || getSupabaseAdminClient();

  // Check if paper already exists
  let query = supabase
    .from('nexus_qb_original_papers')
    .select('*')
    .eq('exam_type', examType)
    .eq('year', year);

  if (session) {
    query = query.eq('session', session);
  } else {
    query = query.is('session', null);
  }

  if (shift) {
    query = query.eq('shift', shift);
  } else {
    query = query.is('shift', null);
  }

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;

  if (existing) {
    return { paper: existing as NexusQBOriginalPaper, isNew: false };
  }

  // Create new paper
  const { data: paper, error: insertError } = await supabase
    .from('nexus_qb_original_papers')
    .insert({
      exam_type: examType,
      year,
      session,
      shift: shift || null,
      uploaded_by: uploadedBy,
      upload_status: 'pending',
      questions_parsed: 0,
      questions_answer_keyed: 0,
      questions_complete: 0,
    } as any)
    .select()
    .single();
  if (insertError) throw insertError;

  return { paper: paper as NexusQBOriginalPaper, isNew: true };
}

/**
 * Bulk insert question shells from parsed NTA data.
 */
export async function bulkCreateDraftQuestions(
  paperId: string,
  examType: QBExamType,
  year: number,
  session: string | null,
  questions: NTAParsedQuestion[],
  createdBy: string,
  shift?: QBShift | null,
  client?: TypedSupabaseClient
): Promise<{ created: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Build question inserts
  const questionInserts = questions.map((q) => ({
    question_format: q.question_format,
    question_text: q.question_text || null,
    question_text_hi: q.question_text_hi || null,
    question_image_url: q.question_image_url || null,
    options: q.question_format === 'MCQ'
      ? q.options.map((opt, i) => ({
          id: String.fromCharCode(97 + i), // a, b, c, d
          text: opt.text || '',
          text_hi: opt.text_hi || undefined,
          image_url: opt.image_url || null,
          nta_id: opt.nta_id,
        }))
      : null,
    correct_answer: null,
    explanation_brief: q.explanation_brief || null,
    explanation_detailed: q.explanation_detailed || null,
    solution_video_url: q.solution_video_url || null,
    difficulty: 'MEDIUM' as QBDifficulty,
    exam_relevance: (examType === 'JEE_PAPER_2' ? 'JEE' : 'NATA') as QBExamRelevance,
    categories: q.categories,
    original_paper_id: paperId,
    display_order: q.question_number,
    status: 'draft' as QBQuestionStatus,
    nta_question_id: q.nta_question_id,
    is_active: false,
    created_by: createdBy,
  }));

  // Batch insert questions
  const { data: createdQuestions, error: insertError } = await supabase
    .from('nexus_qb_questions')
    .insert(questionInserts as any)
    .select('id, display_order');
  if (insertError) throw insertError;

  // Build source inserts
  const sourceInserts = (createdQuestions || []).map((cq: any) => ({
    question_id: cq.id,
    exam_type: examType,
    year,
    session,
    shift: shift || null,
    question_number: cq.display_order,
  }));

  if (sourceInserts.length > 0) {
    const { error: sourceError } = await supabase
      .from('nexus_qb_question_sources')
      .insert(sourceInserts as any);
    if (sourceError) throw sourceError;
  }

  // Update paper stats
  const count = createdQuestions?.length || 0;
  await supabase
    .from('nexus_qb_original_papers')
    .update({
      upload_status: 'parsed',
      questions_parsed: count,
      total_questions: count,
    } as any)
    .eq('id', paperId);

  return { created: count };
}

/**
 * Merge Hindi text into existing paper questions by matching question_number (display_order).
 */
export async function mergeHindiIntoQuestions(
  paperId: string,
  hindiData: {
    question_number: number;
    text_hi: string;
    options_hi?: { label: string; text_hi: string }[];
    explanation_brief_hi?: string;
    explanation_detailed_hi?: string;
  }[],
  client?: TypedSupabaseClient
): Promise<{
  updated: number;
  skipped: number;
  details: { textUpdated: number; optionsUpdated: number; explanationsUpdated: number; overwrites: number };
}> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch existing questions for this paper
  // Note: question_text_hi exists in DB but not yet in generated Supabase types, so we select without it and cast
  const { data: existingQuestions, error: fetchError } = await supabase
    .from('nexus_qb_questions')
    .select('id, display_order, options')
    .eq('original_paper_id', paperId)
    .order('display_order', { ascending: true });
  if (fetchError) throw fetchError;

  // Build lookup by display_order (question_number)
  const questionMap = new Map<number, { id: string; options: any; question_text_hi: string | null }>();
  for (const q of (existingQuestions || []) as any[]) {
    if (q.display_order != null) {
      questionMap.set(q.display_order, { id: q.id, options: q.options, question_text_hi: q.question_text_hi || null });
    }
  }

  let updated = 0;
  let skipped = 0;
  const details = { textUpdated: 0, optionsUpdated: 0, explanationsUpdated: 0, overwrites: 0 };

  for (const hi of hindiData) {
    const match = questionMap.get(hi.question_number);
    if (!match) {
      skipped++;
      continue;
    }

    // Track overwrites
    if (match.question_text_hi) {
      details.overwrites++;
    }

    // Build updated options with text_hi merged in
    let updatedOptions = match.options;
    let hasOptionUpdates = false;
    if (hi.options_hi && Array.isArray(match.options)) {
      const hiMap = new Map(hi.options_hi.map((o) => [o.label.toLowerCase(), o.text_hi]));
      updatedOptions = (match.options as any[]).map((opt: any) => ({
        ...opt,
        text_hi: hiMap.get(opt.id) || opt.text_hi || undefined,
      }));
      hasOptionUpdates = hi.options_hi.length > 0;
    }

    // Build update payload
    const updatePayload: Record<string, any> = {
      question_text_hi: hi.text_hi,
      options: updatedOptions,
    };

    if (hi.explanation_brief_hi) {
      updatePayload.explanation_brief_hi = hi.explanation_brief_hi;
    }
    if (hi.explanation_detailed_hi) {
      updatePayload.explanation_detailed_hi = hi.explanation_detailed_hi;
    }

    const { error: updateError } = await supabase
      .from('nexus_qb_questions')
      .update(updatePayload as any)
      .eq('id', match.id);

    if (updateError) {
      console.error(`Failed to update question ${match.id}:`, updateError);
      skipped++;
    } else {
      updated++;
      if (hi.text_hi) details.textUpdated++;
      if (hasOptionUpdates) details.optionsUpdated++;
      if (hi.explanation_brief_hi || hi.explanation_detailed_hi) details.explanationsUpdated++;
    }
  }

  return { updated, skipped, details };
}

/**
 * Apply answer key to a paper's draft questions.
 */
export async function applyAnswerKey(
  paperId: string,
  answers: NexusQBAnswerKeyEntry[],
  client?: TypedSupabaseClient
): Promise<{ updated: number; errors: string[] }> {
  const supabase = client || getSupabaseAdminClient();
  const errors: string[] = [];
  let updated = 0;

  // Get all questions for this paper
  const { data: questions, error: fetchError } = await supabase
    .from('nexus_qb_questions')
    .select('id, display_order, question_format')
    .eq('original_paper_id', paperId)
    .order('display_order', { ascending: true });
  if (fetchError) throw fetchError;

  // Build a map of question_number -> question
  const questionMap = new Map<number, any>();
  for (const q of (questions || []) as any[]) {
    if (q.display_order != null) {
      questionMap.set(q.display_order, q);
    }
  }

  // Apply each answer
  for (const entry of answers) {
    const q = questionMap.get(entry.question_number);
    if (!q) {
      errors.push(`Q${entry.question_number}: not found in paper`);
      continue;
    }

    // Determine the new status
    const newStatus: QBQuestionStatus = 'answer_keyed';

    const { error: updateError } = await supabase
      .from('nexus_qb_questions')
      .update({
        correct_answer: entry.correct_answer,
        status: newStatus,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', q.id);

    if (updateError) {
      errors.push(`Q${entry.question_number}: ${updateError.message}`);
    } else {
      updated++;
    }
  }

  // Refresh paper stats
  await refreshPaperStats(paperId, supabase);

  return { updated, errors };
}

/**
 * Get all questions for a paper (for answer key grid, completion tracking).
 */
export async function getQuestionsByPaper(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestion[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('*')
    .eq('original_paper_id', paperId)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusQBQuestion[];
}

/**
 * List all original papers with upload stats.
 */
export async function listOriginalPapers(
  client?: TypedSupabaseClient
): Promise<NexusQBOriginalPaper[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_original_papers')
    .select('*')
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusQBOriginalPaper[];
}

/**
 * Get a single paper with stats.
 */
export async function getOriginalPaperWithStats(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<NexusQBOriginalPaper | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_original_papers')
    .select('*')
    .eq('id', paperId)
    .maybeSingle();
  if (error) throw error;
  return data as NexusQBOriginalPaper | null;
}

/**
 * Recalculate and update paper stats based on question statuses.
 */
export async function refreshPaperStats(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { data: questions, error } = await supabase
    .from('nexus_qb_questions')
    .select('*')
    .eq('original_paper_id', paperId);
  if (error) throw error;

  const statuses = (questions || []) as unknown as { status: QBQuestionStatus }[];
  const parsed = statuses.length;
  const answerKeyed = statuses.filter(
    (q) => q.status === 'answer_keyed' || q.status === 'complete' || q.status === 'active'
  ).length;
  const complete = statuses.filter(
    (q) => q.status === 'complete' || q.status === 'active'
  ).length;

  // Determine paper upload_status
  let uploadStatus: string = 'parsed';
  if (complete === parsed && parsed > 0) {
    uploadStatus = 'complete';
  } else if (answerKeyed > 0) {
    uploadStatus = 'answer_keyed';
  }

  await supabase
    .from('nexus_qb_original_papers')
    .update({
      questions_parsed: parsed,
      questions_answer_keyed: answerKeyed,
      questions_complete: complete,
      upload_status: uploadStatus,
    } as any)
    .eq('id', paperId);
}

/**
 * Bulk activate questions in a paper.
 * Activates both 'answer_keyed' and 'complete' questions.
 */
export async function bulkActivateQuestions(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<{ activated: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Activate questions that are 'complete' or 'answer_keyed'
  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .update({
      status: 'active',
      is_active: true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('original_paper_id', paperId)
    .in('status' as any, ['complete', 'answer_keyed'])
    .select('id');
  if (error) throw error;

  const activated = data?.length || 0;

  // Refresh paper stats
  await refreshPaperStats(paperId, supabase);

  return { activated };
}

/**
 * Get teacher-view questions for a paper (all statuses, for management).
 */
export async function getTeacherQBQuestions(
  filters: QBFilterState & { status?: QBQuestionStatus[] },
  page: number,
  pageSize: number,
  client?: TypedSupabaseClient
): Promise<{ questions: NexusQBQuestionListItem[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('nexus_qb_questions')
    .select('*', { count: 'exact' });

  // Teacher can see all statuses, or filter by specific ones
  if (filters.status && filters.status.length > 0) {
    query = query.in('status' as any, filters.status);
  }

  // Standard filters
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

  // Solution filter
  if (filters.solution_filter) {
    switch (filters.solution_filter) {
      case 'has_video':
        query = query.not('solution_video_url', 'is', null);
        break;
      case 'has_image':
        query = query.not('solution_image_url', 'is', null);
        break;
      case 'has_explanation':
        query = query.not('explanation_brief', 'is', null);
        break;
      case 'no_solution':
        query = query.is('solution_video_url', null).is('solution_image_url', null).is('explanation_brief', null);
        break;
    }
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  const { data: questionsRaw, error: questionsError, count } = await query;
  if (questionsError) throw questionsError;

  const questions = (questionsRaw || []) as NexusQBQuestion[];
  if (questions.length === 0) {
    return { questions: [], total: count || 0 };
  }

  const questionIds = questions.map((q) => q.id);

  // Fetch sources
  const { data: sourcesRaw } = await supabase
    .from('nexus_qb_question_sources')
    .select('*')
    .in('question_id', questionIds);

  const sourcesMap = new Map<string, NexusQBQuestionSource[]>();
  for (const s of (sourcesRaw || []) as NexusQBQuestionSource[]) {
    if (!sourcesMap.has(s.question_id)) {
      sourcesMap.set(s.question_id, []);
    }
    sourcesMap.get(s.question_id)!.push(s);
  }

  // Fetch topics
  const topicIds = [...new Set(questions.map((q) => q.topic_id).filter(Boolean))] as string[];
  const topicMap = new Map<string, NexusQBTopic>();
  if (topicIds.length > 0) {
    const { data: topicsRaw } = await supabase
      .from('nexus_qb_topics')
      .select('*')
      .in('id', topicIds);
    for (const t of (topicsRaw || []) as NexusQBTopic[]) {
      topicMap.set(t.id, t);
    }
  }

  const result: NexusQBQuestionListItem[] = questions.map((q) => ({
    ...q,
    sources: sourcesMap.get(q.id) || [],
    topic: q.topic_id ? topicMap.get(q.topic_id) || null : null,
    attempt_summary: null,
  }));

  return { questions: result, total: count || 0 };
}

/**
 * Bulk deactivate active questions in a paper.
 * Sets status back to 'complete' and is_active to false.
 */
export async function bulkDeactivateQuestions(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<{ deactivated: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .update({
      status: 'complete',
      is_active: false,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('original_paper_id', paperId)
    .eq('status' as any, 'active')
    .select('id');
  if (error) throw error;

  const deactivated = data?.length || 0;

  await refreshPaperStats(paperId, supabase);

  return { deactivated };
}

/**
 * Delete a paper and all its questions and sources.
 */
export async function deletePaperWithQuestions(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<{ deletedQuestions: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Get question IDs for this paper
  const { data: questions, error: fetchError } = await supabase
    .from('nexus_qb_questions')
    .select('id')
    .eq('original_paper_id', paperId);
  if (fetchError) throw fetchError;

  const questionIds = (questions || []).map((q: any) => q.id);

  if (questionIds.length > 0) {

    // Delete sources
    const { error: srcError } = await supabase
      .from('nexus_qb_question_sources')
      .delete()
      .in('question_id', questionIds);
    if (srcError) throw srcError;

    // Delete questions
    const { error: qError } = await supabase
      .from('nexus_qb_questions')
      .delete()
      .eq('original_paper_id', paperId);
    if (qError) throw qError;
  }

  // Delete the paper itself
  const { error: paperError } = await supabase
    .from('nexus_qb_original_papers')
    .delete()
    .eq('id', paperId);
  if (paperError) throw paperError;

  return { deletedQuestions: questionIds.length };
}

/**
 * Get section breakdown for a paper (counts by category).
 */
export async function getPaperSectionBreakdown(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('categories, question_format')
    .eq('original_paper_id', paperId);
  if (error) throw error;

  const breakdown: Record<string, number> = {};
  for (const q of (data || []) as any[]) {
    const cats = q.categories as string[] | null;
    if (cats && cats.length > 0) {
      for (const cat of cats) {
        breakdown[cat] = (breakdown[cat] || 0) + 1;
      }
    } else {
      // Use question_format as fallback
      const fmt = q.question_format || 'OTHER';
      breakdown[fmt] = (breakdown[fmt] || 0) + 1;
    }
  }

  return breakdown;
}

// ============================================
// QUESTION REPORT QUERIES
// ============================================

/**
 * Create a question report from a student.
 */
export async function createQBReport(
  data: { question_id: string; student_id: string; report_type: string; description?: string },
  client?: TypedSupabaseClient
): Promise<NexusQBQuestionReport> {
  const supabase = client || getSupabaseAdminClient();
  const { data: report, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return report as NexusQBQuestionReport;
}

/**
 * Get reports created by a specific student.
 */
export async function getStudentQBReports(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusQBQuestionReport[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusQBQuestionReport[];
}

/**
 * Get all reports for teacher/admin view with question context.
 */
export async function getTeacherQBReports(
  filters?: { status?: string },
  client?: TypedSupabaseClient
): Promise<NexusQBReportWithContext[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = (supabase as any)
    .from('nexus_qb_question_reports')
    .select('*, nexus_qb_questions!inner(question_text, question_image_url), users!nexus_qb_question_reports_student_id_fkey(display_name, email)')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Transform the joined data
  return (data || []).map((r: any) => ({
    ...r,
    question_text: r.nexus_qb_questions?.question_text || null,
    question_image_url: r.nexus_qb_questions?.question_image_url || null,
    student_name: r.users?.display_name || null,
    student_email: r.users?.email || null,
    sources: [],
  })) as NexusQBReportWithContext[];
}

/**
 * Resolve or update a report's status.
 */
export async function resolveQBReport(
  reportId: string,
  data: { status: string; resolution_note?: string; resolved_by: string },
  client?: TypedSupabaseClient
): Promise<NexusQBQuestionReport> {
  const supabase = client || getSupabaseAdminClient();
  const { data: report, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .update({
      status: data.status,
      resolution_note: data.resolution_note || null,
      resolved_by: data.resolved_by,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single();
  if (error) throw error;
  return report as NexusQBQuestionReport;
}

/**
 * Get report counts grouped by status.
 */
export async function getQBReportCounts(
  client?: TypedSupabaseClient
): Promise<{ open: number; in_review: number; resolved: number; dismissed: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select('status');
  if (error) throw error;
  const counts = { open: 0, in_review: 0, resolved: 0, dismissed: 0 };
  (data || []).forEach((r: any) => {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  });
  return counts;
}

// ============================================
// RECALLED PAPERS QUERIES
// ============================================

/**
 * Get recalled session cards for the Paper Browser.
 * Returns papers with paper_source='recalled', enriched with contributors and tier counts.
 */
export async function getQBRecalledSessionCards(
  year?: number,
  client?: TypedSupabaseClient
): Promise<QBRecalledSessionCard[]> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch recalled papers
  let paperQuery = (supabase as any)
    .from('nexus_qb_original_papers')
    .select('*')
    .eq('paper_source', 'recalled')
    .order('exam_date', { ascending: false });

  if (year) {
    paperQuery = paperQuery.eq('year', year);
  }

  const { data: papers, error: papersError } = await paperQuery;
  if (papersError) throw papersError;
  if (!papers || papers.length === 0) return [];

  const paperIds = (papers as any[]).map(p => p.id);

  // Fetch contributors for all papers
  const { data: contributors, error: contribError } = await (supabase as any)
    .from('nexus_qb_paper_contributors')
    .select('*')
    .in('paper_id', paperIds);
  if (contribError) throw contribError;

  const contributorsByPaper = new Map<string, NexusQBPaperContributor[]>();
  for (const c of (contributors || []) as NexusQBPaperContributor[]) {
    if (!contributorsByPaper.has(c.paper_id)) {
      contributorsByPaper.set(c.paper_id, []);
    }
    contributorsByPaper.get(c.paper_id)!.push(c);
  }

  // Fetch tier counts per paper (questions grouped by confidence_tier)
  const { data: questions, error: questionsError } = await supabase
    .from('nexus_qb_questions')
    .select('original_paper_id, confidence_tier, topic_id')
    .in('original_paper_id', paperIds)
    .not('confidence_tier', 'is', null);
  if (questionsError) throw questionsError;

  // Fetch topic slugs for distribution
  const topicIds = [...new Set((questions || []).map((q: any) => q.topic_id).filter(Boolean))];
  let topicSlugMap = new Map<string, string>();
  if (topicIds.length > 0) {
    const { data: topics, error: topicsError } = await supabase
      .from('nexus_qb_topics')
      .select('id, slug')
      .in('id', topicIds);
    if (!topicsError && topics) {
      for (const t of topics as any[]) {
        topicSlugMap.set(t.id, t.slug);
      }
    }
  }

  // Build per-paper aggregates
  const tierCountsByPaper = new Map<string, { tier_1: number; tier_2: number; tier_3: number }>();
  const topicDistByPaper = new Map<string, Record<string, number>>();

  for (const q of (questions || []) as any[]) {
    const paperId = q.original_paper_id;
    if (!tierCountsByPaper.has(paperId)) {
      tierCountsByPaper.set(paperId, { tier_1: 0, tier_2: 0, tier_3: 0 });
    }
    const counts = tierCountsByPaper.get(paperId)!;
    if (q.confidence_tier === 1) counts.tier_1++;
    else if (q.confidence_tier === 2) counts.tier_2++;
    else if (q.confidence_tier === 3) counts.tier_3++;

    if (q.topic_id) {
      const slug = topicSlugMap.get(q.topic_id) || q.topic_id;
      if (!topicDistByPaper.has(paperId)) {
        topicDistByPaper.set(paperId, {});
      }
      const dist = topicDistByPaper.get(paperId)!;
      dist[slug] = (dist[slug] || 0) + 1;
    }
  }

  return (papers as NexusQBOriginalPaper[]).map(paper => ({
    paper,
    contributors: contributorsByPaper.get(paper.id) || [],
    tier_counts: tierCountsByPaper.get(paper.id) || { tier_1: 0, tier_2: 0, tier_3: 0 },
    topic_distribution: topicDistByPaper.get(paper.id) || {},
  }));
}

/**
 * Get topic intelligence data — topics with cross-session frequency and study material.
 */
export async function getTopicIntelligence(
  client?: TypedSupabaseClient
): Promise<QBTopicIntelligenceItem[]> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch topics that have priority set (i.e. part of the intelligence map)
  const { data: topics, error: topicsError } = await (supabase as any)
    .from('nexus_qb_topics')
    .select('*')
    .not('priority', 'is', null)
    .eq('is_active', true)
    .order('session_appearance_count', { ascending: false });
  if (topicsError) throw topicsError;
  if (!topics || topics.length === 0) return [];

  const topicIds = (topics as any[]).map(t => t.id);

  // Count questions per topic (across recalled papers only)
  const { data: questions, error: qError } = await supabase
    .from('nexus_qb_questions')
    .select('topic_id, original_paper_id')
    .in('topic_id', topicIds)
    .not('confidence_tier', 'is', null);
  if (qError) throw qError;

  // Get paper sessions for mapping
  const paperIds = [...new Set((questions || []).map((q: any) => q.original_paper_id).filter(Boolean))];
  let paperSessionMap = new Map<string, string>();
  if (paperIds.length > 0) {
    const { data: papers, error: pError } = await supabase
      .from('nexus_qb_original_papers')
      .select('id, session')
      .in('id', paperIds);
    if (!pError && papers) {
      for (const p of papers as any[]) {
        paperSessionMap.set(p.id, p.session || 'unknown');
      }
    }
  }

  // Compute per-topic stats
  const topicStats = new Map<string, { count: number; sessions: Set<string> }>();
  for (const q of (questions || []) as any[]) {
    if (!q.topic_id) continue;
    if (!topicStats.has(q.topic_id)) {
      topicStats.set(q.topic_id, { count: 0, sessions: new Set() });
    }
    const stats = topicStats.get(q.topic_id)!;
    stats.count++;
    if (q.original_paper_id) {
      const session = paperSessionMap.get(q.original_paper_id);
      if (session) stats.sessions.add(session);
    }
  }

  return (topics as NexusQBTopic[]).map(topic => ({
    ...topic,
    question_count: topicStats.get(topic.id)?.count || 0,
    session_names: [...(topicStats.get(topic.id)?.sessions || [])],
  }));
}

/**
 * Promote an exam recall thread to a QB question.
 * Creates the question, source entry, and updates contributor counts.
 */
export async function promoteRecallToQB(
  threadId: string,
  paperId: string,
  confidenceTier: QBConfidenceTier,
  questionData: NexusQBQuestionInsert,
  contributorUserIds: string[],
  client?: TypedSupabaseClient
): Promise<NexusQBQuestion> {
  const supabase = client || getSupabaseAdminClient();

  // Get the paper info for source entry
  const { data: paper, error: paperError } = await supabase
    .from('nexus_qb_original_papers')
    .select('*')
    .eq('id', paperId)
    .single();
  if (paperError) throw paperError;

  // Create the QB question (cast to any — new columns not yet in generated types)
  const { data: question, error: questionError } = await (supabase as any)
    .from('nexus_qb_questions')
    .insert({
      ...questionData,
      confidence_tier: confidenceTier,
      recall_thread_id: threadId,
      answer_source: confidenceTier === 1 ? 'teacher_verified' : 'student_recalled',
      original_paper_id: paperId,
      status: confidenceTier === 3 ? 'draft' : 'active',
      is_active: confidenceTier !== 3,
    })
    .select()
    .single();
  if (questionError) throw questionError;

  // Create the question source entry
  const { error: sourceError } = await supabase
    .from('nexus_qb_question_sources')
    .insert({
      question_id: (question as any).id,
      exam_type: (paper as any).exam_type,
      year: (paper as any).year,
      session: (paper as any).session,
    });
  if (sourceError) throw sourceError;

  // Update the recall thread's published_question_id
  const { error: threadError } = await supabase
    .from('nexus_exam_recall_threads')
    .update({ published_question_id: (question as any).id, status: 'published' })
    .eq('id', threadId);
  if (threadError) throw threadError;

  // Update contributor counts
  const tierKey = `tier_${confidenceTier}_count` as const;
  for (const userId of contributorUserIds) {
    // Use upsert pattern — increment if exists
    const { data: existing } = await (supabase as any)
      .from('nexus_qb_paper_contributors')
      .select('id, question_count, tier_1_count, tier_2_count, tier_3_count')
      .eq('paper_id', paperId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const updates: Record<string, number> = {
        question_count: ((existing as any).question_count || 0) + 1,
      };
      if (confidenceTier === 1) updates.tier_1_count = ((existing as any).tier_1_count || 0) + 1;
      if (confidenceTier === 2) updates.tier_2_count = ((existing as any).tier_2_count || 0) + 1;
      if (confidenceTier === 3) updates.tier_3_count = ((existing as any).tier_3_count || 0) + 1;
      await (supabase as any)
        .from('nexus_qb_paper_contributors')
        .update(updates)
        .eq('id', (existing as any).id);
    }
  }

  // Refresh paper stats
  await refreshPaperStats(paperId, supabase);

  return question as NexusQBQuestion;
}

/**
 * Refresh the denormalized contributor_summary on a paper.
 */
export async function refreshContributorSummary(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { data: contributors, error } = await (supabase as any)
    .from('nexus_qb_paper_contributors')
    .select('user_id, display_name, question_count, role')
    .eq('paper_id', paperId);
  if (error) throw error;

  const summary = (contributors || []).map((c: any) => ({
    user_id: c.user_id,
    name: c.display_name,
    question_count: c.question_count,
    tier: c.role === 'teacher' ? 1 : 2,
  }));

  await (supabase as any)
    .from('nexus_qb_original_papers')
    .update({ contributor_summary: summary })
    .eq('id', paperId);
}

/**
 * Refresh session_appearance_count on all topics.
 * Counts distinct sessions per topic across recalled paper questions.
 */
export async function refreshTopicSessionCounts(
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Get all recalled questions with their paper session
  const { data: questions, error: qError } = await supabase
    .from('nexus_qb_questions')
    .select('topic_id, original_paper_id')
    .not('confidence_tier', 'is', null)
    .not('topic_id', 'is', null);
  if (qError) throw qError;

  const paperIds = [...new Set((questions || []).map((q: any) => q.original_paper_id).filter(Boolean))];
  if (paperIds.length === 0) return;

  const { data: papers, error: pError } = await supabase
    .from('nexus_qb_original_papers')
    .select('id, session')
    .in('id', paperIds);
  if (pError) throw pError;

  const paperSessionMap = new Map<string, string>();
  for (const p of (papers || []) as any[]) {
    paperSessionMap.set(p.id, p.session || 'unknown');
  }

  // Count distinct sessions per topic
  const topicSessions = new Map<string, Set<string>>();
  for (const q of (questions || []) as any[]) {
    if (!q.topic_id || !q.original_paper_id) continue;
    if (!topicSessions.has(q.topic_id)) {
      topicSessions.set(q.topic_id, new Set());
    }
    const session = paperSessionMap.get(q.original_paper_id);
    if (session) topicSessions.get(q.topic_id)!.add(session);
  }

  // Update each topic
  for (const [topicId, sessions] of topicSessions) {
    await (supabase as any)
      .from('nexus_qb_topics')
      .update({ session_appearance_count: sessions.size })
      .eq('id', topicId);
  }
}
