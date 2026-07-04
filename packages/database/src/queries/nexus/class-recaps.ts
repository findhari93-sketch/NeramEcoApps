// @ts-nocheck — nexus_class_recap* tables not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

const RECAPS = 'nexus_class_recaps';
const SECTIONS = 'nexus_class_recap_sections';
const QUESTIONS = 'nexus_class_recap_questions';
const ATTEMPTS = 'nexus_class_recap_attempts';
const PROGRESS = 'nexus_class_recap_progress';

export type RecapStatus = 'draft' | 'published' | 'archived';

export interface NexusClassRecap {
  id: string;
  scheduled_class_id: string;
  classroom_id: string | null;
  title: string;
  recording_url: string | null;
  transcript_url: string | null;
  video_source: string;
  video_duration_seconds: number | null;
  status: RecapStatus;
  generated_at: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusClassRecapQuestion {
  id: string;
  section_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  sort_order: number;
}

export interface NexusClassRecapSection {
  id: string;
  recap_id: string;
  title: string;
  description: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  min_questions_to_pass: number | null;
  questions?: NexusClassRecapQuestion[];
}

export interface GeneratedRecapSection {
  title: string;
  description?: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  min_questions_to_pass?: number | null;
  questions: {
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: 'a' | 'b' | 'c' | 'd';
    explanation?: string;
  }[];
}

const SECTION_SELECT = `*, questions:${QUESTIONS}(*)`;

function sortSections(sections: NexusClassRecapSection[]): NexusClassRecapSection[] {
  return (sections || [])
    .map((s) => ({
      ...s,
      questions: (s.questions || []).sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Create (or return the existing) draft recap for a recorded scheduled class.
 * Snapshots the class recording + transcript URLs so later edits to the class
 * row don't strand the recap.
 */
export async function createRecapForClass(
  scheduledClassId: string,
  createdBy: string | null,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();

  const existing = await getRecapByClass(scheduledClassId, supabase);
  if (existing) return existing;

  const { data: cls, error: clsErr } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, title, recording_url, transcript_url, recording_duration_minutes')
    .eq('id', scheduledClassId)
    .single();
  if (clsErr) throw clsErr;

  const durationSeconds =
    cls.recording_duration_minutes != null ? Math.round(cls.recording_duration_minutes * 60) : null;

  const { data, error } = await supabase
    .from(RECAPS)
    .insert({
      scheduled_class_id: scheduledClassId,
      classroom_id: cls.classroom_id ?? null,
      title: cls.title || 'Class recap',
      recording_url: cls.recording_url ?? null,
      transcript_url: cls.transcript_url ?? null,
      video_source: 'sharepoint',
      video_duration_seconds: durationSeconds,
      status: 'draft',
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as NexusClassRecap;
}

/**
 * Create an ad-hoc recap not tied to a Nexus scheduled class — for a class that
 * was scheduled directly in Teams (no nexus_scheduled_classes row). The teacher
 * supplies the recording link (and optionally a transcript URL); everything
 * downstream (generate, edit, publish, gated player) keys off the recap row.
 */
export async function createManualRecap(
  input: {
    title: string;
    classroomId: string;
    recordingUrl: string;
    transcriptUrl?: string | null;
    createdBy?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .insert({
      scheduled_class_id: null,
      classroom_id: input.classroomId,
      title: input.title,
      recording_url: input.recordingUrl,
      transcript_url: input.transcriptUrl ?? null,
      video_source: 'sharepoint',
      video_duration_seconds: null,
      status: 'draft',
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as NexusClassRecap;
}

export async function getRecapByClass(
  scheduledClassId: string,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select('*')
    .eq('scheduled_class_id', scheduledClassId)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusClassRecap) || null;
}

export async function getRecapById(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<(NexusClassRecap & { sections: NexusClassRecapSection[] }) | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select(`*, sections:${SECTIONS}(${SECTION_SELECT})`)
    .eq('id', recapId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.sections = sortSections(data.sections || []);
  return data as NexusClassRecap & { sections: NexusClassRecapSection[] };
}

/** Snapshot latest recording/transcript URLs onto the recap (from the class row). */
export async function refreshRecapMedia(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();
  const { data: recap, error: rErr } = await supabase
    .from(RECAPS)
    .select('id, scheduled_class_id')
    .eq('id', recapId)
    .single();
  if (rErr) throw rErr;
  const { data: cls, error: cErr } = await supabase
    .from('nexus_scheduled_classes')
    .select('recording_url, transcript_url, recording_duration_minutes')
    .eq('id', recap.scheduled_class_id)
    .single();
  if (cErr) throw cErr;
  const { data, error } = await supabase
    .from(RECAPS)
    .update({
      recording_url: cls.recording_url ?? null,
      transcript_url: cls.transcript_url ?? null,
      video_duration_seconds:
        cls.recording_duration_minutes != null
          ? Math.round(cls.recording_duration_minutes * 60)
          : null,
    })
    .eq('id', recapId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusClassRecap;
}

/**
 * Replace all sections + questions for a recap (from AI generation or an edit).
 * Sets generated_at. Cascade deletes drop old questions/attempts.
 */
export async function replaceRecapSections(
  recapId: string,
  sections: GeneratedRecapSection[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error: delErr } = await supabase.from(SECTIONS).delete().eq('recap_id', recapId);
  if (delErr) throw delErr;

  const ordered = [...sections].sort(
    (a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds,
  );

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const { data: section, error: sErr } = await supabase
      .from(SECTIONS)
      .insert({
        recap_id: recapId,
        title: s.title,
        description: s.description ?? null,
        start_timestamp_seconds: Math.max(0, Math.round(s.start_timestamp_seconds)),
        end_timestamp_seconds: Math.round(s.end_timestamp_seconds),
        sort_order: i,
        min_questions_to_pass: s.min_questions_to_pass ?? null,
      })
      .select('id')
      .single();
    if (sErr) throw sErr;

    const questions = (s.questions || []).filter((q) => q.question_text);
    if (questions.length) {
      const { error: qErr } = await supabase.from(QUESTIONS).insert(
        questions.map((q, qi) => ({
          section_id: section.id,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: ['a', 'b', 'c', 'd'].includes(q.correct_option) ? q.correct_option : 'a',
          explanation: q.explanation ?? null,
          sort_order: qi,
        })),
      );
      if (qErr) throw qErr;
    }
  }

  const { error: uErr } = await supabase
    .from(RECAPS)
    .update({ generated_at: new Date().toISOString() })
    .eq('id', recapId);
  if (uErr) throw uErr;
}

export async function setRecapStatus(
  recapId: string,
  status: RecapStatus,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'published') patch.published_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(RECAPS)
    .update(patch)
    .eq('id', recapId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusClassRecap;
}

// ── Student-facing read + grading helpers ──

/**
 * Recap for a student: sections in order (answers stripped), each annotated
 * with whether the student has passed it, plus a `locked` flag enforcing
 * sequential unlock (section N locked until N-1 is passed).
 */
export async function getRecapForStudent(
  recapId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<
  | (NexusClassRecap & {
      sections: (Omit<NexusClassRecapSection, 'questions'> & {
        question_count: number;
        passed: boolean;
        locked: boolean;
      })[];
      progress_status: 'in_progress' | 'completed' | 'locked' | null;
    })
  | null
> {
  const supabase = client || getSupabaseAdminClient();
  const recap = await getRecapById(recapId, supabase);
  if (!recap) return null;

  const passedIds = await getPassedSectionIds(studentId, recapId, supabase);

  const { data: progress } = await supabase
    .from(PROGRESS)
    .select('status')
    .eq('student_id', studentId)
    .eq('recap_id', recapId)
    .maybeSingle();

  let priorPassed = true;
  const sections = recap.sections.map((s) => {
    const passed = passedIds.has(s.id);
    const locked = !priorPassed; // locked until the previous section is passed
    priorPassed = passed;
    const { questions, ...rest } = s;
    return {
      ...rest,
      question_count: (questions || []).length,
      passed,
      locked,
    };
  });

  const { sections: _drop, ...recapRest } = recap;
  return {
    ...recapRest,
    sections,
    progress_status: progress?.status ?? null,
  };
}

/** Section quiz questions with answers stripped (student view). */
export async function getRecapSectionQuestionsForStudent(
  sectionId: string,
  client?: TypedSupabaseClient,
): Promise<Omit<NexusClassRecapQuestion, 'correct_option' | 'explanation'>[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(QUESTIONS)
    .select('id, section_id, question_text, option_a, option_b, option_c, option_d, sort_order')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getRecapSection(
  sectionId: string,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecapSection | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SECTIONS)
    .select('*')
    .eq('id', sectionId)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusClassRecapSection) || null;
}

export async function getRecapSectionQuestionsWithAnswers(
  sectionId: string,
  client?: TypedSupabaseClient,
): Promise<NexusClassRecapQuestion[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(QUESTIONS)
    .select('*')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as NexusClassRecapQuestion[]) || [];
}

/** Ordered section ids for a recap (for sequential-unlock checks). */
export async function listRecapSectionOrder(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; sort_order: number }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SECTIONS)
    .select('id, sort_order')
    .eq('recap_id', recapId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getPassedSectionIds(
  studentId: string,
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  const supabase = client || getSupabaseAdminClient();
  const order = await listRecapSectionOrder(recapId, supabase);
  const ids = order.map((s) => s.id);
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('section_id')
    .eq('student_id', studentId)
    .in('section_id', ids)
    .eq('passed', true);
  if (error) throw error;
  return new Set((data || []).map((a) => a.section_id));
}

export async function countRecapAttempts(
  studentId: string,
  sectionId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('section_id', sectionId);
  if (error) throw error;
  return count || 0;
}

export async function insertRecapAttempt(
  attempt: {
    student_id: string;
    section_id: string;
    score_pct: number;
    answers: Record<string, string>;
    passed: boolean;
    attempt_number: number;
  },
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(ATTEMPTS).insert(attempt).select('id').single();
  if (error) throw error;
  return data;
}

export async function upsertRecapProgress(
  studentId: string,
  recapId: string,
  patch: {
    status?: 'in_progress' | 'completed' | 'locked';
    last_section_id?: string | null;
    last_video_position_seconds?: number;
    started_at?: string;
    completed_at?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(PROGRESS).upsert(
    {
      student_id: studentId,
      recap_id: recapId,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: 'student_id,recap_id' },
  );
  if (error) throw error;
}

/**
 * If the student has now passed every section of the recap, mark their recap
 * progress completed. Returns true when the recap is fully complete.
 */
export async function markRecapCompletedIfAllPassed(
  studentId: string,
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const order = await listRecapSectionOrder(recapId, supabase);
  if (!order.length) return false;
  const passed = await getPassedSectionIds(studentId, recapId, supabase);
  const allPassed = order.every((s) => passed.has(s.id));
  if (allPassed) {
    await upsertRecapProgress(
      studentId,
      recapId,
      { status: 'completed', completed_at: new Date().toISOString() },
      supabase,
    );
  }
  return allPassed;
}

// ── Teacher / management listing ──

/**
 * Recaps for a classroom with per-recap completion counts across the cohort.
 * Used by the management "who finished missed classes" view.
 */
export async function listRecapsForClassroom(
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<
  (NexusClassRecap & {
    section_count: number;
    completed_count: number;
    in_progress_count: number;
  })[]
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select(`*, sections:${SECTIONS}(id), progress:${PROGRESS}(status)`)
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => {
    const { sections, progress, ...rest } = r;
    return {
      ...rest,
      section_count: (sections || []).length,
      completed_count: (progress || []).filter((p) => p.status === 'completed').length,
      in_progress_count: (progress || []).filter((p) => p.status === 'in_progress').length,
    };
  });
}

/**
 * Published recaps across the student's enrolled classrooms, annotated with the
 * student's own progress. Powers the student "Class Recaps" list (a late joiner
 * seeing which recorded classes they still need to complete).
 */
export async function listPublishedRecapsForStudent(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<
  (NexusClassRecap & {
    section_count: number;
    progress_status: 'in_progress' | 'completed' | 'locked' | null;
  })[]
> {
  const supabase = client || getSupabaseAdminClient();

  const { data: enrollments, error: enErr } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enErr) throw enErr;
  const classroomIds = [...new Set((enrollments || []).map((e) => e.classroom_id).filter(Boolean))];
  if (!classroomIds.length) return [];

  const { data, error } = await supabase
    .from(RECAPS)
    .select(`*, sections:${SECTIONS}(id), progress:${PROGRESS}(status, student_id)`)
    .in('classroom_id', classroomIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((r) => {
    const { sections, progress, ...rest } = r;
    const mine = (progress || []).find((p) => p.student_id === studentId);
    return {
      ...rest,
      section_count: (sections || []).length,
      progress_status: mine?.status ?? null,
    };
  });
}

/** Per-student completion for one recap (management drill-down). */
export async function listRecapCompletion(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<
  {
    student_id: string;
    status: string;
    completed_at: string | null;
    student: { id: string; name: string | null; email: string | null } | null;
  }[]
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PROGRESS)
    .select('student_id, status, completed_at, student:users(id, name, email)')
    .eq('recap_id', recapId);
  if (error) throw error;
  return data || [];
}
