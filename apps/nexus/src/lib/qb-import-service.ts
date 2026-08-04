/**
 * The two halves of an AI import, as functions rather than as routes.
 *
 * Both used to live inside their handlers, which was fine while the teacher's
 * paste was the only way questions arrived. The chapter generator asks the model
 * itself and then wants exactly the same dedupe and exactly the same writes, and
 * an HTTP hop from a server route back into another server route would cost a
 * second auth round trip to say nothing new.
 *
 * The routes are now thin: parse, authorise, call one of these, map errors.
 */
import {
  addQuestionTagPairs,
  composeTest,
  createQBQuestion,
  findSimilarQuestions,
  findOrCreateTestFolderPath,
  findOrCreateQBTag,
  getTestFolderById,
  getSupabaseAdminClient,
  updateQBQuestion,
  NEXUS_TEACHER_TEST_KINDS,
} from '@neram/database';
import type { NexusTestKind } from '@neram/database';
import type { TimerType } from '@neram/database';

/* ────────────────────────────── DEDUPE ──────────────────────────────────── */

/** Above this, the two questions are the same question wearing different words. */
export const REUSE_THRESHOLD = 0.9;
/** Between this and REUSE_THRESHOLD, close enough that a human should look. */
export const REVIEW_THRESHOLD = 0.75;

export type ImportAction = 'create' | 'reuse' | 'review';

export interface DedupeInputRow {
  key: string;
  question_text: string;
  exam_relevance?: 'JEE' | 'NATA' | 'BOTH' | null;
}

export interface DedupeCandidate {
  id: string;
  /** Null for an image-only question, which the bank does allow. */
  question_text: string | null;
  options: unknown;
  similarity: number;
  used_in_tests: number;
  verdict: 'likely_duplicate' | 'near_identical' | 'similar';
  correct_answer?: string | null;
  explanation_brief?: string | null;
  difficulty?: string | null;
  exam_relevance?: string | null;
}

export interface DedupeRowResult {
  key: string;
  suggested_action: ImportAction;
  candidates: DedupeCandidate[];
}

export interface DedupeResult {
  results: DedupeRowResult[];
  summary: Record<ImportAction, number>;
}

/**
 * Ask the bank "have we got these already?" one row at a time.
 *
 * Sequential on purpose. Each row is one pg_trgm similarity scan, and firing
 * 200 of them at once against a shared pooler is how a preview turns into an
 * outage on the rest of the app.
 */
export async function dedupeImportRows(rows: DedupeInputRow[]): Promise<DedupeResult> {
  const results: DedupeRowResult[] = [];

  for (const row of rows) {
    const key = typeof row?.key === 'string' ? row.key : '';
    const text = typeof row?.question_text === 'string' ? row.question_text.trim() : '';
    if (!key || text.length < 8) {
      results.push({ key, suggested_action: 'create', candidates: [] });
      continue;
    }

    const examRelevance =
      row?.exam_relevance === 'JEE' || row?.exam_relevance === 'NATA' || row?.exam_relevance === 'BOTH'
        ? row.exam_relevance
        : null;

    let candidates: Awaited<ReturnType<typeof findSimilarQuestions>> = [];
    try {
      candidates = await findSimilarQuestions({ text, examRelevance, tagIds: null });
    } catch (err) {
      // A dedupe miss must not cost the teacher the whole import. Fall back to
      // treating it as new, which is the safe direction: a duplicate that slips
      // in can be merged later, a lost question cannot be recovered.
      console.error('Import dedupe lookup failed for one row:', err);
    }

    const top = candidates[0];
    const suggested: ImportAction = !top
      ? 'create'
      : top.similarity >= REUSE_THRESHOLD
        ? 'reuse'
        : top.similarity >= REVIEW_THRESHOLD
          ? 'review'
          : 'create';

    results.push({
      key,
      suggested_action: suggested,
      /** Only meaningful for reuse/review, but sent always so the UI can show near misses. */
      candidates: candidates.map((c) => ({
        id: c.id,
        question_text: c.question_text,
        options: c.options,
        similarity: c.similarity,
        used_in_tests: c.used_in_tests,
        verdict:
          c.similarity >= REUSE_THRESHOLD
            ? 'likely_duplicate'
            : c.similarity >= REVIEW_THRESHOLD
              ? 'near_identical'
              : 'similar',
      })),
    });
  }

  // The similarity RPC returns only the stem and the options, which is enough
  // to flag a duplicate and not enough to judge which of the two is better.
  // One batched fetch for the rest, after the scan rather than inside it, so
  // this stays a single query no matter how many rows were pasted.
  const candidateIds = [...new Set(results.flatMap((r) => r.candidates.map((c) => c.id)))];
  if (candidateIds.length > 0) {
    const { data: details, error: detailError } = await getSupabaseAdminClient()
      .from('nexus_qb_questions')
      .select('id, correct_answer, explanation_brief, difficulty, exam_relevance')
      .in('id', candidateIds);

    // A failure here costs the comparison detail, not the dedupe itself, so
    // the preview still returns rather than 500ing on an enrichment miss.
    if (detailError) {
      console.error('Import candidate enrichment failed:', detailError.message);
    } else {
      const byId = new Map((details || []).map((d: any) => [d.id, d]));
      for (const r of results) {
        for (const c of r.candidates) {
          const d = byId.get(c.id);
          c.correct_answer = d?.correct_answer ?? null;
          c.explanation_brief = d?.explanation_brief ?? null;
          c.difficulty = d?.difficulty ?? null;
          c.exam_relevance = d?.exam_relevance ?? null;
        }
      }
    }
  }

  const summary = results.reduce(
    (acc, r) => {
      acc[r.suggested_action] += 1;
      return acc;
    },
    { create: 0, reuse: 0, review: 0 } as Record<ImportAction, number>,
  );

  return { results, summary };
}

/* ────────────────────────────── COMMIT ──────────────────────────────────── */

export type RowAction = 'create' | 'reuse' | 'merge' | 'replace' | 'keep_both' | 'skip';

/** Actions that need an existing bank question to point at. */
const DUPLICATE_ACTIONS: RowAction[] = ['reuse', 'merge', 'replace', 'keep_both'];

export interface CommitRow {
  action?: RowAction;
  existing_question_id?: string | null;
  use_in_test?: 'new' | 'existing';
  question_text?: string;
  question_format?: 'MCQ' | 'NUMERICAL';
  options?: Array<{ id: string; text: string }> | null;
  correct_answer?: string;
  explanation?: string | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  exam_relevance?: 'JEE' | 'NATA' | 'BOTH';
  tag_ids?: string[];
  new_tag_slugs?: string[];
}

export interface CommitImportInput {
  title: string;
  callerId: string;
  rows: CommitRow[];
  newTags?: Array<{ slug?: string; label?: string }>;
  /** Bank questions added alongside the import, appended after it. */
  extraQuestionIds?: string[];
  folderId?: string | null;
  folderPath?: string[] | null;
  testKind?: NexusTestKind;
  timerType?: TimerType;
  durationMinutes?: number | null;
  perQuestionSeconds?: number | null;
  passingPct?: number | null;
  isPublished?: boolean;
  /** How many questions one sitting asks. Omit to ask all of them. */
  questionsToServe?: number | null;
  /** Provenance stamp on nexus_tests. 'ai_import' for a paste, 'ai_pdf' for a generated chapter. */
  createdFrom?: string;
  /** What origin the new bank questions carry. */
  origin?: 'authored' | 'imported';
}

export interface CommitImportResult {
  test_id: string;
  folder_id: string | null;
  question_count: number;
  created: number;
  reused: number;
  merged: number;
  replaced: number;
  kept_both: number;
  skipped: number;
  tags_created: number;
  tags_linked: number;
  /** The bank ids the composed test holds, in order. Lets a caller record what it built. */
  question_ids: string[];
}

/** A caller's mistake rather than a failure, so the route can answer 400 instead of 500. */
export class ImportInputError extends Error {}

/**
 * Write the approved tags, the approved questions, and compose the test.
 *
 * The duplicate actions are the teacher's four answers to "the bank already has
 * something like this": keep what is there (reuse), top it up (merge), prefer
 * the new wording (replace), or admit they are different questions after all
 * (keep_both, which then asks which of the two this test should use).
 *
 * Ordering matters: tags first (so a new question can be tagged in the same
 * pass), then questions, then the test. There is no cross-table transaction
 * available through PostgREST, so each step is written to be re-runnable:
 * findOrCreateQBTag is idempotent, and tag writes upsert on their primary key.
 * A failure part way leaves orphan bank questions, which are harmless and
 * searchable, never a half-built test.
 */
export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const title = (input.title || '').trim();
  if (!title) throw new ImportInputError('title is required');

  const rows = input.rows || [];
  const extraIds = (input.extraQuestionIds || []).filter((id) => typeof id === 'string');
  if (rows.length === 0 && extraIds.length === 0) throw new ImportInputError('Nothing to import');
  if (rows.length > 200) throw new ImportInputError('Import at most 200 questions at a time');

  const supabase = getSupabaseAdminClient();
  const callerId = input.callerId;

  // 1. Approved new tags. Only theme tags: exam and subject are the curated,
  //    is_system vocabulary and an import must not extend them.
  const slugToNewTagId = new Map<string, string>();
  let tagsCreated = 0;
  for (const t of input.newTags || []) {
    const label = typeof t?.label === 'string' ? t.label.trim() : '';
    const slug = typeof t?.slug === 'string' ? t.slug.trim() : '';
    if (!label && !slug) continue;
    const { tag, created } = await findOrCreateQBTag(
      { group_type: 'theme', label: label || slug, slug: slug || undefined, created_by: callerId },
      supabase,
    );
    slugToNewTagId.set(tag.slug, tag.id);
    if (slug && slug !== tag.slug) slugToNewTagId.set(slug, tag.id);
    if (created) tagsCreated += 1;
  }

  // 2. Questions, in the teacher's order. The composed test reads this array,
  //    so a reused question sits exactly where the imported one would have.
  const orderedQuestionIds: string[] = [];
  const tagPairs: Array<{ question_id: string; tag_ids: string[] }> = [];
  let created = 0;
  let reused = 0;
  let merged = 0;
  let replaced = 0;
  let keptBoth = 0;
  let skipped = 0;

  /** Write the row as a brand new bank question. Shared by create and keep_both. */
  async function createFromRow(row: CommitRow): Promise<string | null> {
    const text = (row.question_text || '').trim();
    const answer = (row.correct_answer || '').trim();
    if (!text || !answer) return null;
    const format = row.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ';
    const question = await createQBQuestion(
      {
        question_text: text,
        question_format: format,
        options: format === 'MCQ' ? row.options ?? null : null,
        correct_answer: answer,
        explanation_brief: row.explanation ?? null,
        difficulty: row.difficulty || 'MEDIUM',
        exam_relevance: row.exam_relevance || 'BOTH',
        // categories[] is the legacy taxonomy. Imports are tag-native, and
        // syncTagsForNewQuestion is deliberately not called here because the
        // model already chose better tags than a category mapping would.
        categories: [],
        // The enum has carried 'imported' since the tag registry landed, and
        // every AI import wrote 'authored' anyway, which left model-written
        // questions indistinguishable from ones a teacher typed.
        origin: input.origin ?? 'imported',
        status: 'active',
        created_by: callerId,
      },
      supabase,
    );
    return question.id;
  }

  for (const row of rows) {
    const action: RowAction = row?.action || 'create';
    if (action === 'skip') {
      skipped += 1;
      continue;
    }

    // Resolve this row's tags: registry ids the wizard already knew, plus any
    // slug that only became real in step 1.
    const tagIds = new Set<string>((row.tag_ids || []).filter(Boolean));
    for (const slug of row.new_tag_slugs || []) {
      const id = slugToNewTagId.get(slug);
      if (id) tagIds.add(id);
    }

    if (DUPLICATE_ACTIONS.includes(action)) {
      const existingId = row.existing_question_id;
      if (!existingId) {
        skipped += 1;
        continue;
      }

      if (action === 'merge') {
        // Merge FILLS GAPS, it never overwrites. A bank question may already
        // carry a teacher-checked explanation, and silently replacing it with
        // model prose would be a downgrade the teacher never sees. Tags are
        // always additive, which is where most of the value is anyway.
        const { data: existing } = await supabase
          .from('nexus_qb_questions')
          .select('id, explanation_brief')
          .eq('id', existingId)
          .maybeSingle();
        if (existing && !existing.explanation_brief && row.explanation) {
          await updateQBQuestion(existingId, { explanation_brief: row.explanation }, supabase);
        }
        merged += 1;
      } else if (action === 'replace') {
        // Replace is the deliberate opposite of merge, and it is destructive
        // by design: the teacher compared the two side by side and said the
        // new wording is better. Updating in place rather than adding a twin
        // means every test already using this question inherits the fix, and
        // its attempt history stays attached.
        const text = (row.question_text || '').trim();
        const answer = (row.correct_answer || '').trim();
        if (!text || !answer) {
          skipped += 1;
          continue;
        }
        const format = row.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ';
        await updateQBQuestion(
          existingId,
          {
            question_text: text,
            question_format: format,
            options: format === 'MCQ' ? row.options ?? null : null,
            correct_answer: answer,
            explanation_brief: row.explanation ?? null,
            difficulty: row.difficulty || 'MEDIUM',
            exam_relevance: row.exam_relevance || 'BOTH',
          },
          supabase,
        );
        replaced += 1;
      } else if (action === 'keep_both') {
        // Two questions that only looked alike. Both stay in the bank, and the
        // teacher already said which one this particular test should ask.
        const newId = await createFromRow(row);
        if (!newId) {
          skipped += 1;
          continue;
        }
        keptBoth += 1;
        // The tags describe the text the model wrote, so they go on the new
        // row whichever question ends up in the test.
        if (tagIds.size > 0) tagPairs.push({ question_id: newId, tag_ids: [...tagIds] });
        orderedQuestionIds.push(row.use_in_test === 'existing' ? existingId : newId);
        continue;
      } else {
        reused += 1;
      }

      orderedQuestionIds.push(existingId);
      if (tagIds.size > 0) tagPairs.push({ question_id: existingId, tag_ids: [...tagIds] });
      continue;
    }

    // action === 'create'
    const newId = await createFromRow(row);
    if (!newId) {
      skipped += 1;
      continue;
    }
    created += 1;
    orderedQuestionIds.push(newId);
    if (tagIds.size > 0) tagPairs.push({ question_id: newId, tag_ids: [...tagIds] });
  }

  // Bank questions the teacher added alongside the import, appended at the end.
  for (const id of extraIds) {
    if (!orderedQuestionIds.includes(id)) orderedQuestionIds.push(id);
  }

  if (orderedQuestionIds.length === 0) {
    throw new ImportInputError('Every question was skipped, so there is nothing to build a test from.');
  }

  // 3. Tags, batched. Additive upsert, so a retry of this whole call is safe.
  let tagsLinked = 0;
  for (let i = 0; i < tagPairs.length; i += 100) {
    const { inserted } = await addQuestionTagPairs(tagPairs.slice(i, i + 100), callerId, supabase);
    tagsLinked += inserted;
  }

  // 4. Folder. An explicit id wins; otherwise materialise the suggested path.
  let folderId: string | null = null;
  if (typeof input.folderId === 'string' && input.folderId) {
    const folder = await getTestFolderById(input.folderId, supabase);
    if (!folder) throw new ImportInputError('That folder no longer exists');
    folderId = folder.id;
  } else if (Array.isArray(input.folderPath) && input.folderPath.length > 0) {
    const folder = await findOrCreateTestFolderPath({ scope: 'staff' }, input.folderPath, callerId, supabase);
    folderId = folder?.id ?? null;
  }

  // 5. The test itself. The pass mark is expressed as a share of what one
  //    sitting asks, not of the pool, or a 40-question pool serving 20 would
  //    need a mark nobody can reach.
  const servedCount =
    typeof input.questionsToServe === 'number' && input.questionsToServe > 0
      ? Math.min(input.questionsToServe, orderedQuestionIds.length)
      : orderedQuestionIds.length;
  const passingPct = Number(input.passingPct);
  const passingMarks =
    Number.isFinite(passingPct) && passingPct > 0
      ? Math.max(1, Math.round((Math.min(passingPct, 100) / 100) * servedCount))
      : null;

  // The teacher's label for this test. Anything outside the picker's own list
  // falls back rather than throwing, because the CHECK constraint is the real
  // gate and an unknown kind here is a client bug, not a teacher's mistake.
  const testKind: NexusTestKind = NEXUS_TEACHER_TEST_KINDS.some((k) => k.value === input.testKind)
    ? (input.testKind as NexusTestKind)
    : 'classroom_assigned';

  const { id: testId } = await composeTest(
    {
      title,
      questionIds: orderedQuestionIds,
      testKind,
      timerType: input.timerType,
      durationMinutes: input.durationMinutes ?? null,
      perQuestionSeconds: input.perQuestionSeconds ?? null,
      passingMarks,
      isPublished: input.isPublished ?? false,
      isRepository: true,
      createdFrom: input.createdFrom ?? 'ai_import',
      createdBy: callerId,
      folderId,
      questionsToServe: input.questionsToServe ?? null,
    },
    supabase,
  );

  return {
    test_id: testId,
    folder_id: folderId,
    question_count: orderedQuestionIds.length,
    created,
    reused,
    merged,
    replaced,
    kept_both: keptBoth,
    skipped,
    tags_created: tagsCreated,
    tags_linked: tagsLinked,
    question_ids: orderedQuestionIds,
  };
}
