import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusFoundationChapter,
  NexusFoundationChapterAdmin,
  NexusFoundationChapterInsert,
  NexusFoundationChapterUpdate,
  NexusFoundationSection,
  NexusFoundationSectionInsert,
  NexusFoundationSectionUpdate,
  NexusFoundationQuizQuestion,
  NexusFoundationQuizQuestionInsert,
  NexusFoundationQuizQuestionUpdate,
} from '../../types';

// ============================================
// CHAPTER ADMIN CRUD
// ============================================

export async function getAllChaptersAdmin(
  client?: TypedSupabaseClient
): Promise<NexusFoundationChapterAdmin[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: chapters, error } = await supabase
    .from('nexus_foundation_chapters')
    .select('*')
    .order('chapter_number', { ascending: true });
  if (error) throw error;

  // Get section and question counts
  const { data: sections } = await supabase
    .from('nexus_foundation_sections')
    .select('id, chapter_id');

  const { data: questions } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select('id, section_id');

  const sectionsByChapter = new Map<string, string[]>();
  for (const s of (sections || []) as any[]) {
    if (!sectionsByChapter.has(s.chapter_id)) {
      sectionsByChapter.set(s.chapter_id, []);
    }
    sectionsByChapter.get(s.chapter_id)!.push(s.id);
  }

  const questionsBySection = new Map<string, number>();
  for (const q of (questions || []) as any[]) {
    questionsBySection.set(q.section_id, (questionsBySection.get(q.section_id) || 0) + 1);
  }

  return (chapters || []).map((ch: any) => {
    const sectionIds = sectionsByChapter.get(ch.id) || [];
    const questionCount = sectionIds.reduce((sum, sid) => sum + (questionsBySection.get(sid) || 0), 0);
    return {
      ...ch,
      section_count: sectionIds.length,
      question_count: questionCount,
    };
  });
}

export async function createFoundationChapter(
  data: NexusFoundationChapterInsert,
  client?: TypedSupabaseClient
): Promise<NexusFoundationChapter> {
  const supabase = client || getSupabaseAdminClient();
  const { data: chapter, error } = await supabase
    .from('nexus_foundation_chapters')
    .insert({
      title: data.title,
      description: data.description || null,
      video_source: data.video_source || 'youtube',
      youtube_video_id: data.youtube_video_id || null,
      sharepoint_video_url: data.sharepoint_video_url || null,
      video_duration_seconds: data.video_duration_seconds || null,
      chapter_number: data.chapter_number,
      min_quiz_score_pct: data.min_quiz_score_pct ?? 90,
      is_published: data.is_published ?? false,
      created_by: data.created_by || null,
    })
    .select()
    .single();
  if (error) throw error;
  return chapter as unknown as NexusFoundationChapter;
}

export async function updateFoundationChapter(
  id: string,
  data: NexusFoundationChapterUpdate,
  client?: TypedSupabaseClient
): Promise<NexusFoundationChapter> {
  const supabase = client || getSupabaseAdminClient();
  const { data: chapter, error } = await supabase
    .from('nexus_foundation_chapters')
    .update({ ...data as any, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return chapter as unknown as NexusFoundationChapter;
}

export async function deleteFoundationChapter(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Delete in order: quiz_attempts → student_notes → quiz_questions → sections → progress → chapter
  const { data: sections } = await supabase
    .from('nexus_foundation_sections')
    .select('id')
    .eq('chapter_id', id);
  const sectionIds = (sections || []).map((s: any) => s.id);

  if (sectionIds.length > 0) {
    await supabase.from('nexus_foundation_quiz_attempts').delete().in('section_id', sectionIds);
    await supabase.from('nexus_foundation_student_notes').delete().in('section_id', sectionIds);
    await supabase.from('nexus_foundation_quiz_questions').delete().in('section_id', sectionIds);
  }
  await supabase.from('nexus_foundation_sections').delete().eq('chapter_id', id);
  await supabase.from('nexus_foundation_student_progress').delete().eq('chapter_id', id);
  await supabase.from('nexus_foundation_reactions').delete().eq('chapter_id', id);
  await supabase.from('nexus_foundation_issues').delete().eq('chapter_id', id);

  const { error } = await supabase
    .from('nexus_foundation_chapters')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================
// SECTION ADMIN CRUD
// ============================================

export async function getChapterSectionsAdmin(
  chapterId: string,
  client?: TypedSupabaseClient
): Promise<(NexusFoundationSection & { question_count: number })[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: sections, error } = await supabase
    .from('nexus_foundation_sections')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const sectionIds = (sections || []).map((s: any) => s.id);
  if (sectionIds.length === 0) return [];

  const { data: questions } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select('id, section_id')
    .in('section_id', sectionIds);

  const countMap = new Map<string, number>();
  for (const q of (questions || []) as any[]) {
    countMap.set(q.section_id, (countMap.get(q.section_id) || 0) + 1);
  }

  return (sections || []).map((s: any) => ({
    ...s,
    question_count: countMap.get(s.id) || 0,
  }));
}

export async function createFoundationSection(
  data: NexusFoundationSectionInsert,
  client?: TypedSupabaseClient
): Promise<NexusFoundationSection> {
  const supabase = client || getSupabaseAdminClient();
  const { data: section, error } = await supabase
    .from('nexus_foundation_sections')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return section as unknown as NexusFoundationSection;
}

export async function updateFoundationSection(
  id: string,
  data: NexusFoundationSectionUpdate,
  client?: TypedSupabaseClient
): Promise<NexusFoundationSection> {
  const supabase = client || getSupabaseAdminClient();
  const { data: section, error } = await supabase
    .from('nexus_foundation_sections')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return section as unknown as NexusFoundationSection;
}

export async function deleteFoundationSection(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  // Delete related data first
  await supabase.from('nexus_foundation_quiz_attempts').delete().eq('section_id', id);
  await supabase.from('nexus_foundation_student_notes').delete().eq('section_id', id);
  await supabase.from('nexus_foundation_quiz_questions').delete().eq('section_id', id);

  const { error } = await supabase
    .from('nexus_foundation_sections')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================
// QUIZ QUESTION ADMIN CRUD
// ============================================

export async function getSectionQuestionsAdmin(
  sectionId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationQuizQuestion[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_quiz_questions')
    .select('*')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusFoundationQuizQuestion[];
}

export async function createFoundationQuizQuestion(
  data: NexusFoundationQuizQuestionInsert,
  client?: TypedSupabaseClient
): Promise<NexusFoundationQuizQuestion> {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await supabase
    .from('nexus_foundation_quiz_questions')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return question as unknown as NexusFoundationQuizQuestion;
}

export async function updateFoundationQuizQuestion(
  id: string,
  data: NexusFoundationQuizQuestionUpdate,
  client?: TypedSupabaseClient
): Promise<NexusFoundationQuizQuestion> {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await supabase
    .from('nexus_foundation_quiz_questions')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return question as unknown as NexusFoundationQuizQuestion;
}

export async function deleteFoundationQuizQuestion(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_foundation_quiz_questions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
