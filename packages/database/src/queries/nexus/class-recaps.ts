// @ts-nocheck — nexus_class_recap* tables not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

const RECAPS = 'nexus_class_recaps';
const SECTIONS = 'nexus_class_recap_sections';
const QUESTIONS = 'nexus_class_recap_questions';
const ATTEMPTS = 'nexus_class_recap_attempts';
const PROGRESS = 'nexus_class_recap_progress';
const DRAWS = 'nexus_class_recap_draws';

export type RecapStatus = 'draft' | 'published' | 'archived';

/**
 * Why a recap is not servable yet. Separate from `status`, which is the
 * teacher-facing lifecycle. A student never sees the difference between these:
 * anything other than 'ready' reads as "your tutor is preparing this recording".
 */
export type RecapReadiness = 'pending' | 'ready' | 'held' | 'failed';

export interface NexusClassRecap {
  id: string;
  /**
   * NULL on an ad-hoc recap and on every study-file track. The column has been
   * nullable since 20260703130000 and this type said otherwise; @ts-nocheck hid
   * it. Tracks make the lie load-bearing, because they always have it NULL.
   */
  scheduled_class_id: string | null;
  classroom_id: string | null;
  /**
   * Set when this row is a Foundation chapter video track rather than a class
   * recap. Mutually exclusive with scheduled_class_id.
   */
  study_file_id: string | null;
  /** 'en' | 'ta' | 'ta_en'. Required on a track, NULL on a class recap. */
  language: string | null;
  /** What the language picker shows, e.g. "English". Stored, not translated. */
  language_label: string | null;
  /** Generated from study_file_id. Never write it. */
  kind: 'class_recap' | 'study_video';
  title: string;
  recording_url: string | null;
  transcript_url: string | null;
  video_source: string;
  video_duration_seconds: number | null;
  status: RecapStatus;
  readiness: RecapReadiness;
  hold_reason: string | null;
  hold_detail: string | null;
  quality_score: number | null;
  quality_report: Record<string, unknown> | null;
  generation_attempts: number;
  auto_published_at: string | null;
  target_segment_seconds: number;
  question_pool_per_segment: number;
  questions_per_segment: number;
  /** The derived count, kept in sync with pass_percentage for older readers. */
  questions_to_pass: number;
  /** NULL inherits nexus_settings.recap_defaults.pass_percentage. */
  pass_percentage: number | null;
  /** 'proxied' streams through Nexus; 'embedded' is the YouTube fallback. */
  protection_level: 'proxied' | 'embedded';
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
  /** NULL serves every active question, which is the historical behaviour. */
  questions_to_serve: number | null;
  /** Set instead of deleting, so student attempts on this checkpoint survive. */
  archived_at: string | null;
  questions?: NexusClassRecapQuestion[];
}

export interface GeneratedRecapSection {
  /**
   * Present when the teacher is editing a checkpoint that already exists. Its
   * presence is what lets updateRecapSections update in place rather than
   * recreate, which is what keeps students' passes alive. Absent for anything
   * the AI just generated or the teacher just added.
   */
  id?: string;
  title: string;
  description?: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  min_questions_to_pass?: number | null;
  questions_to_serve?: number | null;
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

/**
 * Order sections and their questions, dropping anything soft-deleted.
 *
 * Filtering here rather than in each query's select is deliberate: every reader
 * of SECTION_SELECT funnels through this one function, so an archived checkpoint
 * cannot leak back into a student's gating path via a query someone forgot to
 * update. The `!= null` / `!== false` forms keep this correct against rows read
 * before the columns existed, where both come back undefined.
 */
function sortSections(sections: NexusClassRecapSection[]): NexusClassRecapSection[] {
  return (sections || [])
    .filter((s) => s.archived_at == null)
    .map((s) => ({
      ...s,
      questions: (s.questions || [])
        .filter((q) => (q as any).is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Overlay each recap with the CURRENT title of the class it belongs to.
 *
 * `nexus_class_recaps.title` is written once, by createRecapForClass, from the
 * class row as it stood that day. For a class nobody has wrapped up yet that
 * value is still the Teams meeting subject ("Class by Ar Hari Babu"). Renaming
 * the class afterwards writes nexus_scheduled_classes and nothing else, so every
 * recap made before the rename kept announcing the old subject to its teacher
 * and to the students catching the class up.
 *
 * Resolved on read rather than synced on write on purpose. Class titles are
 * written from four places (the Wrap Up panel, the timetable PATCH, the Teams
 * reconciler and the autodraft cron) and a fifth would eventually forget to
 * carry the recap along, which is the failure this is fixing. Reading also heals
 * the rows that already drifted, with no backfill. buildClassTestFromRecap
 * already names its test this way.
 *
 * The stored column stays as the fallback, and is the only title an ad-hoc recap
 * (scheduled_class_id NULL) has ever had.
 */
async function withClassTitles<T extends { scheduled_class_id?: string | null; title?: string }>(
  supabase: TypedSupabaseClient,
  rows: T[],
): Promise<T[]> {
  const classIds = [...new Set(rows.map((r) => r.scheduled_class_id).filter(Boolean))];
  if (!classIds.length) return rows;

  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title')
    .in('id', classIds);
  // Best-effort: a recap that cannot reach its class is better shown under its
  // old name than not shown at all.
  if (error) {
    console.error('[recap] class title lookup failed (non-fatal):', error.message);
    return rows;
  }

  const titleByClass = new Map<string, string>();
  for (const c of data || []) if (c.title) titleByClass.set(c.id, c.title);

  return rows.map((r) => {
    const live = r.scheduled_class_id ? titleByClass.get(r.scheduled_class_id) : undefined;
    return live ? { ...r, title: live } : r;
  });
}

/**
 * Create (or return the existing) draft recap for a recorded scheduled class.
 * Snapshots the class recording + transcript URLs so later edits to the class
 * row don't strand the recap.
 *
 * `opts.readiness` exists for the automatic sweep, which inserts the row before
 * it has anything to put in it. It passes 'pending' so that a crash between the
 * insert and the generation leaves a row that is visibly unfinished. The column
 * defaults to 'ready', so without this an empty recap and a good one are
 * indistinguishable, and three empty ones sat in production reading as healthy
 * drafts. A teacher pressing "Create recap" still gets the default: they are
 * about to fill it in themselves, and 'pending' would invite the sweep to
 * generate over the top of their work.
 */
export async function createRecapForClass(
  scheduledClassId: string,
  createdBy: string | null,
  client?: TypedSupabaseClient,
  opts: { readiness?: RecapReadiness } = {},
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();

  const existing = await getRecapByClass(scheduledClassId, supabase);
  if (existing) return existing;

  const { data: cls, error: clsErr } = await supabase
    .from('nexus_scheduled_classes')
    .select(
      'id, classroom_id, title, recording_url, youtube_url, transcript_url, recording_duration_minutes',
    )
    .eq('id', scheduledClassId)
    .single();
  if (clsErr) throw clsErr;

  const durationSeconds =
    cls.recording_duration_minutes != null ? Math.round(cls.recording_duration_minutes * 60) : null;

  // Prefer the SharePoint recording (has a transcript for AI generation); fall
  // back to the durable YouTube backup so the recap always has a playable video.
  const hasSharePoint = !!cls.recording_url;
  const videoSource = hasSharePoint ? 'sharepoint' : cls.youtube_url ? 'youtube' : 'sharepoint';
  const recordingUrl = hasSharePoint ? cls.recording_url : cls.youtube_url ?? null;

  const { data, error } = await supabase
    .from(RECAPS)
    .insert({
      scheduled_class_id: scheduledClassId,
      classroom_id: cls.classroom_id ?? null,
      title: cls.title || 'Class recap',
      recording_url: recordingUrl,
      transcript_url: cls.transcript_url ?? null,
      video_source: videoSource,
      video_duration_seconds: durationSeconds,
      status: 'draft',
      ...(opts.readiness ? { readiness: opts.readiness } : {}),
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
  const [recap] = await withClassTitles(supabase, [data]);
  recap.sections = sortSections(recap.sections || []);
  return recap as NexusClassRecap & { sections: NexusClassRecapSection[] };
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
/**
 * How many checkpoint attempts students have recorded against this recap.
 * Cheap: one id read plus a head count.
 */
async function countRecapAttemptRows(supabase: any, recapId: string): Promise<number> {
  const { data: sectionRows } = await supabase.from(SECTIONS).select('id').eq('recap_id', recapId);
  const ids = (sectionRows || []).map((r: any) => r.id);
  if (!ids.length) return 0;
  const { count } = await supabase
    .from(ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .in('section_id', ids);
  return count || 0;
}

export async function replaceRecapSections(
  recapId: string,
  sections: GeneratedRecapSection[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // FIRST GENERATION ONLY. This function deletes the recap's sections, and
  // nexus_class_recap_attempts.section_id is ON DELETE CASCADE, so every delete
  // takes students' passed checkpoints with it and markRecapCompletedIfAllPassed
  // then re-locks them. Refuse rather than destroy: once anyone has attempted a
  // checkpoint, edits must go through updateRecapSections, which diffs.
  const priorAttempts = await countRecapAttemptRows(supabase, recapId);
  if (priorAttempts > 0) throw new Error('RECAP_HAS_ATTEMPTS');

  // Tear down the bank mirror for this recap's existing sections before replacing them.
  try {
    const { data: oldSections } = await supabase.from(SECTIONS).select('id').eq('recap_id', recapId);
    for (const os of oldSections || []) {
      await removeRecapSectionMirror(supabase, (os as any).id);
    }
  } catch (err) {
    console.error('[recap] bank mirror teardown failed (non-fatal):', err instanceof Error ? err.message : err);
  }

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
        // Both NULLable, and NULL is not "unset" for either: a NULL
        // questions_to_serve serves the entire bank, and a NULL
        // min_questions_to_pass then requires every one of them correct. The
        // generator now always supplies both.
        min_questions_to_pass: s.min_questions_to_pass ?? null,
        questions_to_serve: s.questions_to_serve ?? null,
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

      // Mirror this checkpoint's questions into the bank + unified engine (best-effort).
      try {
        await composeAndPlaceRecapSection(supabase, {
          sectionId: section.id,
          title: s.title,
          sortOrder: i,
          minQuestionsToPass: s.min_questions_to_pass ?? null,
          questions,
        });
      } catch (err) {
        console.error('[recap] bank mirror failed (non-fatal):', err instanceof Error ? err.message : err);
      }
    }
  }

  const { error: uErr } = await supabase
    .from(RECAPS)
    .update({ generated_at: new Date().toISOString() })
    .eq('id', recapId);
  if (uErr) throw uErr;
}

/**
 * Rewrite one checkpoint's questions and re-mirror it into the question bank.
 *
 * Safe to run on a checkpoint students have already passed, because attempts
 * reference section_id and never question ids. Old questions are deactivated
 * rather than deleted so a stored answer set from an earlier attempt still
 * resolves to readable question text.
 */
async function rewriteSectionQuestions(
  supabase: any,
  sectionId: string,
  section: GeneratedRecapSection,
  sortIndex: number,
): Promise<void> {
  const questions = (section.questions || []).filter((q) => q.question_text);

  const { error: deacErr } = await supabase
    .from(QUESTIONS)
    .update({ is_active: false })
    .eq('section_id', sectionId)
    .eq('is_active', true);
  if (deacErr) throw deacErr;

  if (!questions.length) return;

  const { error: qErr } = await supabase.from(QUESTIONS).insert(
    questions.map((q, qi) => ({
      section_id: sectionId,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: ['a', 'b', 'c', 'd'].includes(q.correct_option) ? q.correct_option : 'a',
      explanation: q.explanation ?? null,
      sort_order: qi,
      is_active: true,
    })),
  );
  if (qErr) throw qErr;

  // Re-mirror. The teardown must run first: uq_placement_single_test allows only
  // ONE active placement per (context_type, context_id) for a recap checkpoint,
  // so inserting a second one for the same section would 23505.
  try {
    await removeRecapSectionMirror(supabase, sectionId);
    await composeAndPlaceRecapSection(supabase, {
      sectionId,
      title: section.title,
      sortOrder: sortIndex,
      minQuestionsToPass: section.min_questions_to_pass ?? null,
      questions,
    });
  } catch (err) {
    console.error('[recap] bank mirror refresh failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * Save checkpoints over a recap students are already working through.
 *
 * Diffs by section id instead of tearing down: a supplied id updates in place,
 * a missing id inserts, and anything the teacher dropped is archived rather than
 * deleted. The net effect is the rule the UI promises, which is that editing a
 * question, fixing a wrong answer, adding or removing questions, and nudging a
 * boundary all leave existing passes intact. Only an explicit "reset this
 * checkpoint for everyone" clears passes, and that is a separate deliberate act.
 */
export async function updateRecapSections(
  recapId: string,
  sections: GeneratedRecapSection[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Deliberately reads ARCHIVED sections too. They are two different questions:
  // "can this id be updated in place" has to consider archived rows, or sending
  // back a checkpoint that was removed earlier would insert a duplicate and
  // strand the original's attempts on an invisible row. "What should now be
  // archived" only concerns the ones currently live.
  const { data: existingRows, error: exErr } = await supabase
    .from(SECTIONS)
    .select('id, archived_at')
    .eq('recap_id', recapId);
  if (exErr) throw exErr;
  const knownIds = new Set<string>((existingRows || []).map((r: any) => r.id));
  const liveIds = new Set<string>(
    (existingRows || []).filter((r: any) => r.archived_at == null).map((r: any) => r.id),
  );

  const ordered = [...sections].sort(
    (a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds,
  );
  const keptIds = new Set<string>();

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const patch = {
      title: s.title,
      description: s.description ?? null,
      start_timestamp_seconds: Math.max(0, Math.round(s.start_timestamp_seconds)),
      end_timestamp_seconds: Math.round(s.end_timestamp_seconds),
      sort_order: i,
      min_questions_to_pass: s.min_questions_to_pass ?? null,
      questions_to_serve: s.questions_to_serve ?? null,
    };

    let sectionId: string;
    if (s.id && knownIds.has(s.id)) {
      const { error } = await supabase
        .from(SECTIONS)
        // archived_at cleared so re-adding a checkpoint the teacher removed
        // earlier in the same session revives it, passes and all.
        .update({ ...patch, archived_at: null })
        .eq('id', s.id);
      if (error) throw error;
      sectionId = s.id;
    } else {
      const { data, error } = await supabase
        .from(SECTIONS)
        .insert({ recap_id: recapId, ...patch })
        .select('id')
        .single();
      if (error) throw error;
      sectionId = data.id;
    }
    keptIds.add(sectionId);

    await rewriteSectionQuestions(supabase, sectionId, s, i);
  }

  const removed = [...liveIds].filter((id) => !keptIds.has(id));
  if (removed.length) {
    const { error } = await supabase
      .from(SECTIONS)
      .update({ archived_at: new Date().toISOString() })
      .in('id', removed);
    if (error) throw error;
    for (const id of removed) {
      try {
        await removeRecapSectionMirror(supabase, id);
      } catch (err) {
        console.error('[recap] mirror teardown failed (non-fatal):', err instanceof Error ? err.message : err);
      }
    }
  }

  const { error: uErr } = await supabase
    .from(RECAPS)
    .update({ generated_at: new Date().toISOString() })
    .eq('id', recapId);
  if (uErr) throw uErr;
}

/**
 * The entry point every caller should use. Picks the destructive rewrite only
 * while it is still safe, which is before publication and before anyone has
 * attempted a checkpoint. The choice lives here rather than in a route so a
 * future caller cannot reintroduce the data loss by picking the wrong one.
 */
export async function saveRecapSections(
  recapId: string,
  sections: GeneratedRecapSection[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { data: recap } = await supabase
    .from(RECAPS)
    .select('id, status')
    .eq('id', recapId)
    .single();
  const attempts = await countRecapAttemptRows(supabase, recapId);

  if (recap?.status === 'published' || attempts > 0) {
    return updateRecapSections(recapId, sections, supabase);
  }
  return replaceRecapSections(recapId, sections, supabase);
}

/** Delete the composed/placed bank test for a recap section + any exclusively-owned bank questions. */
async function removeRecapSectionMirror(supabase: any, sectionId: string): Promise<void> {
  const { data: priorPlacements } = await supabase
    .from('nexus_test_placements')
    .select('id, test_id')
    .eq('context_type', 'class_recap_section')
    .eq('context_id', sectionId)
    .eq('is_active', true);

  for (const p of priorPlacements || []) {
    const { data: priorTqs } = await supabase
      .from('nexus_test_questions')
      .select('qb_question_id')
      .eq('test_id', p.test_id);
    const priorQids = (priorTqs || []).map((r: any) => r.qb_question_id).filter(Boolean);

    await supabase.from('nexus_tests').delete().eq('id', p.test_id);

    for (const qid of priorQids) {
      const { count } = await supabase
        .from('nexus_test_questions')
        .select('test_id', { count: 'exact', head: true })
        .eq('qb_question_id', qid);
      if (!count || count === 0) {
        await supabase.from('nexus_qb_questions').delete().eq('id', qid);
      }
    }
  }
}

/** Create bank questions for a recap checkpoint, compose a test, and place it on the section. */
async function composeAndPlaceRecapSection(
  supabase: any,
  input: {
    sectionId: string;
    title?: string | null;
    sortOrder: number;
    minQuestionsToPass: number | null;
    questions: Array<{ question_text: string; option_a: string; option_b: string; option_c?: string | null; option_d?: string | null; correct_option: string; explanation?: string | null }>;
  },
): Promise<void> {
  const OPTS = ['a', 'b', 'c', 'd'] as const;
  const bankRows = input.questions.map((q) => ({
    question_text: q.question_text,
    question_format: 'MCQ',
    options: OPTS.filter((k) => (q as any)[`option_${k}`] != null && (q as any)[`option_${k}`] !== '')
      .map((k) => ({ id: k, text: (q as any)[`option_${k}`] })),
    correct_answer: q.correct_option,
    explanation_brief: q.explanation || 'From a class-recap checkpoint',
    difficulty: 'MEDIUM',
    exam_relevance: 'NATA',
    categories: [],
    status: 'active',
    origin: 'authored',
    answer_source: 'teacher_verified',
    is_active: true,
  }));
  const { data: inserted, error: insErr } = await supabase.from('nexus_qb_questions').insert(bankRows).select('id');
  if (insErr) throw insErr;
  const bankIds = (inserted || []).map((r: any) => r.id);
  if (bankIds.length !== input.questions.length) return;

  const { data: test, error: testErr } = await supabase
    .from('nexus_tests')
    .insert({
      title: input.title || 'Checkpoint',
      test_type: 'untimed',
      total_marks: bankIds.length,
      is_published: true,
      is_active: true,
      is_repository: true,
      // Owned by the recap checkpoint, not editable as a standalone test.
      test_kind: 'content_gate',
      created_from: 'recap_authored',
    })
    .select('id')
    .single();
  if (testErr) throw testErr;

  const tqRows = bankIds.map((id: string, i: number) => ({
    test_id: test.id,
    qb_question_id: id,
    sort_order: i,
    marks: 1,
    negative_marks: 0,
  }));
  await supabase.from('nexus_test_questions').insert(tqRows);

  await supabase.from('nexus_test_placements').insert({
    test_id: test.id,
    context_type: 'class_recap_section',
    context_id: input.sectionId,
    min_questions_to_pass: input.minQuestionsToPass,
    sort_order: input.sortOrder,
    gating: { sequential_unlock: true },
  });
}

/**
 * Switch the recap's video source between the SharePoint (Teams) recording and
 * the durable YouTube backup, pulling the matching URL from the linked scheduled
 * class when there is one. For an ad-hoc recap (no scheduled class) it just flips
 * the source flag and leaves the pasted recording_url in place.
 */
export async function setRecapVideoSource(
  recapId: string,
  source: 'sharepoint' | 'youtube',
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();
  const { data: recap, error: rErr } = await supabase
    .from(RECAPS)
    .select('id, scheduled_class_id, recording_url')
    .eq('id', recapId)
    .single();
  if (rErr) throw rErr;

  const patch: Record<string, unknown> = { video_source: source };
  if (recap.scheduled_class_id) {
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('recording_url, youtube_url')
      .eq('id', recap.scheduled_class_id)
      .single();
    if (cls) {
      const url = source === 'youtube' ? cls.youtube_url : cls.recording_url;
      if (url) patch.recording_url = url;
    }
  }

  const { data, error } = await supabase
    .from(RECAPS)
    .update(patch)
    .eq('id', recapId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusClassRecap;
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
    .eq('is_active', true)
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
    // An archived checkpoint must not open a quiz. Reads as "not found", which
    // is what the caller already handles.
    .is('archived_at', null)
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
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as NexusClassRecapQuestion[]) || [];
}

/** Ordered section ids for a recap (for sequential-unlock checks). */
/**
 * Record what the pipeline decided about a recap.
 *
 * Publishing sets BOTH status and readiness. Holding leaves status at 'draft',
 * which is what keeps the student side unchanged: loadClassFacts and
 * listPublishedRecapsForStudent already ignore drafts, so a held recap needs no
 * new branch anywhere a student can see.
 */
export async function setRecapReadiness(
  recapId: string,
  input: {
    readiness: RecapReadiness;
    publish?: boolean;
    hold_reason?: string | null;
    hold_detail?: string | null;
    quality_score?: number | null;
    quality_report?: unknown;
    bumpAttempts?: boolean;
    currentAttempts?: number;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const patch: Record<string, unknown> = {
    readiness: input.readiness,
    hold_reason: input.hold_reason ?? null,
    hold_detail: input.hold_detail ? String(input.hold_detail).slice(0, 500) : null,
  };
  if (input.quality_score != null) patch.quality_score = input.quality_score;
  if (input.quality_report !== undefined) patch.quality_report = input.quality_report;
  if (input.bumpAttempts) patch.generation_attempts = (input.currentAttempts ?? 0) + 1;

  if (input.publish) {
    const now = new Date().toISOString();
    patch.status = 'published';
    patch.published_at = now;
    patch.auto_published_at = now;
  }

  const { error } = await supabase.from(RECAPS).update(patch).eq('id', recapId);
  if (error) throw error;
}

/**
 * Recaps a tutor needs to look at: generated but not servable.
 *
 * Held and failed only. 'pending' means the sweep has the row and has not
 * finished with it, which resolves by itself tonight and is not a decision
 * anyone needs to make; listing it would train tutors to ignore this queue.
 */
export async function listRecapsNeedingReview(
  classroomIds: string[],
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap[]> {
  if (!classroomIds.length) return [];
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select('*')
    .in('classroom_id', classroomIds)
    .in('readiness', ['held', 'failed'])
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return withClassTitles(supabase, (data as NexusClassRecap[]) || []);
}

export interface RecapDraw {
  id: string;
  student_id: string;
  section_id: string;
  attempt_number: number;
  question_ids: string[];
  option_maps: Record<string, string[]>;
  consumed_at: string | null;
}

/**
 * The exact paper a student was served for one attempt.
 *
 * Persisted rather than recomputed so grading can never disagree with what was
 * displayed. A student who reloads mid-quiz, or whose submit arrives after a
 * deploy changed the shuffle, is still graded against the questions they
 * actually saw.
 */
export async function getRecapDraw(
  studentId: string,
  sectionId: string,
  attemptNumber: number,
  client?: TypedSupabaseClient,
): Promise<RecapDraw | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(DRAWS)
    .select('*')
    .eq('student_id', studentId)
    .eq('section_id', sectionId)
    .eq('attempt_number', attemptNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as RecapDraw) || null;
}

/**
 * Record the paper for an attempt, tolerating a duplicate.
 *
 * Two GETs racing (a double tap, or a reload while the first is in flight) both
 * try to create the same attempt's draw. The unique key makes the loser fail;
 * re-reading rather than throwing means both requests serve the same paper,
 * which is the correct outcome.
 */
export async function createRecapDraw(
  input: {
    student_id: string;
    section_id: string;
    attempt_number: number;
    question_ids: string[];
    option_maps: Record<string, string[]>;
  },
  client?: TypedSupabaseClient,
): Promise<RecapDraw> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(DRAWS).insert(input).select('*').single();
  if (error) {
    const existing = await getRecapDraw(
      input.student_id,
      input.section_id,
      input.attempt_number,
      supabase,
    );
    if (existing) return existing;
    throw error;
  }
  return data as RecapDraw;
}

/** Mark a draw as spent once its attempt has been graded. */
export async function consumeRecapDraw(
  drawId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase
    .from(DRAWS)
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', drawId)
    .is('consumed_at', null);
}

export async function listRecapSectionOrder(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; sort_order: number }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SECTIONS)
    .select('id, sort_order')
    .eq('recap_id', recapId)
    // Drives sequential unlock AND completion. An archived checkpoint left in
    // here would gate a student on a checkpoint the teacher deleted, and would
    // stop the recap ever counting as complete.
    .is('archived_at', null)
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
  const rows = (data || []).map((r) => {
    const { sections, progress, ...rest } = r;
    return {
      ...rest,
      section_count: (sections || []).length,
      completed_count: (progress || []).filter((p) => p.status === 'completed').length,
      in_progress_count: (progress || []).filter((p) => p.status === 'in_progress').length,
    };
  });
  return withClassTitles(supabase, rows);
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

  const rows = (data || []).map((r) => {
    const { sections, progress, ...rest } = r;
    const mine = (progress || []).find((p) => p.student_id === studentId);
    return {
      ...rest,
      section_count: (sections || []).length,
      progress_status: mine?.status ?? null,
    };
  });
  return withClassTitles(supabase, rows);
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
