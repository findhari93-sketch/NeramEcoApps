import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { expandQBCategorySlugs } from './qb-tags';
import { QB_SECTION_ORDER } from '../../types';
import type {
  QBQuestionSection,
  NexusQBPaperSectionRow,
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
  NexusQBOrigin,
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

  // Paginated fetch helper (Supabase limits to 1000 rows per request)
  async function fetchAll<T>(query: any): Promise<T[]> {
    const PAGE = 1000;
    let all: T[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await query.range(offset, offset + PAGE - 1);
      if (error) throw error;
      all = all.concat((data || []) as T[]);
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  }

  // Get all sources (paginated to handle >1000 rows)
  const data = await fetchAll<any>(
    supabase.from('nexus_qb_question_sources').select('exam_type, year, session, shift, question_id')
  );

  // Get all active question IDs (paginated)
  const activeQuestionIds = new Set<string>();
  const activeQ = await fetchAll<any>(
    supabase.from('nexus_qb_questions').select('id').eq('is_active', true).eq('status' as any, 'active')
  );
  for (const q of activeQ) {
    activeQuestionIds.add(q.id);
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
 *
 * Backed by the nexus_qb_category_counts RPC (see 20260801090100). This used to
 * build a SQL string and call a non-existent `exec_sql` RPC, which meant it
 * always failed over to the JS fallback below and silently truncated at
 * PostgREST's 1000-row default, under-reporting every count students saw.
 */
export async function getQBCategoryCounts(
  filters?: { exam_type?: QBExamType; source_year?: number; source_session?: string },
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();

  let session: string | null = null;
  let shift: string | null = null;
  if (filters?.source_session) {
    const parsed = parseSessionKey(filters.source_session);
    session = parsed.session;
    shift = parsed.shift || null;
  }

  const { data, error } = (await supabase.rpc('nexus_qb_category_counts' as any, {
    p_exam_type: filters?.exam_type ?? null,
    p_year: filters?.source_year ?? null,
    p_session: session,
    p_shift: shift,
  })) as any;

  if (error) {
    return getQBCategoryCountsFallback(filters, supabase);
  }

  // self_count only: the flat map is the per-chip count. Parent rollups are
  // consumed via getQBSubjectTagTree, which reads rollup_count from the same RPC.
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const n = Number(row.self_count) || 0;
    if (n > 0) counts[row.slug] = n;
  }
  return counts;
}

/**
 * Fallback: fetch categories for all matching questions and count client-side.
 *
 * Pages in 1000-row chunks. An unpaged select here silently stops at PostgREST's
 * default limit and returns counts that look plausible but are short, which is
 * exactly how the broken exec_sql path went unnoticed.
 */
async function getQBCategoryCountsFallback(
  filters?: { exam_type?: QBExamType; source_year?: number; source_session?: string },
  client?: TypedSupabaseClient
): Promise<Record<string, number>> {
  const supabase = client || getSupabaseAdminClient();

  const PAGE = 1000;
  async function fetchAll<T>(query: any): Promise<T[]> {
    let all: T[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await query.range(offset, offset + PAGE - 1);
      if (error) throw error;
      all = all.concat((data || []) as T[]);
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  }

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

    const sourceData = await fetchAll<any>(sourceQuery);
    questionIds = [...new Set(sourceData.map((s: any) => s.question_id))];
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

  const data = await fetchAll<any>(query);

  const counts: Record<string, number> = {};
  for (const row of data) {
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
 * Which questions appeared in a given exam sitting.
 *
 * `nexus_qb_question_sources` is the membership record, so "questions from JEE
 * 2014" is a lookup there and then an id filter, never a column on the question
 * itself. PostgREST cannot express the join inline, which is why this is a
 * separate round trip.
 *
 * Shared by the student and teacher list queries deliberately. The teacher one
 * used to accept these filters and silently drop them, so a teacher asking for
 * one paper got the whole bank back and no error to explain it.
 *
 * Returns null when no paper filter was asked for, and an empty array when one
 * was asked for and matched nothing. Callers must tell those apart.
 */
async function resolvePaperSourceIds(
  filters: Pick<QBFilterState, 'exam_type' | 'source_year' | 'source_session' | 'source_shift'>,
  supabase: TypedSupabaseClient,
): Promise<string[] | null> {
  if (!filters.exam_type) return null;

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

  const { data, error } = await sourceQuery;
  if (error) throw error;
  return [...new Set((data || []).map((s: any) => s.question_id))];
}

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
    // Parent slugs (coordinate_geometry, algebra, ...) are never written onto a
    // question, so expand them into their leaves. The client already does this;
    // repeating it here is idempotent and makes a hand-typed or bookmarked
    // ?cat=coordinate_geometry correct too. .overlaps is Postgres && (OR).
    query = query.overlaps('categories', await expandQBCategorySlugs(filters.categories, supabase));
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
  if (filters.origin && filters.origin.length > 0) {
    query = query.in('origin' as any, filters.origin);
  }

  // Source-based filters from sidebar (exam_type + source_year + source_session)
  const sourceFilteredIds = await resolvePaperSourceIds(filters, supabase);
  if (sourceFilteredIds !== null) {
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

  // Tag-based filter (managed registry). OR-semantics: question carries any selected tag.
  if (filters.tag_ids && filters.tag_ids.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from('nexus_qb_question_tags' as any)
      .select('question_id')
      .in('tag_id', filters.tag_ids);
    if (tagErr) throw tagErr;
    const tagFilteredIds = [...new Set((tagRows || []).map((r: any) => r.question_id))];
    if (tagFilteredIds.length === 0) {
      return { questions: [], total: 0 };
    }
    query = query.in('id', tagFilteredIds);
  }

  // Attempt-status filter, resolved into the query rather than applied to the
  // page afterwards.
  //
  // This used to filter `result` after pagination and then scale `total` by the
  // surviving ratio, which meant a student could see 3 rows while the pager
  // claimed 8 pages, and page 2 would re-filter a different slice. Turning it
  // into an id constraint before .range() makes both the rows and the count
  // exact.
  if (studentId && filters.attempt_status && filters.attempt_status !== 'all') {
    const attempted = new Set<string>();
    const everCorrect = new Set<string>();

    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('nexus_qb_student_attempts')
        .select('question_id, is_correct')
        .eq('student_id', studentId)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of (data || []) as any[]) {
        attempted.add(row.question_id);
        if (row.is_correct) everCorrect.add(row.question_id);
      }
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    if (filters.attempt_status === 'correct') {
      if (everCorrect.size === 0) return { questions: [], total: 0 };
      query = query.in('id', [...everCorrect]);
    } else if (filters.attempt_status === 'incorrect') {
      // Attempted at least once, never got it right.
      const wrongOnly = [...attempted].filter((id) => !everCorrect.has(id));
      if (wrongOnly.length === 0) return { questions: [], total: 0 };
      query = query.in('id', wrongOnly);
    } else if (filters.attempt_status === 'unattempted' && attempted.size > 0) {
      // A NOT IN list is only viable while it stays URL-sized. Past that the
      // filter is skipped rather than silently returning a wrong page, and the
      // caller still gets a correct (unfiltered) result set.
      if (attempted.size <= 2000) {
        query = query.not('id', 'in', `(${[...attempted].join(',')})`);
      } else {
        console.warn(
          `[QB] unattempted filter skipped: student ${studentId} has ${attempted.size} attempted questions`,
        );
      }
    }
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
  const result: NexusQBQuestionListItem[] = questions.map(q => ({
    ...q,
    sources: sourcesMap.get(q.id) || [],
    topic: q.topic_id ? topicMap.get(q.topic_id) || null : null,
    attempt_summary: attemptMap.get(q.id) || null,
  }));

  // attempt_status was already applied as an id constraint before pagination,
  // so `count` is exact and needs no adjustment.
  return { questions: result, total: count || 0 };
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
      // Self-assessed formats, always treated as correct.
      //
      // Nothing may reach here with a DRAWING_PROMPT any more: submitQBAttempt
      // refuses that format outright (see DRAWING_ATTEMPT_ERROR) because a
      // drawing is marked by a human in drawing_submissions, and answering
      // `true` here would have written is_correct = true for a sheet no teacher
      // had looked at. The arm stays so the hazard is visible at the call site
      // and so gradeQBAnswerStrict's contrast test keeps its subject.
      return true;

    default:
      return false;
  }
}

// ============================================
// STRICT GRADING (composed tests)
// ============================================

/** Formats a machine can actually mark. Everything else needs a human. */
const GRADABLE_FORMATS = new Set(['MCQ', 'NUMERICAL']);

/**
 * Normalise a question format to the bank's uppercase vocabulary.
 *
 * Legacy nexus_verified_questions rows carry `question_type` from a lowercase
 * CHECK ('mcq', 'true_false', 'short_answer', 'drawing', 'numerical'), and
 * getComposedTestQuestions passes whichever field it finds straight through. So
 * a legacy MCQ arrives here as 'mcq', falls through checkQBAnswer's `default`,
 * and is marked wrong no matter what the student picked.
 */
export function normaliseQuestionFormat(format: string | null | undefined): string {
  const raw = String(format || '').trim().toUpperCase();
  switch (raw) {
    case 'MCQ':
    case 'NUMERICAL':
    case 'IMAGE_BASED':
      return raw;
    case 'DRAWING':
    case 'DRAWING_PROMPT':
      return 'DRAWING_PROMPT';
    // true_false and short_answer have no machine answer key in this engine.
    default:
      return raw || 'MCQ';
  }
}

export function isGradableFormat(format: string | null | undefined): boolean {
  return GRADABLE_FORMATS.has(normaliseQuestionFormat(format));
}

/**
 * Whether this format has an answer key to wait for.
 *
 * A drawing prompt does not. It is finished the moment its prompt is parsed,
 * and treating "no answer yet" as "not ready" is what kept every drawing on
 * every past paper out of every test:
 *
 *   AnswerKeyGrid shows a drawing as "no key needed", so saveAnswerKey never
 *   sees it -> the row never leaves 'draft' -> bulkActivateQuestions only takes
 *   'complete' and 'answer_keyed' -> loadPaperQuestionIds only takes active.
 *
 * Nothing errored anywhere along that chain. JEE Paper 2 2006 just quietly
 * reported 90 of its 92 questions, and 43 drawings across 18 papers had never
 * appeared in a single generated mock.
 */
export function needsAnswerKey(format: string | null | undefined): boolean {
  return GRADABLE_FORMATS.has(normaliseQuestionFormat(format));
}

/** The status a freshly parsed question of this format should land at. */
export function parsedQuestionStatus(
  format: string | null | undefined,
  hasAnswer: boolean,
): QBQuestionStatus {
  if (!needsAnswerKey(format)) return 'complete';
  return hasAnswer ? 'answer_keyed' : 'draft';
}

/**
 * Grade one answer inside a composed test.
 *
 * Returns `null`, NEVER `true`, for anything a machine cannot mark. That is the
 * entire reason this exists rather than reusing checkQBAnswer, which returns
 * `true` unconditionally for DRAWING_PROMPT and IMAGE_BASED because single
 * question practice self-assesses. Reusing it in a graded test would hand full
 * marks to anyone who pressed submit.
 *
 * checkQBAnswer keeps its lenient behaviour: submitQBAttempt depends on it.
 */
export function gradeQBAnswerStrict(
  format: string | null | undefined,
  studentAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
  tolerance?: number | null,
): boolean | null {
  const fmt = normaliseQuestionFormat(format);
  if (!GRADABLE_FORMATS.has(fmt)) return null;
  if (studentAnswer == null || correctAnswer == null) return false;

  if (fmt === 'MCQ') {
    return studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
  }

  // NUMERICAL.
  const student = studentAnswer.trim();
  const correct = correctAnswer.trim();

  // Numeric comparison ONLY when both sides are numbers end to end.
  //
  // parseFloat stops at the first character it cannot use, so it reads '2:3' as 2
  // and '5cm' as 5. The bank genuinely contains NUMERICAL questions whose answer
  // is a ratio ('2:3' is a real row), and a leading-prefix parse would mark a
  // student who answered '2' correct for '2:3' while an exact '2:3' also passed,
  // so the error would never show up in a spot check.
  //
  // When either side is not fully numeric, fall back to comparing the text. That
  // is stricter than the old parseFloat path and never looser.
  if (isFullyNumeric(student) && isFullyNumeric(correct)) {
    const tol = Math.abs(Number(tolerance) || 0);
    // '3.0' matches '3', which the strict === this replaces got wrong. tolerance
    // null means exact numeric equality, not exact string equality.
    return Math.abs(Number(student) - Number(correct)) <= tol;
  }

  // Whitespace collapsed and case ignored, so '2 : 3' matches '2:3'. Tolerance is
  // meaningless here and is deliberately not applied.
  return normaliseFreeText(student) === normaliseFreeText(correct);
}

/** True when the WHOLE string is a finite number, not merely starts with one. */
function isFullyNumeric(value: string): boolean {
  if (value === '') return false;
  const n = Number(value);
  return Number.isFinite(n);
}

function normaliseFreeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * What submitQBAttempt throws when handed a drawing.
 *
 * Exported so the route can turn it into a 400 rather than a 500, and so a test
 * can assert on it without copying the sentence.
 */
export const DRAWING_ATTEMPT_ERROR =
  'Drawing questions are marked by a teacher and are not submitted here. Use the drawing attempt route instead.';

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

  // A drawing never comes through here. It has no answer key and never will,
  // so the guard below used to throw for every single one and practising a
  // drawing from the bank returned a 500.
  //
  // The check is on the FORMAT, not on the emptiness of correct_answer: the
  // paper workspace editor writes '' rather than null for a drawing, so a
  // truthiness test alone would still fire while letting a differently saved
  // row through to checkQBAnswer, which answers `true` unconditionally.
  if (normaliseQuestionFormat(q.question_format) === 'DRAWING_PROMPT') {
    throw new Error(DRAWING_ATTEMPT_ERROR);
  }

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
 * What a question parsed off a real paper counts as.
 *
 * Everything off a paper is 'pyq', drawings included. The 20260713180000
 * backfill rule used to exempt DRAWING_PROMPT on the theory that a drawing is
 * teacher-curated practice, but a drawing that arrived inside a past paper's
 * upload is as much a reproduced exam question as the MCQ above it. The exempt
 * rule left production with 145 drawings marked 'authored' and 0 marked 'pyq',
 * so the Source filter's "Previous year papers" hid every one of them.
 *
 * Exported for its test. The column defaults to 'authored', so getting this
 * wrong does not fail loudly, it just makes the Source filter call every newly
 * uploaded paper "written in-house" and nobody notices for months.
 */
export function originForParsedQuestion(_format: QBQuestionFormat): NexusQBOrigin {
  return 'pyq';
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
): Promise<{ created: number; withAnswers: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Build question inserts
  const questionInserts = questions.map((q) => {
    const answer = typeof q.correct_answer === 'string' ? q.correct_answer.trim() : '';
    return {
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
      correct_answer: answer || null,
      answer_tolerance: q.answer_tolerance ?? null,
      explanation_brief: q.explanation_brief || null,
      explanation_detailed: q.explanation_detailed || null,
      solution_video_url: q.solution_video_url || null,
      difficulty: 'MEDIUM' as QBDifficulty,
      exam_relevance: (examType === 'JEE_PAPER_2' ? 'JEE' : 'NATA') as QBExamRelevance,
      categories: q.categories,
      original_paper_id: paperId,
      origin: originForParsedQuestion(q.question_format),
      display_order: q.question_number,
      // The section the parser guessed, persisted rather than discarded. A
      // teacher corrects it in the paper workspace; nothing downstream has to
      // re-guess it from categories[0] ever again.
      section: q.section || null,
      section_order: q.section ? QB_SECTION_ORDER[q.section] ?? null : null,
      // Not always 'draft' any more. A drawing has no key to wait for, and a
      // question whose answer travelled in the same JSON has already got one,
      // so neither should sit in a queue nobody will come back to.
      status: parsedQuestionStatus(q.question_format, Boolean(answer)),
      nta_question_id: q.nta_question_id,
      is_active: false,
      created_by: createdBy,
      // Drawing-specific fields (only populated for DRAWING_PROMPT)
      ...(q.question_format === 'DRAWING_PROMPT' && {
        objects_to_include: q.drawing_objects
          ? q.drawing_objects.map((name: string) => ({ name }))
          : null,
        colour_constraint: q.drawing_color_constraint || null,
        design_principle_tested: q.drawing_design_principle || null,
      }),
    };
  });

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

  // Update paper stats.
  //
  // upload_status is no longer hardcoded to 'parsed'. Drawings land 'complete'
  // and a JSON carrying answers lands its questions 'answer_keyed', so the
  // status has to be derived from what actually went in rather than assumed.
  const count = createdQuestions?.length || 0;
  await supabase
    .from('nexus_qb_original_papers')
    .update({ total_questions: count } as any)
    .eq('id', paperId);
  await refreshPaperStats(paperId, supabase);

  const withAnswers = questionInserts.filter((q) => q.correct_answer).length;
  return { created: count, withAnswers };
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

/** A paper plus the per paper counts the management list draws. */
export interface NexusQBPaperWithBreakdown extends NexusQBOriginalPaper {
  /** Questions per category, falling back to question_format when untagged. */
  section_breakdown: Record<string, number>;
  active_count: number;
  hindi_count: number;
}

/**
 * Every paper with the counts its card needs, in two queries rather than 2N.
 *
 * The management list used to fetch each paper's full detail from the browser
 * to derive these, so two dozen papers meant two dozen requests, each hauling
 * back every question row to count them and throw them away. On a phone that is
 * the difference between a list that appears and one that arrives in pieces.
 */
export async function listOriginalPapersWithBreakdown(
  client?: TypedSupabaseClient
): Promise<NexusQBPaperWithBreakdown[]> {
  const supabase = client || getSupabaseAdminClient();

  const papers = await listOriginalPapers(supabase);
  if (papers.length === 0) return [];

  // Only the columns the counts need, for every paper at once.
  const { data: rows, error } = await supabase
    .from('nexus_qb_questions')
    .select('original_paper_id, categories, question_format, is_active, status, question_text_hi')
    .in('original_paper_id', papers.map((p) => p.id));
  if (error) throw error;

  return buildPaperBreakdowns(papers, (rows || []) as PaperBreakdownRow[]);
}

/** The columns `buildPaperBreakdowns` counts. */
export interface PaperBreakdownRow {
  original_paper_id: string | null;
  categories: string[] | null;
  question_format: string | null;
  is_active: boolean | null;
  status: string | null;
  question_text_hi: string | null;
}

/**
 * Roll question rows up into per paper counts.
 *
 * Pure, so the counting rules stay testable: an untagged question falls back to
 * its format, a question in two categories counts once in each, and "active"
 * means both the flag and the status agree.
 */
export function buildPaperBreakdowns(
  papers: NexusQBOriginalPaper[],
  rows: PaperBreakdownRow[],
): NexusQBPaperWithBreakdown[] {
  const byPaper = new Map<string, NexusQBPaperWithBreakdown>(
    papers.map((p) => [p.id, { ...p, section_breakdown: {}, active_count: 0, hindi_count: 0 }])
  );

  for (const q of rows) {
    const entry = q.original_paper_id ? byPaper.get(q.original_paper_id) : undefined;
    if (!entry) continue;

    const keys = q.categories && q.categories.length > 0
      ? q.categories
      : [q.question_format || 'OTHER'];
    for (const key of keys) {
      entry.section_breakdown[key] = (entry.section_breakdown[key] || 0) + 1;
    }

    if (q.is_active && q.status === 'active') entry.active_count++;
    if (q.question_text_hi) entry.hindi_count++;
  }

  return papers.map((p) => byPaper.get(p.id)!);
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
  filters: QBFilterState & { status?: QBQuestionStatus[]; includeUsage?: boolean },
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
    // Parent slugs (coordinate_geometry, algebra, ...) are never written onto a
    // question, so expand them into their leaves. The client already does this;
    // repeating it here is idempotent and makes a hand-typed or bookmarked
    // ?cat=coordinate_geometry correct too. .overlaps is Postgres && (OR).
    query = query.overlaps('categories', await expandQBCategorySlugs(filters.categories, supabase));
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
  if (filters.origin && filters.origin.length > 0) {
    query = query.in('origin' as any, filters.origin);
  }

  // Which paper the question came from. The API has always parsed these; until
  // now this function ignored them, so "show me JEE 2014" quietly returned the
  // entire bank.
  const sourceFilteredIds = await resolvePaperSourceIds(filters, supabase);
  if (sourceFilteredIds !== null) {
    if (sourceFilteredIds.length === 0) {
      return { questions: [], total: 0 };
    }
    query = query.in('id', sourceFilteredIds);
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

  // Tag-based filter (managed registry). OR-semantics: question carries any selected tag.
  if (filters.tag_ids && filters.tag_ids.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from('nexus_qb_question_tags' as any)
      .select('question_id')
      .in('tag_id', filters.tag_ids);
    if (tagErr) throw tagErr;
    const tagFilteredIds = [...new Set((tagRows || []).map((r: any) => r.question_id))];
    if (tagFilteredIds.length === 0) {
      return { questions: [], total: 0 };
    }
    query = query.in('id', tagFilteredIds);
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

  // Fetch managed registry tags for the page (shown as chips in the teacher list).
  const { data: tagLinks } = await supabase
    .from('nexus_qb_question_tags' as any)
    .select('question_id, tag_id')
    .in('question_id', questionIds);
  const linkTagIds = [...new Set((tagLinks || []).map((r: any) => r.tag_id))];
  const tagInfoMap = new Map<string, any>();
  if (linkTagIds.length > 0) {
    const { data: tagRows } = await supabase
      .from('nexus_qb_tags' as any)
      .select('id, label, slug, group_type, color')
      .in('id', linkTagIds);
    for (const t of (tagRows || []) as any[]) tagInfoMap.set(t.id, t);
  }
  const tagsByQuestion = new Map<string, any[]>();
  for (const link of (tagLinks || []) as any[]) {
    const tag = tagInfoMap.get(link.tag_id);
    if (!tag) continue;
    if (!tagsByQuestion.has(link.question_id)) tagsByQuestion.set(link.question_id, []);
    tagsByQuestion.get(link.question_id)!.push(tag);
  }

  // How many tests already use each question on this page. One batched query
  // scoped to the page, never the whole bank: the chip only has to be right for
  // the rows a teacher can actually see.
  //
  // Counted from nexus_test_questions rather than from a column, because no
  // counter column exists. That also means "unused first" cannot be an ORDER BY
  // and is deliberately not offered: sorting a page by data fetched after the
  // page would reorder within the page only, which reads as a working sort and
  // is not one.
  const usageMap = new Map<string, number>();
  if (filters.includeUsage) {
    const { data: usageRows, error: usageErr } = await supabase
      .from('nexus_test_questions')
      .select('qb_question_id')
      .in('qb_question_id', questionIds);
    if (usageErr) throw usageErr;
    for (const row of (usageRows || []) as any[]) {
      const id = row.qb_question_id as string | null;
      if (id) usageMap.set(id, (usageMap.get(id) || 0) + 1);
    }
  }

  const result: NexusQBQuestionListItem[] = questions.map((q) => ({
    ...q,
    sources: sourcesMap.get(q.id) || [],
    topic: q.topic_id ? topicMap.get(q.topic_id) || null : null,
    attempt_summary: null,
    tags: tagsByQuestion.get(q.id) || [],
    // Absent, not zero, when nobody asked. Zero is a real answer meaning
    // "unused", and a caller that did not request usage must not read one.
    ...(filters.includeUsage ? { used_in_tests: usageMap.get(q.id) || 0 } : {}),
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
    .select('section, categories, question_format')
    .eq('original_paper_id', paperId);
  if (error) throw error;

  const breakdown: Record<string, number> = {};
  for (const q of (data || []) as any[]) {
    // The persisted section is the answer when it exists. It counts a question
    // exactly once, which the categories fallback below cannot: a question
    // tagged ['mathematics','trigonometry'] lands in two buckets there, so the
    // old breakdown could total more than the paper had questions.
    if (q.section) {
      breakdown[q.section] = (breakdown[q.section] || 0) + 1;
      continue;
    }

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

/**
 * Every question of a paper with the section it currently sits in.
 *
 * Ordered the way the paper is sat: sections in section_order, questions in
 * display_order within them. Nulls sort last, so a question nobody has
 * classified yet is visible at the bottom rather than silently first.
 */
export async function getPaperSections(
  paperId: string,
  client?: TypedSupabaseClient
): Promise<NexusQBPaperSectionRow[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, display_order, question_format, section, section_order')
    .eq('original_paper_id', paperId)
    .order('section_order', { ascending: true, nullsFirst: false })
    .order('display_order', { ascending: true, nullsFirst: false });
  if (error) throw error;

  return (data || []).map((q: any) => ({
    id: q.id,
    question_number: q.display_order ?? null,
    question_format: q.question_format,
    section: q.section ?? null,
    section_order: q.section_order ?? null,
  }));
}

/**
 * Set the section on specific questions of a paper.
 *
 * section_order is derived here from QB_SECTION_ORDER rather than accepted from
 * the caller, so a teacher can never save a paper whose sections claim an order
 * the rest of the system does not agree with. Passing section: null clears it.
 *
 * Scoped by paperId on every update: a stray question id from another paper
 * cannot be relabelled through this route.
 */
export async function setQuestionSections(
  paperId: string,
  updates: Array<{ question_id: string; section: QBQuestionSection | null }>,
  client?: TypedSupabaseClient
): Promise<{ updated: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (updates.length === 0) return { updated: 0 };

  // Group by target section so this is one statement per distinct section
  // rather than one per question. A 77-question paper is at most 5 writes.
  const bySection = new Map<string, string[]>();
  for (const u of updates) {
    const key = u.section ?? '__null__';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(u.question_id);
  }

  let updated = 0;
  for (const [key, questionIds] of bySection) {
    const section = key === '__null__' ? null : (key as QBQuestionSection);
    const { data, error } = await supabase
      .from('nexus_qb_questions')
      .update({
        section,
        section_order: section ? QB_SECTION_ORDER[section] ?? null : null,
      } as any)
      .eq('original_paper_id', paperId)
      .in('id', questionIds)
      .select('id');
    if (error) throw error;
    updated += (data || []).length;
  }

  return { updated };
}

/** One question as the section classifier sees it. */
export interface NexusQBSectionCandidate {
  id: string;
  question_number: number | null;
  question_format: QBQuestionFormat;
  question_text: string | null;
  options: { text?: string | null }[] | null;
}

/**
 * Re-run the section guess over a whole paper.
 *
 * The classifier is injected and sees the WHOLE paper at once, not one question
 * at a time. That is the difference between a rule that can only look at a
 * question's number and one that can read the questions and find where maths
 * stops and aptitude starts, which is what a paper laid out differently from
 * the current JEE pattern needs.
 *
 * `onlyUnset` is the safe default: a teacher who has already corrected sections
 * by hand does not want a button that quietly undoes that work. A classifier
 * that returns null for a question means "I cannot tell", and is skipped rather
 * than allowed to clear a section, so even overwrite: true can only ever
 * replace a guess with another guess.
 */
export async function reclassifyPaperSections(
  paperId: string,
  classify: (
    questions: NexusQBSectionCandidate[]
  ) => Array<{ id: string; section: QBQuestionSection | null }>,
  opts?: { onlyUnset?: boolean },
  client?: TypedSupabaseClient
): Promise<{ updated: number; skipped: number; unresolved: number }> {
  const supabase = client || getSupabaseAdminClient();
  const onlyUnset = opts?.onlyUnset !== false;

  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, display_order, question_format, section, question_text, options')
    .eq('original_paper_id', paperId);
  if (error) throw error;

  const rows = (data || []) as any[];

  // The classifier is handed every question, including ones already sectioned,
  // because the boundary between two sections can only be found by looking at
  // the whole paper. onlyUnset then decides what is actually written.
  const verdicts = classify(
    rows.map((q, i) => ({
      id: q.id as string,
      // A question with no display_order still needs a position. Its position
      // in the fetched set is a worse answer than a real question number but a
      // far better one than treating every such question as Q0.
      question_number: (q.display_order as number | null) ?? i + 1,
      question_format: q.question_format as QBQuestionFormat,
      question_text: (q.question_text as string | null) ?? null,
      options: (q.options as { text?: string | null }[] | null) ?? null,
    }))
  );

  const alreadySectioned = new Set(rows.filter((q) => q.section).map((q) => q.id as string));
  let skipped = 0;
  let unresolved = 0;
  const updates: Array<{ question_id: string; section: QBQuestionSection }> = [];

  for (const verdict of verdicts) {
    if (onlyUnset && alreadySectioned.has(verdict.id)) {
      skipped++;
      continue;
    }
    if (!verdict.section) {
      unresolved++;
      continue;
    }
    updates.push({ question_id: verdict.id, section: verdict.section });
  }

  const { updated } = await setQuestionSections(paperId, updates, supabase);
  return { updated, skipped, unresolved };
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
      // A question a student remembered, whoever later verified it. This stays
      // 'student_recalled' even at tier 1, because `answer_source` above already
      // records who confirmed the answer; origin records where it came from, and
      // a teacher checking a recalled question does not turn it into a scan of
      // the real paper.
      origin: 'student_recalled' as NexusQBOrigin,
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

// ============================================================
// Drawing <-> QB Bridge Helpers
// ============================================================

/**
 * Get the linked drawing_questions.id for a QB DRAWING_PROMPT question.
 * Used by the "Practice" button in QB to navigate to the drawing module.
 */
export async function getLinkedDrawingQuestionId(
  qbQuestionId: string,
  client?: TypedSupabaseClient
): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('drawing_questions')
    .select('id')
    .eq('qb_question_id', qbQuestionId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data?.id || null;
}

/**
 * Create a drawing_questions row from an activated QB DRAWING_PROMPT question.
 * Maps QB fields to drawing_questions fields and sets the qb_question_id link.
 * Returns the new drawing_questions.id.
 */
export async function createDrawingQuestionFromQB(
  qbQuestionId: string,
  client?: TypedSupabaseClient
): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();

  // Get the QB question
  const { data: qbQ, error: qbError } = await (supabase as any)
    .from('nexus_qb_questions')
    .select('*')
    .eq('id', qbQuestionId)
    .eq('question_format', 'DRAWING_PROMPT')
    .single();

  if (qbError || !qbQ) return null;

  // Check if already linked
  const { data: existing } = await (supabase as any)
    .from('drawing_questions')
    .select('id')
    .eq('qb_question_id', qbQuestionId)
    .single();

  if (existing) return existing.id;

  // Get the year from question_sources
  const { data: sources } = await (supabase as any)
    .from('nexus_qb_question_sources')
    .select('year, question_number')
    .eq('question_id', qbQuestionId)
    .order('year', { ascending: false })
    .limit(1);

  const year = sources?.[0]?.year || new Date().getFullYear();
  const questionNumber = sources?.[0]?.question_number || null;

  // Map QB categories to drawing category
  const categories: string[] = qbQ.categories || [];
  let category = '2d_composition';
  if (categories.includes('3d_composition')) category = '3d_composition';
  else if (categories.includes('kit_sculpture')) category = 'kit_sculpture';
  else if (categories.includes('2d_composition')) category = '2d_composition';

  // Map QB objects_to_include to string array
  const objects: string[] = (qbQ.objects_to_include || []).map((o: any) => o.name || String(o));

  // Map difficulty
  const difficultyMap: Record<string, string> = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };
  const difficulty = difficultyMap[qbQ.difficulty] || 'medium';

  // Insert drawing_questions row
  const { data: newDQ, error: insertError } = await (supabase as any)
    .from('drawing_questions')
    .insert({
      year,
      category,
      sub_type: category, // default sub_type to category
      question_text: qbQ.question_text,
      objects,
      color_constraint: qbQ.colour_constraint || null,
      design_principle: qbQ.design_principle_tested || null,
      difficulty_tag: difficulty,
      tags: [],
      reference_images: [],
      solution_images: null,
      is_active: true,
      qb_question_id: qbQuestionId,
      question_number: questionNumber,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;
  return newDQ?.id || null;
}
