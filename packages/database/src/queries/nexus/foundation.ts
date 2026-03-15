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
