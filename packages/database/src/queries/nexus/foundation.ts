import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusFoundationChapter,
  NexusFoundationChapterWithProgress,
  NexusFoundationSection,
  NexusFoundationQuizQuestion,
  NexusFoundationStudentProgress,
  NexusFoundationQuizAttempt,
  NexusFoundationStudentNote,
  NexusFoundationSectionWithQuiz,
  FoundationChapterStatus,
  NexusFoundationReaction,
  NexusFoundationReactionCounts,
  NexusFoundationIssue,
  NexusFoundationIssueWithDetails,
  NexusFoundationIssueActivity,
  FoundationReactionType,
  FoundationIssueStatus,
  FoundationIssueAction,
  FoundationIssuePriority,
  FoundationIssueCategory,
  NexusFoundationTranscript,
  TranscriptEntry,
  NexusFoundationWatchSessionUpsert,
} from '../../types';

// ============================================
// CHAPTER QUERIES
// ============================================

export async function getFoundationChapters(client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_chapters')
    .select('*')
    .eq('is_published', true)
    .order('chapter_number', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusFoundationChapter[];
}

export async function getFoundationChaptersWithProgress(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationChapterWithProgress[]> {
  const supabase = client || getSupabaseAdminClient();

  // Get all published chapters
  const { data: chapters, error: chaptersError } = await supabase
    .from('nexus_foundation_chapters')
    .select('*')
    .eq('is_published', true)
    .order('chapter_number', { ascending: true });
  if (chaptersError) throw chaptersError;

  // Get student's progress for all chapters
  const { data: progressRows, error: progressError } = await supabase
    .from('nexus_foundation_student_progress')
    .select('*')
    .eq('student_id', studentId);
  if (progressError) throw progressError;

  // Get section counts per chapter
  const { data: sections, error: sectionsError } = await supabase
    .from('nexus_foundation_sections')
    .select('id, chapter_id');
  if (sectionsError) throw sectionsError;

  // Get passed quiz attempts per section for this student
  const { data: passedAttempts, error: attemptsError } = await supabase
    .from('nexus_foundation_quiz_attempts')
    .select('section_id')
    .eq('student_id', studentId)
    .eq('passed', true);
  if (attemptsError) throw attemptsError;

  const progressMap = new Map(
    (progressRows || []).map((p: any) => [p.chapter_id, p])
  );
  const passedSectionIds = new Set(
    (passedAttempts || []).map((a: any) => a.section_id)
  );

  // Count sections and completed sections per chapter
  const sectionCountMap = new Map<string, number>();
  const completedSectionMap = new Map<string, number>();

  for (const section of (sections || []) as any[]) {
    const chapterId = section.chapter_id;
    sectionCountMap.set(chapterId, (sectionCountMap.get(chapterId) || 0) + 1);
    if (passedSectionIds.has(section.id)) {
      completedSectionMap.set(chapterId, (completedSectionMap.get(chapterId) || 0) + 1);
    }
  }

  // Build result with unlocking logic
  const result: NexusFoundationChapterWithProgress[] = [];
  let previousCompleted = true; // Chapter 1 is always unlocked

  for (const chapter of (chapters || []) as NexusFoundationChapter[]) {
    const progress = progressMap.get(chapter.id) as NexusFoundationStudentProgress | undefined;
    const sectionCount = sectionCountMap.get(chapter.id) || 0;
    const completedSections = completedSectionMap.get(chapter.id) || 0;

    let status: FoundationChapterStatus;
    if (progress) {
      status = progress.status as FoundationChapterStatus;
    } else if (previousCompleted) {
      status = 'in_progress';
    } else {
      status = 'locked';
    }

    result.push({
      ...chapter,
      progress: progress || null,
      section_count: sectionCount,
      completed_sections: completedSections,
    });

    previousCompleted = status === 'completed';
  }

  return result;
}

export async function getFoundationChapterDetail(
  chapterId: string,
  studentId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get chapter
  const { data: chapter, error: chapterError } = await supabase
    .from('nexus_foundation_chapters')
    .select('*')
    .eq('id', chapterId)
    .single();
  if (chapterError) throw chapterError;

  // Get sections with quiz questions
  const { data: sections, error: sectionsError } = await supabase
    .from('nexus_foundation_sections')
    .select('*, quiz_questions:nexus_foundation_quiz_questions(*)')
    .eq('chapter_id', chapterId)
    .order('sort_order', { ascending: true });
  if (sectionsError) throw sectionsError;

  let enrichedSections: NexusFoundationSectionWithQuiz[] = (sections || []).map((s: any) => ({
    ...s,
    quiz_questions: (s.quiz_questions || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    quiz_attempt: null,
    note: null,
  }));

  // If studentId provided, fetch their quiz attempts and notes
  if (studentId) {
    const sectionIds = enrichedSections.map(s => s.id);

    // Get latest passed attempt per section
    const { data: attempts } = await supabase
      .from('nexus_foundation_quiz_attempts')
      .select('*')
      .eq('student_id', studentId)
      .in('section_id', sectionIds)
      .order('attempt_number', { ascending: false });

    // Get notes
    const { data: notes } = await supabase
      .from('nexus_foundation_student_notes')
      .select('*')
      .eq('student_id', studentId)
      .in('section_id', sectionIds);

    const attemptMap = new Map<string, any>();
    for (const attempt of (attempts || []) as any[]) {
      // Keep only the latest attempt per section
      if (!attemptMap.has(attempt.section_id)) {
        attemptMap.set(attempt.section_id, attempt);
      }
    }

    const noteMap = new Map(
      (notes || []).map((n: any) => [n.section_id, n])
    );

    enrichedSections = enrichedSections.map(s => ({
      ...s,
      quiz_attempt: attemptMap.get(s.id) || null,
      note: noteMap.get(s.id) || null,
    }));
  }

  // Get student progress for this chapter
  let progress: NexusFoundationStudentProgress | null = null;
  if (studentId) {
    const { data: progressData } = await supabase
      .from('nexus_foundation_student_progress')
      .select('*')
      .eq('student_id', studentId)
      .eq('chapter_id', chapterId)
      .single();
    progress = progressData as NexusFoundationStudentProgress | null;
  }

  return {
    chapter: chapter as NexusFoundationChapter,
    sections: enrichedSections,
    progress,
  };
}

// ============================================
// PROGRESS QUERIES
// ============================================

export async function upsertChapterProgress(
  studentId: string,
  chapterId: string,
  data: {
    status?: FoundationChapterStatus;
    last_section_id?: string;
    last_video_position_seconds?: number;
    started_at?: string;
    completed_at?: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: progress, error } = await supabase
    .from('nexus_foundation_student_progress')
    .upsert(
      {
        student_id: studentId,
        chapter_id: chapterId,
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,chapter_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return progress as NexusFoundationStudentProgress;
}

export async function getStudentFoundationProgress(
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_student_progress')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw error;
  return (data || []) as NexusFoundationStudentProgress[];
}

// ============================================
// QUIZ QUERIES
// ============================================

export async function getSectionQuizQuestions(
  sectionId: string,
  includeAnswers = false,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const selectFields = includeAnswers
    ? '*'
    : 'id, section_id, question_text, option_a, option_b, option_c, option_d, sort_order';

  const { data, error } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select(selectFields)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as NexusFoundationQuizQuestion[];
}

export async function submitQuizAttempt(
  studentId: string,
  sectionId: string,
  answers: Record<string, string>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get correct answers
  const { data: questions, error: questionsError } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select('id, correct_option')
    .eq('section_id', sectionId);
  if (questionsError) throw questionsError;

  if (!questions || questions.length === 0) {
    throw new Error('No quiz questions found for this section');
  }

  // Grade
  let correct = 0;
  for (const q of questions as any[]) {
    if (answers[q.id] === q.correct_option) {
      correct++;
    }
  }
  const scorePct = Math.round((correct / questions.length) * 100);

  // Get section to find chapter and per-section pass criteria
  const { data: section, error: sectionError } = await supabase
    .from('nexus_foundation_sections')
    .select('chapter_id, min_questions_to_pass')
    .eq('id', sectionId)
    .single();
  if (sectionError) throw sectionError;

  // Per-section pass criteria: null/0 means all questions must be correct
  const minToPass = (section as any).min_questions_to_pass || questions.length;
  const passed = correct >= minToPass;

  // Get attempt number
  const { count } = await supabase
    .from('nexus_foundation_quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('section_id', sectionId);

  const attemptNumber = (count || 0) + 1;

  // Record attempt
  const { data: attempt, error: attemptError } = await supabase
    .from('nexus_foundation_quiz_attempts')
    .insert({
      student_id: studentId,
      section_id: sectionId,
      score_pct: scorePct,
      answers,
      passed,
      attempt_number: attemptNumber,
    })
    .select()
    .single();
  if (attemptError) throw attemptError;

  // If passed, check if all sections in this chapter are now completed
  if (passed) {
    await checkAndCompleteChapter(studentId, (section as any).chapter_id, supabase);
  }

  // Get full questions with explanations for response
  const { data: fullQuestions } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select('*')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });

  return {
    attempt: attempt as NexusFoundationQuizAttempt,
    questions: (fullQuestions || []) as NexusFoundationQuizQuestion[],
    score_pct: scorePct,
    passed,
    correct_count: correct,
    total_count: questions.length,
    min_questions_to_pass: minToPass,
  };
}

async function checkAndCompleteChapter(
  studentId: string,
  chapterId: string,
  supabase: TypedSupabaseClient
) {
  // Get all sections for this chapter
  const { data: sections } = await supabase
    .from('nexus_foundation_sections')
    .select('id')
    .eq('chapter_id', chapterId);

  if (!sections || sections.length === 0) return;

  // Check if all sections have a passing attempt
  const { data: passedAttempts } = await supabase
    .from('nexus_foundation_quiz_attempts')
    .select('section_id')
    .eq('student_id', studentId)
    .eq('passed', true)
    .in('section_id', sections.map((s: any) => s.id));

  const passedSectionIds = new Set((passedAttempts || []).map((a: any) => a.section_id));
  const allPassed = sections.every((s: any) => passedSectionIds.has(s.id));

  if (allPassed) {
    // Mark chapter as completed
    await supabase
      .from('nexus_foundation_student_progress')
      .upsert(
        {
          student_id: studentId,
          chapter_id: chapterId,
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,chapter_id' }
      );
  }
}

// ============================================
// NOTES QUERIES
// ============================================

export async function upsertStudentNote(
  studentId: string,
  sectionId: string,
  noteText: string,
  videoTimestampSeconds?: number,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_student_notes')
    .upsert(
      {
        student_id: studentId,
        section_id: sectionId,
        note_text: noteText,
        video_timestamp_seconds: videoTimestampSeconds ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,section_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as NexusFoundationStudentNote;
}

export async function getStudentNotes(
  studentId: string,
  chapterId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get section IDs for this chapter
  const { data: sections } = await supabase
    .from('nexus_foundation_sections')
    .select('id')
    .eq('chapter_id', chapterId);

  if (!sections || sections.length === 0) return [];

  const { data, error } = await supabase
    .from('nexus_foundation_student_notes')
    .select('*')
    .eq('student_id', studentId)
    .in('section_id', sections.map((s: any) => s.id));
  if (error) throw error;
  return (data || []) as NexusFoundationStudentNote[];
}

// ============================================
// TEACHER / ADMIN DASHBOARD QUERIES
// ============================================

export async function getFoundationDashboard(
  filters?: { classroom_id?: string; batch_id?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all students (optionally filtered by classroom/batch)
  let studentQuery = supabase
    .from('nexus_enrollments')
    .select('user_id, users:users!nexus_enrollments_user_id_fkey!inner(id, name, email, avatar_url)')
    .eq('role', 'student')
    .eq('is_active', true);

  if (filters?.classroom_id) {
    studentQuery = studentQuery.eq('classroom_id', filters.classroom_id);
  }
  if (filters?.batch_id) {
    studentQuery = studentQuery.eq('batch_id', filters.batch_id);
  }

  const { data: enrollments, error: enrollError } = await studentQuery;
  if (enrollError) throw enrollError;

  // Deduplicate students (may be enrolled in multiple classrooms)
  const studentMap = new Map<string, any>();
  for (const e of (enrollments || []) as any[]) {
    if (!studentMap.has(e.user_id)) {
      studentMap.set(e.user_id, e.users);
    }
  }

  const studentIds = Array.from(studentMap.keys());
  if (studentIds.length === 0) return [];

  // Get all progress rows for these students
  const { data: progressRows } = await supabase
    .from('nexus_foundation_student_progress')
    .select('*')
    .in('student_id', studentIds);

  // Get total chapter count
  const { count: totalChapters } = await supabase
    .from('nexus_foundation_chapters')
    .select('id', { count: 'exact', head: true })
    .eq('is_published', true);

  // Group progress by student
  const progressByStudent = new Map<string, any[]>();
  for (const p of (progressRows || []) as any[]) {
    if (!progressByStudent.has(p.student_id)) {
      progressByStudent.set(p.student_id, []);
    }
    progressByStudent.get(p.student_id)!.push(p);
  }

  // Build dashboard rows
  return studentIds.map(studentId => {
    const student = studentMap.get(studentId);
    const progress = progressByStudent.get(studentId) || [];
    const completedCount = progress.filter((p: any) => p.status === 'completed').length;
    const inProgressChapter = progress.find((p: any) => p.status === 'in_progress');
    const lastActivity = progress.reduce((latest: string | null, p: any) => {
      if (!latest || p.updated_at > latest) return p.updated_at;
      return latest;
    }, null);

    return {
      student,
      completed_chapters: completedCount,
      total_chapters: totalChapters || 10,
      current_chapter: inProgressChapter || null,
      last_activity: lastActivity,
    };
  });
}

export async function getStudentFoundationDetail(
  studentId: string,
  client?: TypedSupabaseClient
) {
  // Reuse the existing function
  return getFoundationChaptersWithProgress(studentId, client);
}

// ============================================
// REACTIONS (like/dislike)
// ============================================

export async function getChapterReaction(
  studentId: string,
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationReaction | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from('nexus_foundation_reactions')
    .select('*')
    .eq('student_id', studentId)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  return data as unknown as NexusFoundationReaction | null;
}

export async function upsertChapterReaction(
  studentId: string,
  chapterId: string,
  reaction: FoundationReactionType,
  client?: TypedSupabaseClient
): Promise<NexusFoundationReaction> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_reactions')
    .upsert(
      { student_id: studentId, chapter_id: chapterId, reaction, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,chapter_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as unknown as NexusFoundationReaction;
}

export async function removeChapterReaction(
  studentId: string,
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase
    .from('nexus_foundation_reactions')
    .delete()
    .eq('student_id', studentId)
    .eq('chapter_id', chapterId);
}

// ============================================
// REACTION COUNTS (for chapter feedback stats)
// ============================================

export async function getChapterReactionCounts(
  chapterIds: string[],
  client?: TypedSupabaseClient
): Promise<NexusFoundationReactionCounts[]> {
  if (chapterIds.length === 0) return [];
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_reactions')
    .select('chapter_id, reaction')
    .in('chapter_id', chapterIds);
  if (error) throw error;

  const countsMap = new Map<string, { like_count: number; dislike_count: number }>();
  for (const id of chapterIds) {
    countsMap.set(id, { like_count: 0, dislike_count: 0 });
  }
  for (const row of data || []) {
    const entry = countsMap.get(row.chapter_id);
    if (entry) {
      if (row.reaction === 'like') entry.like_count++;
      else if (row.reaction === 'dislike') entry.dislike_count++;
    }
  }
  return chapterIds.map(id => ({
    chapter_id: id,
    ...(countsMap.get(id) || { like_count: 0, dislike_count: 0 }),
  }));
}

export async function getSingleChapterReactionCounts(
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<{ like_count: number; dislike_count: number }> {
  const results = await getChapterReactionCounts([chapterId], client);
  return results[0] || { like_count: 0, dislike_count: 0 };
}

export async function getChapterReactionDetails(
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<Array<{ student_id: string; student_name: string; reaction: string; created_at: string }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_reactions')
    .select('student_id, reaction, created_at, student:users!nexus_foundation_reactions_student_id_fkey(name)')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    student_id: row.student_id,
    student_name: row.student?.name || 'Unknown',
    reaction: row.reaction,
    created_at: row.created_at,
  }));
}

// ============================================
// ISSUE REPORTS
// ============================================

const ISSUE_SELECT_WITH_DETAILS = `
  *,
  student:users!nexus_foundation_issues_student_id_fkey(name, avatar_url),
  chapter:nexus_foundation_chapters!nexus_foundation_issues_chapter_id_fkey(title, chapter_number),
  section:nexus_foundation_sections!nexus_foundation_issues_section_id_fkey(title),
  resolver:users!nexus_foundation_issues_resolved_by_fkey(name),
  assignee:users!nexus_foundation_issues_assigned_to_fkey(name),
  assigner:users!nexus_foundation_issues_assigned_by_fkey(name)
`;

function mapIssueRow(row: any): NexusFoundationIssueWithDetails {
  return {
    ...row,
    student_name: row.student?.name || 'Unknown',
    student_avatar: row.student?.avatar_url || null,
    chapter_title: row.chapter?.title || '',
    chapter_number: row.chapter?.chapter_number || 0,
    section_title: row.section?.title || null,
    resolved_by_name: row.resolver?.name || null,
    assigned_to_name: row.assignee?.name || null,
    assigned_by_name: row.assigner?.name || null,
    student: undefined,
    chapter: undefined,
    section: undefined,
    resolver: undefined,
    assignee: undefined,
    assigner: undefined,
  };
}

export async function createFoundationIssue(
  data: {
    student_id: string;
    chapter_id?: string;
    section_id?: string;
    title: string;
    description: string;
    category?: FoundationIssueCategory;
    page_url?: string;
    screenshot_urls?: string[];
  },
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data: issue, error } = await supabase
    .from('nexus_foundation_issues')
    .insert({
      student_id: data.student_id,
      chapter_id: data.chapter_id || null,
      section_id: data.section_id || null,
      title: data.title,
      description: data.description,
      category: data.category || 'other',
      page_url: data.page_url || null,
      screenshot_urls: data.screenshot_urls || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Log the creation activity
  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issue.id,
    actor_id: data.student_id,
    action: 'created',
    new_status: 'open',
  });

  return issue as unknown as NexusFoundationIssue;
}

export async function getStudentFoundationIssues(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssueWithDetails[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .select(ISSUE_SELECT_WITH_DETAILS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapIssueRow);
}

export async function getAllFoundationIssues(
  filters?: { status?: FoundationIssueStatus; assigned_to?: string },
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssueWithDetails[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('nexus_foundation_issues')
    .select(ISSUE_SELECT_WITH_DETAILS)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapIssueRow);
}

export async function getFoundationIssueById(
  issueId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssueWithDetails> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .select(ISSUE_SELECT_WITH_DETAILS)
    .eq('id', issueId)
    .single();
  if (error) throw error;
  return mapIssueRow(data);
}

export async function assignFoundationIssue(
  issueId: string,
  assignedTo: string,
  assignedBy: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
      status: 'in_progress' as FoundationIssueStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: assignedBy,
    action: 'assigned',
    target_user_id: assignedTo,
    old_status: 'open',
    new_status: 'in_progress',
  });

  return data as unknown as NexusFoundationIssue;
}

export async function delegateFoundationIssue(
  issueId: string,
  delegatedTo: string,
  delegatedBy: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      assigned_to: delegatedTo,
      assigned_by: delegatedBy,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: delegatedBy,
    action: 'delegated',
    target_user_id: delegatedTo,
    reason,
  });

  return data as unknown as NexusFoundationIssue;
}

export async function returnFoundationIssue(
  issueId: string,
  returnedBy: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      assigned_to: null,
      assigned_by: null,
      assigned_at: null,
      status: 'open' as FoundationIssueStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: returnedBy,
    action: 'returned',
    reason,
    old_status: 'in_progress',
    new_status: 'open',
  });

  return data as unknown as NexusFoundationIssue;
}

export async function resolveFoundationIssue(
  issueId: string,
  resolvedBy: string,
  resolutionNote: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const autoCloseAt = new Date();
  autoCloseAt.setDate(autoCloseAt.getDate() + 3);

  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'awaiting_confirmation' as FoundationIssueStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote,
      auto_close_at: autoCloseAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: resolvedBy,
    action: 'resolved',
    old_status: 'in_progress',
    new_status: 'awaiting_confirmation',
    reason: resolutionNote,
  });

  return data as unknown as NexusFoundationIssue;
}

export async function confirmFoundationIssue(
  issueId: string,
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'closed' as FoundationIssueStatus,
      auto_close_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: studentId,
    action: 'confirmed',
    old_status: 'awaiting_confirmation',
    new_status: 'closed',
  });

  return data as unknown as NexusFoundationIssue;
}

export async function reopenFoundationIssue(
  issueId: string,
  studentId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'open' as FoundationIssueStatus,
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
      auto_close_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: studentId,
    action: 'reopened',
    old_status: 'awaiting_confirmation',
    new_status: 'open',
    reason,
  });

  return data as unknown as NexusFoundationIssue;
}

export async function cleanupIssueScreenshots(
  issueId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { data: issue } = await supabase
    .from('nexus_foundation_issues')
    .select('screenshot_urls')
    .eq('id', issueId)
    .single();

  if (issue?.screenshot_urls && issue.screenshot_urls.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('issue-screenshots')
      .remove(issue.screenshot_urls);
    if (storageError) console.error('Failed to delete screenshots:', storageError);

    await supabase
      .from('nexus_foundation_issues')
      .update({ screenshot_urls: null, updated_at: new Date().toISOString() })
      .eq('id', issueId);
  }
}

export async function getExpiredAwaitingIssues(
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .select('*')
    .eq('status', 'awaiting_confirmation')
    .lt('auto_close_at', new Date().toISOString());
  if (error) throw error;
  return (data || []) as unknown as NexusFoundationIssue[];
}

export async function updateFoundationIssueStatus(
  issueId: string,
  status: FoundationIssueStatus,
  actorId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();

  // Get current status for activity log
  const { data: current } = await supabase
    .from('nexus_foundation_issues')
    .select('status')
    .eq('id', issueId)
    .single();

  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  const action: FoundationIssueAction = status === 'in_progress' ? 'marked_in_progress' : status === 'open' ? 'reopened' : 'resolved';
  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: actorId,
    action,
    old_status: current?.status || null,
    new_status: status,
  });

  return data as unknown as NexusFoundationIssue;
}

export async function updateFoundationIssuePriority(
  issueId: string,
  priority: FoundationIssuePriority,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({ priority, updated_at: new Date().toISOString() })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as NexusFoundationIssue;
}

// ============================================
// ISSUE ACTIVITY LOG
// ============================================

export async function getIssueActivityLog(
  issueId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssueActivity[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issue_activity')
    .select(`
      *,
      actor:users!nexus_foundation_issue_activity_actor_id_fkey(name),
      target:users!nexus_foundation_issue_activity_target_user_id_fkey(name)
    `)
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    actor_name: row.actor?.name || 'Unknown',
    target_user_name: row.target?.name || null,
    actor: undefined,
    target: undefined,
  }));
}

export async function addIssueComment(
  issueId: string,
  actorId: string,
  comment: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssueActivity> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issue_activity')
    .insert({
      issue_id: issueId,
      actor_id: actorId,
      action: 'comment',
      reason: comment,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as NexusFoundationIssueActivity;
}

// ============================================
// TRANSCRIPTS
// ============================================

export async function getChapterTranscript(
  chapterId: string,
  language: string = 'en',
  client?: TypedSupabaseClient
): Promise<NexusFoundationTranscript | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_transcripts')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('language', language)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as NexusFoundationTranscript | null;
}

export async function getChapterTranscriptLanguages(
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_transcripts')
    .select('language')
    .eq('chapter_id', chapterId);
  if (error) throw error;
  return (data || []).map((r: any) => r.language);
}

export async function upsertChapterTranscript(
  chapterId: string,
  language: string,
  entries: TranscriptEntry[],
  client?: TypedSupabaseClient
): Promise<NexusFoundationTranscript> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_transcripts')
    .upsert(
      {
        chapter_id: chapterId,
        language,
        entries: entries as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chapter_id,language' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as unknown as NexusFoundationTranscript;
}

// ============================================
// STUDENT SCORES (TEACHER VIEW)
// ============================================

export interface ChapterStudentScore {
  student_id: string;
  student_name: string;
  student_email: string;
  sections: Array<{
    section_id: string;
    section_title: string;
    sort_order: number;
    score_pct: number | null;
    passed: boolean;
    attempt_count: number;
    watched_seconds: number;
    watch_completion_pct: number;
    seek_count: number;
  }>;
  overall_score_pct: number;
  completed_sections: number;
  total_sections: number;
  total_watch_seconds: number;
}

/**
 * Get all students' section-wise quiz scores for a chapter.
 * Used by teacher/admin to view student performance.
 */
export async function getChapterStudentScores(
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<ChapterStudentScore[]> {
  const supabase = client || getSupabaseAdminClient();

  // Get sections for this chapter
  const { data: sections, error: secError } = await supabase
    .from('nexus_foundation_sections')
    .select('id, title, sort_order')
    .eq('chapter_id', chapterId)
    .order('sort_order', { ascending: true });
  if (secError) throw secError;
  if (!sections?.length) return [];

  const sectionIds = sections.map((s: any) => s.id);

  // Get all quiz attempts for these sections
  const { data: attempts, error: attError } = await supabase
    .from('nexus_foundation_quiz_attempts')
    .select('student_id, section_id, score_pct, passed, attempt_number')
    .in('section_id', sectionIds)
    .order('attempt_number', { ascending: false });
  if (attError) throw attError;

  // Get all students who have progress on this chapter
  const { data: progressRows, error: progError } = await supabase
    .from('nexus_foundation_student_progress')
    .select('student_id')
    .eq('chapter_id', chapterId);
  if (progError) throw progError;

  const studentIds = [...new Set((progressRows || []).map((p: any) => p.student_id))];
  if (!studentIds.length) return [];

  // Fetch student details
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', studentIds);
  if (usersError) throw usersError;

  const userMap = new Map((users || []).map((u: any) => [u.id, u]));

  // Build best attempt per student per section
  const bestAttempts = new Map<string, { score_pct: number; passed: boolean; attempt_count: number }>();
  for (const att of (attempts || [])) {
    const key = `${att.student_id}:${att.section_id}`;
    const existing = bestAttempts.get(key);
    if (!existing) {
      bestAttempts.set(key, { score_pct: att.score_pct, passed: att.passed, attempt_count: att.attempt_number });
    } else if (att.score_pct > existing.score_pct) {
      bestAttempts.set(key, { score_pct: att.score_pct, passed: att.passed, attempt_count: Math.max(existing.attempt_count, att.attempt_number) });
    }
  }

  // Fetch watch session data — aggregate across sessions per student per section
  const { data: watchSessions } = await (supabase as any)
    .from('nexus_foundation_watch_sessions')
    .select('student_id, section_id, watched_seconds, completion_pct, seek_count')
    .in('section_id', sectionIds)
    .in('student_id', studentIds);

  const watchMap = new Map<string, { watched_seconds: number; completion_pct: number; seek_count: number }>();
  for (const ws of (watchSessions || [])) {
    const key = `${ws.student_id}:${ws.section_id}`;
    const existing = watchMap.get(key);
    if (!existing) {
      watchMap.set(key, {
        watched_seconds: ws.watched_seconds,
        completion_pct: Number(ws.completion_pct),
        seek_count: ws.seek_count,
      });
    } else {
      existing.watched_seconds += ws.watched_seconds;
      existing.completion_pct = Math.max(existing.completion_pct, Number(ws.completion_pct));
      existing.seek_count += ws.seek_count;
    }
  }

  return studentIds.map((studentId: string) => {
    const user = userMap.get(studentId);
    const sectionScores = sections.map((sec: any) => {
      const best = bestAttempts.get(`${studentId}:${sec.id}`);
      const watch = watchMap.get(`${studentId}:${sec.id}`);
      return {
        section_id: sec.id,
        section_title: sec.title,
        sort_order: sec.sort_order,
        score_pct: best?.score_pct ?? null,
        passed: best?.passed ?? false,
        attempt_count: best?.attempt_count ?? 0,
        watched_seconds: watch?.watched_seconds ?? 0,
        watch_completion_pct: watch?.completion_pct ?? 0,
        seek_count: watch?.seek_count ?? 0,
      };
    });
    const attempted = sectionScores.filter((s: any) => s.score_pct !== null);
    const overallScore = attempted.length > 0
      ? Math.round(attempted.reduce((sum: number, s: any) => sum + (s.score_pct ?? 0), 0) / attempted.length)
      : 0;
    const totalWatchSeconds = sectionScores.reduce((sum, s) => sum + s.watched_seconds, 0);
    return {
      student_id: studentId,
      student_name: user?.name || 'Unknown',
      student_email: user?.email || '',
      sections: sectionScores,
      overall_score_pct: overallScore,
      completed_sections: sectionScores.filter((s: any) => s.passed).length,
      total_sections: sections.length,
      total_watch_seconds: totalWatchSeconds,
    };
  }).sort((a: any, b: any) => b.overall_score_pct - a.overall_score_pct);
}

// ============================================
// WATCH SESSION TRACKING
// ============================================

/**
 * Upsert a foundation watch session.
 * Called from the progress API every ~30 seconds during video playback.
 */
export async function upsertFoundationWatchSession(
  studentId: string,
  chapterId: string,
  session: NexusFoundationWatchSessionUpsert,
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('nexus_foundation_watch_sessions')
    .upsert(
      {
        id: session.id,
        student_id: studentId,
        chapter_id: chapterId,
        section_id: session.section_id,
        watched_seconds: session.watched_seconds,
        section_duration_seconds: session.section_duration_seconds,
        completion_pct: session.completion_pct,
        play_count: session.play_count,
        pause_count: session.pause_count,
        seek_count: session.seek_count,
        device_type: session.device_type,
        ended_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) throw error;
}
