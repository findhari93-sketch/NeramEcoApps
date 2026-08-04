/**
 * The import JSON a test was built from, kept alongside the test.
 *
 * Nothing used to persist it. The wizard parsed the paste in the browser, sent
 * a projection to the dedupe, sent structured rows to the commit, and dropped
 * the payload on unmount. That is why a test's questions have been read-only
 * ever since they were created: there was no document to edit and no route that
 * could have applied one.
 *
 * The payload is REBUILT FROM THE TEST rather than archived from the paste, and
 * that difference is the whole point. A paste is what the model said; the test
 * is what was actually written after duplicates were reused, wordings replaced
 * and bank questions appended. Downloading the paste would hand the teacher a
 * file that does not describe their test.
 *
 * The shape is exactly what validateImportJSON accepts, so a downloaded file
 * can be edited in any editor and handed straight back with no translation.
 */
import { getSupabaseAdminClient } from '@neram/database';

/**
 * The generated Supabase types carry none of the nexus schema: no
 * nexus_test_imports, no nexus_qb_question_tags, no nexus_tests.folder_id. Every
 * query module in packages/database answers this with a whole-file @ts-nocheck;
 * narrowing it to the client, the way geo-students and nexus-members do, keeps
 * the rest of this file honestly type-checked.
 */
const adminDb = () => getSupabaseAdminClient() as any;

export type TestImportSource = 'paste' | 'file_upload' | 'pdf_generate' | 'edit';

export interface TestImportPayloadQuestion {
  /**
   * The bank question this row came from. Ignored by validateImportJSON, which
   * only reads the fields it knows, and load-bearing on the way back in: it is
   * how an edit finds the row it is editing rather than creating a near-twin.
   * Delete it by hand and the question is treated as brand new, which is a
   * reasonable thing for it to mean.
   */
  id: string;
  question: string;
  options: Record<string, string> | null;
  answer: string;
  explanation: string | null;
  /** The sentence from the source document the answer rests on, when there was one. */
  source_quote?: string | null;
  difficulty: string;
  exam: string;
  tag_slugs: string[];
}

export interface TestImportPayload {
  test: { title: string; suggested_folder: string };
  questions: TestImportPayloadQuestion[];
}

export interface TestImportRecord {
  test_id: string;
  payload: TestImportPayload;
  source: TestImportSource;
  source_file_id: string | null;
  prompt_meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Matching key for carrying per-question extras across the commit, which renumbers everything. */
function textKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The folder a test is filed in, as a path.
 *
 * Walked one row at a time rather than through a recursive CTE, because the
 * depth cap is 4 and a recursive RPC for at most four rows is not worth owning.
 */
async function folderPathOf(folderId: string | null, supabase: any): Promise<string[]> {
  const path: string[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current) && path.length < 8) {
    seen.add(current);
    const { data } = await supabase
      .from('nexus_test_folders')
      .select('id, name, parent_id')
      .eq('id', current)
      .maybeSingle();
    if (!data) break;
    path.unshift(String(data.name || ''));
    current = data.parent_id;
  }
  return path.filter(Boolean);
}

/**
 * Read a test back as an import payload.
 *
 * `extras` carries anything the bank does not store. Today that is only
 * source_quote, which has no column on nexus_qb_questions and would otherwise
 * be lost the moment the generator finished, taking with it the only record of
 * why an unreviewed question was trusted.
 */
export async function buildImportPayloadFromTest(
  testId: string,
  extras?: Record<string, { source_quote?: string | null }>,
): Promise<TestImportPayload | null> {
  const supabase = adminDb();

  const { data: test } = await supabase
    .from('nexus_tests')
    .select('id, title, folder_id')
    .eq('id', testId)
    .maybeSingle();
  if (!test) return null;

  const { data: links } = await supabase
    .from('nexus_test_questions')
    .select('qb_question_id, sort_order')
    .eq('test_id', testId)
    .order('sort_order', { ascending: true });

  const ids = (links || []).map((l: any) => l.qb_question_id).filter(Boolean) as string[];
  if (ids.length === 0) {
    return { test: { title: String(test.title || ''), suggested_folder: '' }, questions: [] };
  }

  const [{ data: questions }, { data: tagLinks }, folderPath] = await Promise.all([
    supabase
      .from('nexus_qb_questions')
      .select('id, question_text, question_format, options, correct_answer, explanation_brief, difficulty, exam_relevance')
      .in('id', ids),
    supabase.from('nexus_qb_question_tags').select('question_id, tag:nexus_qb_tags(slug)').in('question_id', ids),
    folderPathOf(test.folder_id ?? null, supabase),
  ]);

  const slugsById = new Map<string, string[]>();
  for (const row of tagLinks || []) {
    const slug = (row as any)?.tag?.slug;
    if (!slug) continue;
    const list = slugsById.get((row as any).question_id) || [];
    list.push(slug);
    slugsById.set((row as any).question_id, list);
  }

  const byId = new Map<string, any>((questions || []).map((q: any) => [q.id, q]));

  const payloadQuestions: TestImportPayloadQuestion[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue;
    // Back to the { a: '...', b: '...' } object the prompt asks for, which is
    // far easier to hand-edit than an array of { id, text } records.
    let options: Record<string, string> | null = null;
    if (Array.isArray(q.options) && q.options.length > 0) {
      options = {};
      for (const o of q.options as Array<{ id?: string; text?: string }>) {
        if (o?.id) options[String(o.id)] = String(o.text ?? '');
      }
    }
    const extra = extras?.[textKey(q.question_text)];
    payloadQuestions.push({
      id,
      question: String(q.question_text || ''),
      options: q.question_format === 'NUMERICAL' ? null : options,
      answer: String(q.correct_answer ?? ''),
      explanation: q.explanation_brief ?? null,
      source_quote: extra?.source_quote ?? null,
      difficulty: String(q.difficulty || 'MEDIUM'),
      exam: String(q.exam_relevance || 'BOTH'),
      tag_slugs: slugsById.get(id) || [],
    });
  }

  return {
    test: { title: String(test.title || ''), suggested_folder: folderPath.join(' / ') },
    questions: payloadQuestions,
  };
}

/**
 * Store (or replace) the payload for a test.
 *
 * One row per test, upserted on test_id. Two rows would mean the file a teacher
 * downloads and the test they are looking at could disagree, which is the exact
 * problem this table exists to remove.
 */
export async function saveTestImportPayload(input: {
  testId: string;
  source: TestImportSource;
  createdBy: string;
  sourceFileId?: string | null;
  promptMeta?: Record<string, unknown>;
  /** Per-question values the bank has no column for, keyed by question text. */
  extras?: Record<string, { source_quote?: string | null }>;
  /** Unused by the build, kept so callers can pass what they composed without a second thought. */
  questionIds?: string[];
}): Promise<void> {
  const payload = await buildImportPayloadFromTest(input.testId, input.extras);
  if (!payload) return;

  const supabase = adminDb();
  const { error } = await supabase.from('nexus_test_imports').upsert(
    {
      test_id: input.testId,
      payload,
      source: input.source,
      source_file_id: input.sourceFileId ?? null,
      prompt_meta: input.promptMeta ?? {},
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'test_id' },
  );
  if (error) throw error;
}

/** The stored payload for a test, or null when it predates this table. */
export async function getTestImportRecord(testId: string): Promise<TestImportRecord | null> {
  const supabase = adminDb();
  const { data, error } = await supabase
    .from('nexus_test_imports')
    .select('test_id, payload, source, source_file_id, prompt_meta, created_by, created_at, updated_at')
    .eq('test_id', testId)
    .maybeSingle();
  if (error) throw error;
  return (data as TestImportRecord) || null;
}

/** Which of these study files already carry a generated test. Drives what a folder run skips. */
export async function studyFilesWithGeneratedTests(fileIds: string[]): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const supabase = adminDb();
  const { data } = await supabase
    .from('nexus_test_imports')
    .select('source_file_id')
    .in('source_file_id', fileIds);
  return new Set((data || []).map((r: any) => r.source_file_id).filter(Boolean));
}
