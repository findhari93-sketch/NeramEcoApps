/**
 * Applying an edited import payload back onto a test.
 *
 * The hard part is not the writing, it is deciding WHOSE question is being
 * edited. A bank question is a shared object: composeTest stores a reference,
 * not a copy, so the same question can sit in a chapter test, a weekly test and
 * a student's practice pool at once. Editing it in place fixes it everywhere,
 * which is right when a fact is wrong and badly wrong when a teacher is
 * tailoring one paper.
 *
 * The rule, which the UI states out loud before saving:
 *
 *   used by this test only  ->  edited in place
 *   used by other tests too ->  forked, and only this test gets the new version
 *
 * That is the same distinction the import wizard already draws between Replace
 * and Keep both, so a teacher meets one idea rather than two.
 */
import {
  addQuestionTagPairs,
  createQBQuestion,
  findOrCreateQBTag,
  getSupabaseAdminClient,
  listQBTags,
  updateQBQuestion,
} from '@neram/database';
import { validateImportJSON, type ImportQuestion } from './qb-import-schema';

/** The nexus schema is absent from the generated Supabase types. See test-import-store. */
const adminDb = () => getSupabaseAdminClient() as any;

export class TestEditError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

export interface ApplyEditResult {
  question_count: number;
  updated: number;
  /** Edits that became a new question because the original is shared. */
  forked: number;
  added: number;
  removed: number;
  warnings: string[];
}

/** The bank row as this module needs to compare it. */
interface BankRow {
  id: string;
  question_text: string;
  question_format: string;
  options: unknown;
  correct_answer: string | null;
  explanation_brief: string | null;
  difficulty: string | null;
  exam_relevance: string | null;
}

/** Whether the edited question actually differs from what the bank holds. */
function isChanged(existing: BankRow, edited: ImportQuestion): boolean {
  if (existing.question_text.trim() !== edited.question_text.trim()) return true;
  if ((existing.correct_answer ?? '') !== edited.correct_answer) return true;
  if ((existing.explanation_brief ?? '') !== (edited.explanation ?? '')) return true;
  if ((existing.difficulty ?? '') !== edited.difficulty) return true;
  if ((existing.exam_relevance ?? '') !== edited.exam_relevance) return true;

  const before = Array.isArray(existing.options)
    ? (existing.options as Array<{ id?: string; text?: string }>).map((o) => `${o?.id}:${o?.text}`)
    : [];
  const after = (edited.options || []).map((o) => `${o.id}:${o.text}`);
  return before.join('|') !== after.join('|');
}

/**
 * Pair each validated question back to the bank id the file claimed for it.
 *
 * validateImportJSON hands back `key: 'q<index>'` where the index is the row's
 * position in the array it was given, and it drops bad rows rather than failing
 * the file. So the key is the only reliable bridge back to the raw row: a
 * positional walk over the survivors would silently shift every id after the
 * first dropped question, and quietly rewrite the wrong bank rows.
 */
function idsByKey(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(rows)) return out;
    rows.forEach((row: any, index: number) => {
      const id = typeof row?.id === 'string' ? row.id.trim() : '';
      if (id) out.set(`q${index}`, id);
    });
  } catch {
    // The validator reports the parse failure with a usable message; this
    // helper simply has no ids to offer.
  }
  return out;
}

export async function applyEditedImportPayload(input: {
  testId: string;
  raw: string;
  callerId: string;
}): Promise<ApplyEditResult> {
  const supabase = adminDb();

  const registry = (await listQBTags()).map((t: any) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    group_type: t.group_type,
  }));

  const parsed = validateImportJSON(input.raw, registry);
  if (parsed.questions.length === 0) {
    throw new TestEditError(
      parsed.errors[0] || 'That file has no usable questions, so nothing was changed.',
      parsed.errors,
    );
  }

  const { data: test } = await supabase
    .from('nexus_tests')
    .select('id, questions_to_serve')
    .eq('id', input.testId)
    .maybeSingle();
  if (!test) throw new TestEditError('That test no longer exists.');

  // What the test holds now, and how widely each of those is shared.
  const { data: currentLinks } = await supabase
    .from('nexus_test_questions')
    .select('qb_question_id')
    .eq('test_id', input.testId);
  const currentIds = new Set(
    (currentLinks || []).map((l: any) => l.qb_question_id).filter(Boolean) as string[],
  );

  const claimed = idsByKey(input.raw);
  const knownIds = [...new Set([...claimed.values()].filter((id) => currentIds.has(id)))];

  const bankById = new Map<string, BankRow>();
  if (knownIds.length > 0) {
    const { data } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_text, question_format, options, correct_answer, explanation_brief, difficulty, exam_relevance')
      .in('id', knownIds);
    for (const q of data || []) bankById.set((q as BankRow).id, q as BankRow);
  }

  // How many DISTINCT tests hold each of these. One means only this test, so an
  // edit is safe to apply in place.
  const sharedIds = new Set<string>();
  if (knownIds.length > 0) {
    const { data: usage } = await supabase
      .from('nexus_test_questions')
      .select('qb_question_id, test_id')
      .in('qb_question_id', knownIds);
    const testsPerQuestion = new Map<string, Set<string>>();
    for (const row of usage || []) {
      const qId = (row as any).qb_question_id as string;
      const set = testsPerQuestion.get(qId) || new Set<string>();
      set.add((row as any).test_id);
      testsPerQuestion.set(qId, set);
    }
    for (const [qId, tests] of testsPerQuestion) if (tests.size > 1) sharedIds.add(qId);
  }

  // Theme tags the file introduced. Created before the questions so a new
  // question can be tagged in the same pass.
  const slugToNewTagId = new Map<string, string>();
  for (const t of parsed.proposedTags) {
    const { tag } = await findOrCreateQBTag(
      { group_type: 'theme', label: t.label, slug: t.slug, created_by: input.callerId },
      supabase,
    );
    slugToNewTagId.set(t.slug, tag.id);
  }

  const orderedIds: string[] = [];
  const tagPairs: Array<{ question_id: string; tag_ids: string[] }> = [];
  let updated = 0;
  let forked = 0;
  let added = 0;

  for (const q of parsed.questions) {
    const tagIds = new Set<string>(q.tag_ids.filter(Boolean));
    for (const slug of q.new_tag_slugs) {
      const id = slugToNewTagId.get(slug);
      if (id) tagIds.add(id);
    }

    const fields = {
      question_text: q.question_text,
      question_format: q.question_format,
      options: q.question_format === 'MCQ' ? q.options : null,
      correct_answer: q.correct_answer,
      explanation_brief: q.explanation,
      difficulty: q.difficulty,
      exam_relevance: q.exam_relevance,
    };

    const claimedId = claimed.get(q.key);
    const existing = claimedId ? bankById.get(claimedId) : undefined;

    let resolvedId: string;
    if (existing) {
      if (!isChanged(existing, q)) {
        resolvedId = existing.id;
      } else if (sharedIds.has(existing.id)) {
        // Shared with another test. Fork, so this edit cannot reach a paper the
        // teacher was not looking at.
        const created = await createQBQuestion(
          { ...fields, categories: [], origin: 'imported', status: 'active', created_by: input.callerId },
          supabase,
        );
        resolvedId = created.id;
        forked += 1;
      } else {
        await updateQBQuestion(existing.id, fields, supabase);
        resolvedId = existing.id;
        updated += 1;
      }
    } else {
      const created = await createQBQuestion(
        { ...fields, categories: [], origin: 'imported', status: 'active', created_by: input.callerId },
        supabase,
      );
      resolvedId = created.id;
      added += 1;
    }

    // A question listed twice would 23505 the recompose, and asking the same
    // thing twice in one paper is a mistake either way.
    if (!orderedIds.includes(resolvedId)) orderedIds.push(resolvedId);
    if (tagIds.size > 0) tagPairs.push({ question_id: resolvedId, tag_ids: [...tagIds] });
  }

  for (let i = 0; i < tagPairs.length; i += 100) {
    await addQuestionTagPairs(tagPairs.slice(i, i + 100), input.callerId, supabase);
  }

  // Recompose. The links are rebuilt rather than diffed because sort_order has
  // to be contiguous afterwards and a diff would have to renumber everything
  // anyway. Removed questions leave the TEST, never the bank: another test may
  // hold them, and a deleted bank row would take its attempt history with it.
  const { error: delErr } = await supabase
    .from('nexus_test_questions')
    .delete()
    .eq('test_id', input.testId);
  if (delErr) throw delErr;

  const { error: insErr } = await supabase.from('nexus_test_questions').insert(
    orderedIds.map((id, i) => ({
      test_id: input.testId,
      qb_question_id: id,
      sort_order: i,
      marks: 1,
      negative_marks: 0,
    })),
  );
  if (insErr) throw insErr;

  // total_marks follows the paper, and a serve count left above the new
  // question count would quietly stop being a pool at all.
  const serve = Number(test.questions_to_serve);
  const patch: Record<string, unknown> = { total_marks: orderedIds.length, updated_at: new Date().toISOString() };
  if (Number.isFinite(serve) && serve > 0 && serve > orderedIds.length) {
    patch.questions_to_serve = orderedIds.length;
  }
  await supabase.from('nexus_tests').update(patch).eq('id', input.testId);

  const removed = [...currentIds].filter((id) => !orderedIds.includes(id)).length;

  return {
    question_count: orderedIds.length,
    updated,
    forked,
    added,
    removed,
    warnings: parsed.warnings.slice(0, 10),
  };
}
