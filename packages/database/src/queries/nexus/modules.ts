import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusModule,
  NexusModuleItem,
  NexusModuleWithItems,
} from '../../types';

// ============================================
// MODULE CRUD
// ============================================

export async function getModules(client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_modules')
    .select('*, items:nexus_module_items(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as (NexusModule & { items: [{ count: number }] })[];
}

export async function getModuleById(
  moduleId: string,
  client?: TypedSupabaseClient
): Promise<NexusModuleWithItems | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_modules')
    .select('*, items:nexus_module_items(*)')
    .eq('id', moduleId)
    .order('sort_order', { referencedTable: 'nexus_module_items', ascending: true })
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as NexusModuleWithItems;
}

export async function createModule(
  data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    module_type?: 'foundation' | 'custom';
    created_by?: string;
  },
  client?: TypedSupabaseClient
): Promise<NexusModule> {
  const supabase = client || getSupabaseAdminClient();
  const { data: module, error } = await (supabase as any)
    .from('nexus_modules')
    .insert({ module_type: 'custom', ...data })
    .select()
    .single();
  if (error) throw error;
  return module as NexusModule;
}

export async function updateModule(
  moduleId: string,
  updates: Partial<Pick<NexusModule, 'title' | 'description' | 'icon' | 'color' | 'is_published'>>,
  client?: TypedSupabaseClient
): Promise<NexusModule> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_modules')
    .update(updates)
    .eq('id', moduleId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusModule;
}

export async function deleteModule(
  moduleId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_modules')
    .delete()
    .eq('id', moduleId);
  if (error) throw error;
}

// ============================================
// MODULE ITEMS
// ============================================

export async function getModuleItems(
  moduleId: string,
  client?: TypedSupabaseClient
): Promise<NexusModuleItem[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_items')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusModuleItem[];
}

export async function createModuleItem(
  data: {
    module_id: string;
    title: string;
    item_type: string;
    content_url?: string;
    youtube_video_id?: string;
    sort_order?: number;
    metadata?: Record<string, unknown>;
  },
  client?: TypedSupabaseClient
): Promise<NexusModuleItem> {
  const supabase = client || getSupabaseAdminClient();
  const { data: item, error } = await (supabase as any)
    .from('nexus_module_items')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return item as NexusModuleItem;
}

export async function updateModuleItem(
  itemId: string,
  updates: Partial<Pick<NexusModuleItem, 'title' | 'item_type' | 'content_url' | 'youtube_video_id' | 'sort_order' | 'metadata'>>,
  client?: TypedSupabaseClient
): Promise<NexusModuleItem> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusModuleItem;
}

export async function deleteModuleItem(
  itemId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_module_items')
    .delete()
    .eq('id', itemId);
  if (error) throw error;
}

export async function reorderModuleItems(
  items: { id: string; sort_order: number }[],
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  for (const item of items) {
    const { error } = await (supabase as any)
      .from('nexus_module_items')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id);
    if (error) throw error;
  }
}

// ============================================
// RICH MODULE ITEM QUERIES
// ============================================

export async function getModuleItemsWithProgress(
  moduleId: string,
  studentId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all published items for this module
  const { data: items, error: itemsError } = await (supabase as any)
    .from('nexus_module_items')
    .select('*')
    .eq('module_id', moduleId)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  if (!studentId) {
    // Get section counts per item
    const itemIds = (items || []).map((i: any) => i.id);
    const { data: sections } = await (supabase as any)
      .from('nexus_module_item_sections')
      .select('id, module_item_id')
      .in('module_item_id', itemIds.length > 0 ? itemIds : ['none']);

    const sectionCountMap = new Map<string, number>();
    for (const s of (sections || []) as any[]) {
      sectionCountMap.set(s.module_item_id, (sectionCountMap.get(s.module_item_id) || 0) + 1);
    }

    return (items || []).map((item: any) => ({
      ...item,
      progress: null,
      section_count: sectionCountMap.get(item.id) || 0,
      completed_sections: 0,
    }));
  }

  // Get student progress
  const { data: progressRows } = await (supabase as any)
    .from('nexus_module_student_progress')
    .select('*')
    .eq('student_id', studentId);

  // Get section counts
  const itemIds = (items || []).map((i: any) => i.id);
  const { data: sections } = await (supabase as any)
    .from('nexus_module_item_sections')
    .select('id, module_item_id')
    .in('module_item_id', itemIds.length > 0 ? itemIds : ['none']);

  // Get passed quiz attempts
  const sectionIds = (sections || []).map((s: any) => s.id);
  const { data: passedAttempts } = await (supabase as any)
    .from('nexus_module_quiz_attempts')
    .select('section_id')
    .eq('student_id', studentId)
    .eq('passed', true)
    .in('section_id', sectionIds.length > 0 ? sectionIds : ['none']);

  const progressMap = new Map((progressRows || []).map((p: any) => [p.module_item_id, p]));
  const passedSectionIds = new Set((passedAttempts || []).map((a: any) => a.section_id));

  const sectionCountMap = new Map<string, number>();
  const completedSectionMap = new Map<string, number>();
  for (const section of (sections || []) as any[]) {
    sectionCountMap.set(section.module_item_id, (sectionCountMap.get(section.module_item_id) || 0) + 1);
    if (passedSectionIds.has(section.id)) {
      completedSectionMap.set(section.module_item_id, (completedSectionMap.get(section.module_item_id) || 0) + 1);
    }
  }

  // Build result with sequential unlock logic
  const result: any[] = [];
  let previousCompleted = true;

  for (const item of (items || []) as any[]) {
    const progress = progressMap.get(item.id) as any;
    const sectionCount = sectionCountMap.get(item.id) || 0;
    const completedSections = completedSectionMap.get(item.id) || 0;

    let status: string;
    if (progress) {
      status = progress.status;
    } else if (previousCompleted) {
      status = 'in_progress'; // First unlocked item
    } else {
      status = 'locked';
    }

    result.push({
      ...item,
      progress: progress || null,
      section_count: sectionCount,
      completed_sections: completedSections,
      _status: status,
    });

    previousCompleted = status === 'completed';
  }

  return result;
}

export async function getModuleItemDetail(
  itemId: string,
  studentId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get item
  const { data: item, error: itemError } = await (supabase as any)
    .from('nexus_module_items')
    .select('*')
    .eq('id', itemId)
    .single();
  if (itemError) throw itemError;

  // Get sections with quiz questions
  const { data: sections, error: sectionsError } = await (supabase as any)
    .from('nexus_module_item_sections')
    .select('*, quiz_questions:nexus_module_item_quiz_questions(*)')
    .eq('module_item_id', itemId)
    .order('sort_order', { ascending: true });
  if (sectionsError) throw sectionsError;

  if (!studentId) {
    return {
      ...item,
      sections: (sections || []).map((s: any) => ({
        ...s,
        quiz_attempt: null,
        note: null,
      })),
      progress: null,
    };
  }

  // Get student progress
  const { data: progress } = await (supabase as any)
    .from('nexus_module_student_progress')
    .select('*')
    .eq('student_id', studentId)
    .eq('module_item_id', itemId)
    .maybeSingle();

  // Get quiz attempts (latest per section)
  const sectionIds = (sections || []).map((s: any) => s.id);
  const { data: attempts } = await (supabase as any)
    .from('nexus_module_quiz_attempts')
    .select('*')
    .eq('student_id', studentId)
    .in('section_id', sectionIds.length > 0 ? sectionIds : ['none'])
    .order('created_at', { ascending: false });

  // Get student notes
  const { data: notes } = await (supabase as any)
    .from('nexus_module_student_notes')
    .select('*')
    .eq('student_id', studentId)
    .in('section_id', sectionIds.length > 0 ? sectionIds : ['none']);

  // Map latest attempt per section
  const attemptMap = new Map<string, any>();
  for (const a of (attempts || []) as any[]) {
    if (!attemptMap.has(a.section_id)) attemptMap.set(a.section_id, a);
  }
  const noteMap = new Map((notes || []).map((n: any) => [n.section_id, n]));

  return {
    ...item,
    sections: (sections || []).map((s: any) => ({
      ...s,
      // Strip correct answers for student view
      quiz_questions: (s.quiz_questions || []).map((q: any) => ({
        id: q.id,
        section_id: q.section_id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        sort_order: q.sort_order,
      })),
      quiz_attempt: attemptMap.get(s.id) || null,
      note: noteMap.get(s.id) || null,
    })),
    progress: progress || null,
  };
}

export async function upsertModuleItemProgress(
  studentId: string,
  moduleItemId: string,
  data: { status?: string; last_section_id?: string; last_video_position_seconds?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const updateData: any = { ...data };
  if (data.status === 'in_progress' && !updateData.started_at) {
    updateData.started_at = new Date().toISOString();
  }
  if (data.status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data: result, error } = await (supabase as any)
    .from('nexus_module_student_progress')
    .upsert({
      student_id: studentId,
      module_item_id: moduleItemId,
      ...updateData,
    }, { onConflict: 'student_id,module_item_id' })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function submitModuleQuizAttempt(
  studentId: string,
  sectionId: string,
  answers: Record<string, string>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get questions with correct answers
  const { data: questions, error: qErr } = await (supabase as any)
    .from('nexus_module_item_quiz_questions')
    .select('*')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (qErr) throw qErr;

  // Get section for pass criteria
  const { data: section, error: sErr } = await (supabase as any)
    .from('nexus_module_item_sections')
    .select('min_questions_to_pass, module_item_id')
    .eq('id', sectionId)
    .single();
  if (sErr) throw sErr;

  // Grade
  let correctCount = 0;
  const totalCount = (questions || []).length;
  for (const q of (questions || []) as any[]) {
    if (answers[q.id] === q.correct_option) correctCount++;
  }

  const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const minToPass = section.min_questions_to_pass || totalCount;
  const passed = correctCount >= minToPass;

  // Count previous attempts
  const { data: prevAttempts } = await (supabase as any)
    .from('nexus_module_quiz_attempts')
    .select('id')
    .eq('student_id', studentId)
    .eq('section_id', sectionId);
  const attemptNumber = ((prevAttempts || []).length) + 1;

  // Insert attempt
  const { data: attempt, error: aErr } = await (supabase as any)
    .from('nexus_module_quiz_attempts')
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
  if (aErr) throw aErr;

  // If passed, check if all sections in this item are now passed
  if (passed) {
    await checkAndCompleteModuleItem(studentId, section.module_item_id, client);
  }

  // Return attempt with explanations
  const questionsWithExplanations = (questions || []).map((q: any) => ({
    id: q.id,
    question_text: q.question_text,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    correct_option: q.correct_option,
    explanation: q.explanation,
  }));

  return {
    ...attempt,
    correct_count: correctCount,
    total_count: totalCount,
    min_to_pass: minToPass,
    questions: questionsWithExplanations,
  };
}

async function checkAndCompleteModuleItem(
  studentId: string,
  moduleItemId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all sections for this item
  const { data: sections } = await (supabase as any)
    .from('nexus_module_item_sections')
    .select('id')
    .eq('module_item_id', moduleItemId);

  if (!sections || sections.length === 0) return;

  // Check if all sections have a passed attempt
  const sectionIds = sections.map((s: any) => s.id);
  const { data: passedAttempts } = await (supabase as any)
    .from('nexus_module_quiz_attempts')
    .select('section_id')
    .eq('student_id', studentId)
    .eq('passed', true)
    .in('section_id', sectionIds);

  const passedSectionIds = new Set((passedAttempts || []).map((a: any) => a.section_id));
  const allPassed = sectionIds.every((id: string) => passedSectionIds.has(id));

  if (allPassed) {
    await (supabase as any)
      .from('nexus_module_student_progress')
      .upsert({
        student_id: studentId,
        module_item_id: moduleItemId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }, { onConflict: 'student_id,module_item_id' });
  }
}

export async function upsertModuleStudentNote(
  studentId: string,
  sectionId: string,
  noteText: string,
  videoTimestampSeconds?: number,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_student_notes')
    .upsert({
      student_id: studentId,
      section_id: sectionId,
      note_text: noteText,
      video_timestamp_seconds: videoTimestampSeconds || null,
    }, { onConflict: 'student_id,section_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// ADMIN: SECTION & QUIZ MANAGEMENT
// ============================================

export async function getModuleItemSectionsAdmin(
  moduleItemId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_item_sections')
    .select('*, quiz_questions:nexus_module_item_quiz_questions(count)')
    .eq('module_item_id', moduleItemId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any[];
}

export async function createModuleItemSection(
  data: {
    module_item_id: string;
    title: string;
    description?: string;
    start_timestamp_seconds: number;
    end_timestamp_seconds: number;
    sort_order?: number;
    min_questions_to_pass?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: section, error } = await (supabase as any)
    .from('nexus_module_item_sections')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return section;
}

export async function updateModuleItemSection(
  sectionId: string,
  updates: Partial<{ title: string; description: string; start_timestamp_seconds: number; end_timestamp_seconds: number; sort_order: number; min_questions_to_pass: number }>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_item_sections')
    .update(updates)
    .eq('id', sectionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteModuleItemSection(
  sectionId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_module_item_sections')
    .delete()
    .eq('id', sectionId);
  if (error) throw error;
}

export async function getModuleSectionQuestionsAdmin(
  sectionId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_item_quiz_questions')
    .select('*')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createModuleQuizQuestion(
  data: {
    section_id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    explanation?: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await (supabase as any)
    .from('nexus_module_item_quiz_questions')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return question;
}

export async function updateModuleQuizQuestion(
  questionId: string,
  updates: Partial<{ question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: string; explanation: string; sort_order: number }>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_module_item_quiz_questions')
    .update(updates)
    .eq('id', questionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteModuleQuizQuestion(
  questionId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_module_item_quiz_questions')
    .delete()
    .eq('id', questionId);
  if (error) throw error;
}
