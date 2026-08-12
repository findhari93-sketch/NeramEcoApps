/**
 * Reading a paper out as data, and writing an edited one back in.
 *
 * The bank has only ever had one door: bulkCreateDraftQuestions, which inserts
 * and cannot update. Uploading a corrected file for an existing paper stopped
 * at getOrCreateOriginalPaper returning "Paper already exists", so the only way
 * to fix forty explanations was to open forty questions in the editor.
 *
 * This module is the other door. It reads a paper into plain rows for a
 * serialiser, and it applies rows back onto one:
 *
 *   - matched by question_number, through nexus_qb_question_sources
 *   - update what the file mentions, insert what is new
 *   - LEAVE what the file does not mention, both whole questions and single
 *     fields
 *
 * That last rule is the one to keep. Every optional field here is
 * `T | null | undefined`, and the three mean different things: undefined is
 * "the file said nothing, do not touch it", null is "the file cleared it".
 * Collapsing them would make a hand-written twelve-question patch wipe the
 * explanations, tags and images of every question it touched.
 *
 * The document format itself lives in apps/nexus/src/lib/paper-json.ts. This
 * module knows nothing about schema names or versions, which is what lets that
 * one be tested without a database.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusQBOriginalPaper,
  NexusQBQuestion,
  NexusQBQuestionOption,
  QBDifficulty,
  QBDrawingFocusPoint,
  QBExamRelevance,
  QBExamType,
  QBQuestionFormat,
  QBQuestionSection,
  QBQuestionStatus,
  QBShift,
} from '../../types';
import { QB_SECTION_ORDER } from '../../types';
import {
  getOrCreateOriginalPaper,
  getQuestionsByPaper,
  originForParsedQuestion,
  parsedQuestionStatus,
  refreshPaperStats,
} from './question-bank';
import { getPaperById, getPlacedPaperTest } from './qb-papers';
import { getQuestionTagIdsBatch, listQBTags, setQuestionTags } from './qb-tags';
import { marksForQuestions, buildPaperBlueprint, schemeForExam, type MarksSource } from './paper-marking';
import { getPaperSectionBreakdown } from './question-bank';

const PAPERS = 'nexus_qb_original_papers';
const QUESTIONS = 'nexus_qb_questions';
const SOURCES = 'nexus_qb_question_sources';
const TEST_ATTEMPTS = 'nexus_test_attempts';

/** How many single-row updates to have in flight at once. */
const WRITE_CONCURRENCY = 8;

// ============================================================================
// Read
// ============================================================================

export interface PaperExportRows {
  paper: NexusQBOriginalPaper;
  questions: NexusQBQuestion[];
  /** question id to its number on this paper. */
  questionNumbers: Record<string, number>;
  /** question id to its registry tag slugs. */
  tagsByQuestion: Record<string, string[]>;
  marking: {
    source: MarksSource;
    scheme: { objective: [number, number]; drawing: [number, number] };
  };
}

/** Question numbers for this paper, from the source rows that name it. */
async function questionNumbersForPaper(
  paper: NexusQBOriginalPaper,
  supabase: TypedSupabaseClient,
): Promise<Record<string, number>> {
  let query = supabase
    .from(SOURCES)
    .select('question_id, question_number')
    .eq('exam_type', paper.exam_type)
    .eq('year', paper.year);

  // A null session and an empty-string session are the same paper as far as
  // the unique index is concerned, so match the index rather than the column.
  query = paper.session ? query.eq('session', paper.session) : query.is('session', null);
  query = paper.shift ? query.eq('shift', paper.shift) : query.is('shift', null);

  const { data, error } = await query;
  if (error) throw error;

  const out: Record<string, number> = {};
  for (const row of (data || []) as Array<{ question_id: string; question_number: number | null }>) {
    if (row.question_number !== null) out[row.question_id] = row.question_number;
  }
  return out;
}

/**
 * Everything a paper export needs, in one pass.
 *
 * Tags come back as slugs, not ids. getQuestionTagIdsBatch returns ids because
 * that is what the workspace chips need, but an id means nothing in another
 * environment: a file exported from staging has to be importable into prod, and
 * only the slug survives that trip.
 */
export async function readPaperForExport(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<PaperExportRows | null> {
  const supabase = client || getSupabaseAdminClient();

  const paper = await getPaperById(paperId, supabase);
  if (!paper) return null;

  const questions = await getQuestionsByPaper(paperId, supabase);
  const questionIds = questions.map((q) => q.id);

  const [questionNumbers, tagIdsByQuestion, breakdown] = await Promise.all([
    questionNumbersForPaper(paper, supabase),
    getQuestionTagIdsBatch(questionIds, supabase),
    getPaperSectionBreakdown(paperId, supabase),
  ]);

  const allTagIds = new Set(Object.values(tagIdsByQuestion).flat());
  const slugById = new Map<string, string>();
  if (allTagIds.size > 0) {
    // The whole registry in one read, rather than chunked .in() lookups against
    // nexus_qb_tags. That table is a few hundred rows and, more to the point, it
    // is absent from the generated Supabase types, so going through listQBTags
    // keeps this file type-checked instead of needing the @ts-nocheck that
    // qb-tags.ts carries.
    for (const tag of await listQBTags({ includeInactive: true }, supabase)) {
      if (allTagIds.has(tag.id)) slugById.set(tag.id, tag.slug);
    }
  }

  const tagsByQuestion: Record<string, string[]> = {};
  for (const [questionId, ids] of Object.entries(tagIdsByQuestion)) {
    const slugs = ids.map((id) => slugById.get(id)).filter((s): s is string => Boolean(s));
    if (slugs.length) tagsByQuestion[questionId] = slugs.sort();
  }

  // Report where the marks in the file come from, so a reader can tell a stated
  // scheme from an assumed one without cross-checking paper-marking.ts.
  const blueprint = buildPaperBlueprint(breakdown, paper.exam_type);
  const { marksSource } = marksForQuestions(questions, blueprint);

  return {
    paper,
    questions,
    questionNumbers,
    tagsByQuestion,
    marking: { source: marksSource, scheme: schemeForExam(paper.exam_type) },
  };
}

/**
 * How many attempts exist against this paper's placed test.
 *
 * The guard on rebuilding. generatePaperMockTest composes a NEW test and
 * relinks the placement, so rebuilding a test students have already sat leaves
 * their attempts hanging off a test nothing points at any more. Counting first
 * is what lets the caller refuse instead.
 */
export async function countPaperTestAttempts(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const placed = await getPlacedPaperTest(paperId, supabase);
  if (!placed) return 0;

  const { count, error } = await supabase
    .from(TEST_ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .eq('test_id', placed.test_id);
  if (error) throw error;
  return count ?? 0;
}

// ============================================================================
// Write
// ============================================================================

/**
 * One question as an uploaded file describes it.
 *
 * Every field is optional and tri-state. undefined means the file did not
 * mention it and the stored value stands; null means the file cleared it.
 */
export interface QBPaperQuestionInput {
  /** Its number on this paper. The match key, and the only required field. */
  question_number: number;
  question_format?: QBQuestionFormat;
  section?: QBQuestionSection;
  question_text?: string | null;
  question_text_hi?: string | null;
  nta_question_id?: string | null;
  options?: NexusQBQuestionOption[] | null;
  correct_answer?: string | null;
  answer_tolerance?: number | null;
  marks_correct?: number | null;
  marks_negative?: number | null;
  difficulty?: QBDifficulty | null;
  categories?: string[];
  tag_slugs?: string[];
  sub_topic?: string | null;
  question_image_url?: string | null;
  solution_image_url?: string | null;
  solution_video_url?: string | null;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
  explanation_brief_hi?: string | null;
  explanation_detailed_hi?: string | null;
  needs_image?: boolean | null;
  /** A label local to the file. Mapped to a real UUID here. */
  choice_group_key?: string | null;
  choice_group_pick?: number | null;
  drawing_marks?: number | null;
  design_principle_tested?: string | null;
  colour_constraint?: string | null;
  objects_to_include?: Array<{ name: string; count?: number }> | null;
  drawing_focus_points?: QBDrawingFocusPoint[] | null;
  is_active?: boolean;
}

export interface ApplyPaperJSONInput {
  /** Pin the write to a known paper. Wins over `identity`. */
  paperId?: string | null;
  /** The identity the file carries, for a create-or-update by tuple. */
  identity?: {
    exam_type: QBExamType;
    year: number;
    session?: string | null;
    shift?: QBShift | null;
  } | null;
  /** Paper-level fields to apply. Undefined keys are left alone. */
  meta?: {
    duration_minutes?: number | null;
    total_marks?: number | null;
    exam_date?: string | null;
    pdf_url?: string | null;
  } | null;
  questions: QBPaperQuestionInput[];
  callerId: string;
}

export interface ApplyPaperJSONResult {
  paper: NexusQBOriginalPaper;
  paper_created: boolean;
  /** Questions inserted from the file. */
  created: number;
  /** Existing questions the file changed. */
  updated: number;
  /** In the file, but identical to what was already stored. */
  unchanged: number;
  /** On the paper and not in the file at all. Deliberately left alone. */
  untouched: number;
  skipped: Array<{ question_number: number | null; reason: string }>;
  /** Tag slugs the file used that are not in the registry. Never auto-created. */
  unknown_tags: string[];
}

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Sorted keys, nulls dropped, so two spellings of the same object compare equal.
 *
 * The case that forced this: bulkCreateDraftQuestions writes
 * `image_url: opt.image_url || null` on every MCQ option, so a real row is
 * `{"id":"a","text":"...","image_url":null,"nta_id":"1"}`. The export drops
 * nulls to keep the file readable for a human, so it comes back without that
 * key. Compared raw, every MCQ on the paper looks changed, and a re-upload that
 * changed nothing would report "47 updated" and rewrite all 47 rows.
 *
 * Only used inside the object branch of `same` below. A null scalar column is
 * still meaningfully different from a set one.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner === null || inner === undefined) continue;
      out[key] = canonical(inner);
    }
    return out;
  }
  return value;
}

/** Deep-ish equality, good enough for the JSONB and array columns here. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }
  return false;
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

/**
 * Registry ids for a set of slugs.
 *
 * Unknown slugs are reported, never created. A tag registry that any uploaded
 * file can extend stops being a taxonomy within a month, and a typo would
 * silently become a permanent tag nobody chose.
 */
async function resolveTagSlugs(
  slugs: string[],
  supabase: TypedSupabaseClient,
): Promise<{ idBySlug: Map<string, string>; unknown: string[] }> {
  const wanted = new Set(slugs.filter(Boolean));
  const idBySlug = new Map<string, string>();
  if (wanted.size === 0) return { idBySlug, unknown: [] };

  // includeInactive, for the same reason findOrCreateQBTag ignores is_active:
  // the UNIQUE(slug) index does too, so a deactivated tag still owns its slug
  // and matching it is better than reporting it as unknown.
  for (const tag of await listQBTags({ includeInactive: true }, supabase)) {
    if (wanted.has(tag.slug)) idBySlug.set(tag.slug, tag.id);
  }

  return { idBySlug, unknown: [...wanted].filter((s) => !idBySlug.has(s)).sort() };
}

/**
 * Apply an uploaded paper document.
 *
 * Never deletes. A question on the paper that the file does not mention is
 * counted as untouched and left exactly as it is, so a partial file is a patch
 * rather than a replacement. Removing a question stays an explicit action on
 * the Questions tab, where it is obvious what is about to disappear.
 */
export async function applyPaperJSON(
  input: ApplyPaperJSONInput,
  client?: TypedSupabaseClient,
): Promise<ApplyPaperJSONResult> {
  const supabase = client || getSupabaseAdminClient();
  const skipped: ApplyPaperJSONResult['skipped'] = [];

  // --- 1. Which paper -------------------------------------------------------
  let paper: NexusQBOriginalPaper | null = null;
  let paperCreated = false;

  if (input.paperId) {
    paper = await getPaperById(input.paperId, supabase);
    if (!paper) throw new Error('PAPER_NOT_FOUND');
  } else if (input.identity) {
    const resolved = await getOrCreateOriginalPaper(
      input.identity.exam_type,
      input.identity.year,
      input.identity.session ?? null,
      input.callerId,
      input.identity.shift ?? null,
      supabase,
    );
    paper = resolved.paper;
    paperCreated = resolved.isNew;
  } else {
    throw new Error('NO_PAPER_IDENTITY');
  }

  // --- 2. Paper-level fields ------------------------------------------------
  // duration_minutes is the important one. Nothing on the import path has ever
  // set it, which is why every imported paper builds an untimed test.
  const paperUpdates: Record<string, unknown> = {};
  for (const key of ['duration_minutes', 'total_marks', 'exam_date', 'pdf_url'] as const) {
    const value = input.meta?.[key];
    if (defined(value) && !same(value, (paper as unknown as Record<string, unknown>)[key])) {
      paperUpdates[key] = value;
    }
  }
  if (Object.keys(paperUpdates).length > 0) {
    const { data, error } = await supabase
      .from(PAPERS)
      .update(paperUpdates as never)
      .eq('id', paper.id)
      .select()
      .single();
    if (error) throw error;
    paper = data as NexusQBOriginalPaper;
  }

  // --- 3. What is already there --------------------------------------------
  const existing = await getQuestionsByPaper(paper.id, supabase);
  const numbers = await questionNumbersForPaper(paper, supabase);

  const byNumber = new Map<number, NexusQBQuestion>();
  for (const q of existing) {
    // The source row is the truth. display_order is the fallback for a question
    // whose source row never landed, which the older import could leave behind.
    const number = numbers[q.id] ?? q.display_order;
    if (number !== null && number !== undefined && !byNumber.has(number)) {
      byNumber.set(number, q);
    }
  }

  // --- 4. Tags and choice groups -------------------------------------------
  const { idBySlug, unknown: unknownTags } = await resolveTagSlugs(
    input.questions.flatMap((q) => q.tag_slugs ?? []),
    supabase,
  );

  // A choice group key is local to the file. Reuse the UUID the matched
  // questions already share, so re-uploading a file does not renumber a group
  // that students are already looking at; otherwise mint one.
  const groupIdByKey = new Map<string, string>();
  for (const q of input.questions) {
    const key = q.choice_group_key;
    if (!key || groupIdByKey.has(key)) continue;
    const shared = input.questions
      .filter((other) => other.choice_group_key === key)
      .map((other) => byNumber.get(other.question_number)?.choice_group_id)
      .find((id): id is string => Boolean(id));
    groupIdByKey.set(key, shared ?? crypto.randomUUID());
  }

  // --- 5. Per question ------------------------------------------------------
  const examRelevance: QBExamRelevance = paper.exam_type === 'JEE_PAPER_2' ? 'JEE' : 'NATA';
  const inserts: Array<{ row: Record<string, unknown>; number: number; tagSlugs?: string[] }> = [];
  const tagWrites: Array<{ questionId: string; tagIds: string[] }> = [];
  let updated = 0;
  let unchanged = 0;

  /** The column values this question mentions, in DB names. */
  function columnsFor(q: QBPaperQuestionInput): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      if (defined(value)) row[key] = value;
    };

    set('question_text', q.question_text);
    set('question_text_hi', q.question_text_hi);
    set('question_format', q.question_format);
    set('nta_question_id', q.nta_question_id);
    set('options', q.options);
    set('correct_answer', q.correct_answer);
    set('answer_tolerance', q.answer_tolerance);
    set('marks_correct', q.marks_correct);
    set('marks_negative', q.marks_negative);
    set('difficulty', q.difficulty);
    set('categories', q.categories);
    set('sub_topic', q.sub_topic);
    set('question_image_url', q.question_image_url);
    set('solution_image_url', q.solution_image_url);
    set('solution_video_url', q.solution_video_url);
    set('explanation_brief', q.explanation_brief);
    set('explanation_detailed', q.explanation_detailed);
    set('explanation_brief_hi', q.explanation_brief_hi);
    set('explanation_detailed_hi', q.explanation_detailed_hi);
    set('needs_image', q.needs_image);
    set('drawing_marks', q.drawing_marks);
    set('design_principle_tested', q.design_principle_tested);
    set('colour_constraint', q.colour_constraint);
    set('objects_to_include', q.objects_to_include);
    set('drawing_focus_points', q.drawing_focus_points);
    set('is_active', q.is_active);

    // section_order is derived, never taken from the file. Letting the two
    // disagree would sit a section in the wrong place in the paper a student
    // sits, with nothing on screen explaining why.
    if (defined(q.section)) {
      row.section = q.section;
      row.section_order = QB_SECTION_ORDER[q.section] ?? null;
    }

    if (defined(q.choice_group_key)) {
      row.choice_group_id = q.choice_group_key ? groupIdByKey.get(q.choice_group_key) : null;
      row.choice_group_pick = q.choice_group_key ? (q.choice_group_pick ?? 1) : null;
    }

    return row;
  }

  for (const q of input.questions) {
    const current = byNumber.get(q.question_number);
    const row = columnsFor(q);

    if (!current) {
      const hasContent = Boolean(row.question_text || row.question_image_url);
      if (!hasContent) {
        // The DB's own question_has_content constraint would reject this. Say
        // which question and why, rather than failing the whole upload on one
        // row a teacher can see and fix.
        skipped.push({
          question_number: q.question_number,
          reason: 'new question with no text and no figure',
        });
        continue;
      }
      const format = (q.question_format ?? 'MCQ') as QBQuestionFormat;
      inserts.push({
        number: q.question_number,
        tagSlugs: q.tag_slugs,
        row: {
          question_format: format,
          difficulty: 'MEDIUM' as QBDifficulty,
          exam_relevance: examRelevance,
          origin: originForParsedQuestion(format),
          original_paper_id: paper.id,
          display_order: q.question_number,
          is_active: false,
          created_by: input.callerId,
          status: parsedQuestionStatus(format, Boolean(row.correct_answer)),
          ...row,
        },
      });
      continue;
    }

    // Only what actually differs. An unchanged upload should be a no-op, not 92
    // writes that bump updated_at and make the paper look freshly edited.
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!same(value, (current as unknown as Record<string, unknown>)[key])) changes[key] = value;
    }

    // An answer arriving on a draft has to move its status, or the question
    // stays unactivatable and never reaches a test.
    if (defined(changes.correct_answer) && current.status !== 'active') {
      const format = (q.question_format ?? current.question_format) as QBQuestionFormat;
      const next = parsedQuestionStatus(format, Boolean(changes.correct_answer));
      if (next !== current.status) changes.status = next;
    }

    if (q.tag_slugs && q.tag_slugs.length > 0) {
      tagWrites.push({
        questionId: current.id,
        tagIds: q.tag_slugs.map((s) => idBySlug.get(s)).filter((id): id is string => Boolean(id)),
      });
    }

    if (Object.keys(changes).length === 0) {
      unchanged += 1;
      continue;
    }

    const { error } = await supabase
      .from(QUESTIONS)
      .update(changes as never)
      .eq('id', current.id);
    if (error) throw error;
    updated += 1;
  }

  // --- 6. Inserts, plus their source rows -----------------------------------
  let created = 0;
  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from(QUESTIONS)
      .insert(inserts.map((i) => i.row) as never)
      .select('id, display_order');
    if (error) throw error;

    const rows = (data || []) as Array<{ id: string; display_order: number | null }>;
    created = rows.length;

    const sourceRows = rows.map((r) => ({
      question_id: r.id,
      exam_type: paper!.exam_type,
      year: paper!.year,
      session: paper!.session,
      shift: paper!.shift,
      question_number: r.display_order,
    }));
    if (sourceRows.length > 0) {
      const { error: sourceError } = await supabase.from(SOURCES).insert(sourceRows as never);
      if (sourceError) throw sourceError;
    }

    const idByNumber = new Map(rows.map((r) => [r.display_order, r.id]));
    for (const insert of inserts) {
      if (!insert.tagSlugs?.length) continue;
      const questionId = idByNumber.get(insert.number);
      if (!questionId) continue;
      tagWrites.push({
        questionId,
        tagIds: insert.tagSlugs
          .map((s) => idBySlug.get(s))
          .filter((id): id is string => Boolean(id)),
      });
    }
  }

  // --- 7. Tags --------------------------------------------------------------
  // Only for questions whose file entry listed tags. An omitted tag_slugs means
  // "not mentioned", so wiping the registry tags off a question because a patch
  // file did not repeat them would lose every drawing-type leaf on the paper.
  await inBatches(
    tagWrites.filter((w) => w.tagIds.length > 0),
    WRITE_CONCURRENCY,
    async (write) => {
      await setQuestionTags(write.questionId, write.tagIds, input.callerId, supabase);
    },
  );

  // --- 8. Paper stats -------------------------------------------------------
  const total = existing.length + created;
  if (total !== paper.total_questions) {
    await supabase
      .from(PAPERS)
      .update({ total_questions: total } as never)
      .eq('id', paper.id);
  }
  await refreshPaperStats(paper.id, supabase);

  const mentioned = new Set(input.questions.map((q) => q.question_number));
  const untouched = [...byNumber.keys()].filter((n) => !mentioned.has(n)).length;

  const finalPaper = (await getPaperById(paper.id, supabase)) ?? paper;

  return {
    paper: finalPaper,
    paper_created: paperCreated,
    created,
    updated,
    unchanged,
    untouched,
    skipped,
    unknown_tags: unknownTags,
  };
}
