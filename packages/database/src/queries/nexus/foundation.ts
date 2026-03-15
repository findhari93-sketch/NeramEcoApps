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
  NexusFoundationTranscript,
  TranscriptEntry,
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
  return (data || []) as NexusFoundationQuizQuestion[];
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

  // Get section to find chapter and min score
  const { data: section, error: sectionError } = await supabase
    .from('nexus_foundation_sections')
    .select('chapter_id')
    .eq('id', sectionId)
    .single();
  if (sectionError) throw sectionError;

  const { data: chapter, error: chapterError } = await supabase
    .from('nexus_foundation_chapters')
    .select('min_quiz_score_pct')
    .eq('id', (section as any).chapter_id)
    .single();
  if (chapterError) throw chapterError;

  const passed = scorePct >= (chapter as any).min_quiz_score_pct;

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
    .select('user_id, users:users!inner(id, name, email, avatar_url)')
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
  return data;
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
  return data;
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
    chapter_id: string;
    section_id?: string;
    title: string;
    description: string;
  },
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data: issue, error } = await supabase
    .from('nexus_foundation_issues')
    .insert({
      student_id: data.student_id,
      chapter_id: data.chapter_id,
      section_id: data.section_id || null,
      title: data.title,
      description: data.description,
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

  return issue;
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

  return data;
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
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'resolved' as FoundationIssueStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote,
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
    new_status: 'resolved',
    reason: resolutionNote,
  });

  return data as unknown as NexusFoundationIssue;
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
