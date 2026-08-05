/**
 * Turn validated import questions into a published test gating a study chapter.
 *
 * This is everything that happens AFTER something has produced questions, and it
 * is deliberately blind to where they came from. Gemini reading the chapter PDF
 * and a teacher uploading a JSON file they wrote elsewhere converge here, so the
 * two paths cannot drift into filing their tests differently, naming their
 * folders differently, or gating the chapter differently.
 *
 * What varies between the callers is decided before this function is reached:
 * which questions survived (the PDF generator drops anything it cannot quote,
 * an uploaded file keeps everything), and what provenance to stamp. What does
 * not vary is the order below, which matters: dedupe, then commit, then archive
 * the payload, then place it on the chapter. The placement is last on purpose,
 * so a failure part way leaves a test in the library rather than a chapter
 * gated by a test that was never finished being built.
 */
import { getFolderById, linkTestToStudyFile } from '@neram/database';
import { commitImport, dedupeImportRows, type CommitRow } from '@/lib/qb-import-service';
import { saveTestImportPayload, type TestImportSource } from '@/lib/test-import-store';
import type { ImportQuestion, ImportValidationResult } from '@/lib/qb-import-schema';

export interface BuildChapterTestInput {
  /** The study file this test will gate. */
  file: { id: string; title: string; folder_id: string | null };
  /** The validated reply, read for its title, folder suggestion and proposed tags. */
  parsed: ImportValidationResult;
  /**
   * The questions to actually write, which is not always `parsed.questions`:
   * the PDF generator passes only the ones it could ground in the document.
   */
  questions: ImportQuestion[];
  /** How many of the pool one sitting asks. Clamped to the pool by commitImport. */
  serve: number;
  passingPct: number;
  callerId: string;
  source: TestImportSource;
  /** Provenance stamp on nexus_tests. 'ai_pdf' generated, 'study_upload' uploaded. */
  createdFrom: string;
  promptMeta: Record<string, unknown>;
}

export interface BuildChapterTestResult {
  test_id: string;
  title: string;
  created: number;
  reused: number;
  /** The pool the test holds, after dedupe reuse and any skipped rows. */
  question_count: number;
  /** What one sitting asks, never more than the pool. */
  serve: number;
}

export async function buildChapterTest(input: BuildChapterTestInput): Promise<BuildChapterTestResult> {
  const { file, parsed, questions, callerId } = input;

  // ── 1. Dedupe against the bank, resolved without a human ───────────────────
  // At or above the reuse threshold the two are the same question in different
  // words, so the bank's copy is used and its attempt history and tags stay
  // attached. Everything else is new. There is no 'review' outcome here,
  // because neither caller has anybody to review it.
  const dedupe = await dedupeImportRows(
    questions.map((q) => ({
      key: q.key,
      question_text: q.question_text,
      exam_relevance: q.exam_relevance,
    })),
  );
  const verdictByKey = new Map(dedupe.results.map((r) => [r.key, r]));

  const rows: CommitRow[] = questions.map((q) => {
    const verdict = verdictByKey.get(q.key);
    const top = verdict?.candidates?.[0];
    const reuse = verdict?.suggested_action === 'reuse' && top?.id;
    return {
      action: reuse ? 'reuse' : 'create',
      existing_question_id: reuse ? top!.id : null,
      question_text: q.question_text,
      question_format: q.question_format,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      exam_relevance: q.exam_relevance,
      tag_ids: q.tag_ids,
      new_tag_slugs: q.new_tag_slugs,
    };
  });

  // ── 2. Build and file the test ─────────────────────────────────────────────
  const folder = file.folder_id ? await getFolderById(file.folder_id) : null;
  const folderPath =
    parsed.test.folder_path.length > 0
      ? parsed.test.folder_path
      : [folder?.name || 'Study materials', file.title].filter(Boolean);

  const title = parsed.test.title || file.title;

  const result = await commitImport({
    title,
    callerId,
    rows,
    newTags: parsed.proposedTags.map((t) => ({ slug: t.slug, label: t.label })),
    folderPath,
    testKind: 'chapter',
    timerType: 'none',
    passingPct: input.passingPct,
    isPublished: true,
    questionsToServe: input.serve,
    createdFrom: input.createdFrom,
  });

  // ── 3. Keep the paper ──────────────────────────────────────────────────────
  // Archiving this is what makes the test editable later rather than read-only
  // forever, so it is worth doing even though a failure here must not cost the
  // teacher a test that has already been written.
  await saveTestImportPayload({
    testId: result.test_id,
    source: input.source,
    sourceFileId: file.id,
    createdBy: callerId,
    // Keyed by question text because the commit renumbers everything and a
    // skipped row would break any positional pairing.
    extras: Object.fromEntries(
      questions.map((q) => [
        q.question_text.toLowerCase().replace(/[^a-z0-9]/g, ''),
        { source_quote: q.source_quote },
      ]),
    ),
    // Where it was filed is resolved here rather than by the caller, so it is
    // recorded here too instead of every caller having to remember to pass it.
    promptMeta: { ...input.promptMeta, folder_path: folderPath },
  }).catch((err) => console.error('Could not archive the import payload:', err));

  // ── 4. Gate the chapter with it ────────────────────────────────────────────
  await linkTestToStudyFile({
    fileId: file.id,
    testId: result.test_id,
    passingPct: input.passingPct,
    createdBy: callerId,
  });

  return {
    test_id: result.test_id,
    title,
    created: result.created,
    reused: result.reused,
    question_count: result.question_count,
    serve: Math.min(input.serve, result.question_count),
  };
}
