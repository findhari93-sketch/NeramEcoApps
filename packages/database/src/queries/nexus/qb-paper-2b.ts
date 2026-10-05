/**
 * JEE Paper 2B (B.Planning) papers, built from their Paper 2A sitting.
 *
 * In a JEE Main sitting the two papers share their Maths and Aptitude
 * questions word for word; 2B then has 25 Planning MCQs where 2A has its
 * drawings. A question row belongs to exactly one paper (original_paper_id), so
 * a 2B paper gets its own COPY of the shared questions, linked back to the 2A
 * original through repeat_group_id, the same link that marks any repeat.
 *
 * copySharedSectionsFromPaper2A fills a 2B paper's Maths and Aptitude. Moving
 * Planning questions that were uploaded into a 2A paper lives in
 * qb-paper-move.ts, with every other cross-exam move.
 *
 * The copy is one-time. Fixing an answer key on 2A later does not reach 2B.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusQBOriginalPaper, QBQuestionSection } from '../../types';
import { refreshPaperStats } from './question-bank';

const PAPERS = 'nexus_qb_original_papers';
const QUESTIONS = 'nexus_qb_questions';
const SOURCES = 'nexus_qb_question_sources';
const QUESTION_TAGS = 'nexus_qb_question_tags';

/**
 * The generated Database type predates nexus_qb_question_tags and the section
 * columns, so the typed client refuses them. Loose here, in one place, rather
 * than @ts-nocheck over the whole file.
 */
type LooseClient = { from: (table: string) => any };
const loose = (client: TypedSupabaseClient): LooseClient => client as unknown as LooseClient;

/** The sections a 2B paper takes from its 2A sitting. */
export const QB_2B_SHARED_SECTIONS: readonly QBQuestionSection[] = ['math_mcq', 'math_numerical', 'aptitude'];

/**
 * Columns a copy must not carry over: its own identity, timestamps, and the
 * columns Postgres computes (question_text_norm is GENERATED ALWAYS, the search
 * columns are kept by a trigger).
 */
const NOT_COPIED = new Set([
  'id',
  'created_at',
  'updated_at',
  'question_text_norm',
  'search_vector_public',
  'search_vector_full',
  'search_doc_norm',
]);

export class Paper2BError extends Error {
  constructor(
    message: string,
    /** HTTP status the route should answer with. */
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'Paper2BError';
  }
}

type Sitting = Pick<NexusQBOriginalPaper, 'year' | 'session' | 'shift'>;

function describeSitting(s: Sitting): string {
  const shift = s.shift === 'forenoon' ? ' (FN)' : s.shift === 'afternoon' ? ' (AN)' : '';
  return `${s.year}${s.session ? ` ${s.session}` : ''}${shift}`;
}

async function getPaper(id: string, client: TypedSupabaseClient): Promise<NexusQBOriginalPaper> {
  const { data, error } = await loose(client).from(PAPERS).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Paper2BError('Paper not found', 404);
  return data as NexusQBOriginalPaper;
}

/** The paper of `examType` for the same sitting (year, session, shift), or null. */
export async function findPaperForSitting(
  examType: 'JEE_PAPER_2' | 'JEE_PAPER_2B',
  sitting: Sitting,
  client?: TypedSupabaseClient,
): Promise<NexusQBOriginalPaper | null> {
  const supabase = loose(client || getSupabaseAdminClient());
  let query = supabase.from(PAPERS).select('*').eq('exam_type', examType).eq('year', sitting.year);
  query = sitting.session ? query.eq('session', sitting.session) : query.is('session', null);
  query = sitting.shift ? query.eq('shift', sitting.shift) : query.is('shift', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as NexusQBOriginalPaper | null) ?? null;
}

export interface CopyFrom2AResult {
  paper_id: string;
  source_paper_id: string;
  copied: number;
  /** Sections left alone because the 2B paper already had questions in them. */
  skipped_sections: QBQuestionSection[];
}

/**
 * Copy the Maths and Aptitude questions of the matching Paper 2A into a 2B paper.
 *
 * Idempotent per section: a section the 2B paper already has any question in is
 * skipped, so pressing the button twice, or after typing some Maths by hand,
 * never duplicates anything.
 */
export async function copySharedSectionsFromPaper2A(
  targetPaperId: string,
  callerId: string | null,
  client?: TypedSupabaseClient,
): Promise<CopyFrom2AResult> {
  const typed = client || getSupabaseAdminClient();
  const supabase = loose(typed);
  const target = await getPaper(targetPaperId, typed);
  if (target.exam_type !== 'JEE_PAPER_2B') {
    throw new Paper2BError('Only a JEE Paper 2B paper takes its Maths and Aptitude from Paper 2A', 400);
  }

  const source = await findPaperForSitting('JEE_PAPER_2', target, typed);
  if (!source) {
    throw new Paper2BError(
      `There is no JEE Paper 2A (B.Arch) for ${describeSitting(target)} to copy from. Upload that paper first.`,
      404,
    );
  }

  // What the 2B paper already holds, per section.
  const { data: existingRows, error: existingError } = await supabase
    .from(QUESTIONS)
    .select('section')
    .eq('original_paper_id', target.id);
  if (existingError) throw existingError;
  const present = new Set(((existingRows || []) as Array<{ section: string | null }>).map((r) => r.section));
  const skipped = QB_2B_SHARED_SECTIONS.filter((s) => present.has(s));
  const wanted = QB_2B_SHARED_SECTIONS.filter((s) => !present.has(s));

  if (wanted.length === 0) {
    return { paper_id: target.id, source_paper_id: source.id, copied: 0, skipped_sections: [...skipped] };
  }

  const { data: originals, error: originalsError } = await supabase
    .from(QUESTIONS)
    .select('*')
    .eq('original_paper_id', source.id)
    .in('section', wanted as string[])
    .order('section_order', { ascending: true })
    .order('display_order', { ascending: true });
  if (originalsError) throw originalsError;
  const rows = (originals || []) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    throw new Paper2BError(
      `JEE Paper 2A (B.Arch) for ${describeSitting(target)} has no Maths or Aptitude questions to copy yet.`,
      409,
    );
  }

  // Each original gets a repeat group if it has none, so the copy and the
  // original show each other as "Also appeared in".
  const groupFor = new Map<string, string>();
  const needGroup: string[] = [];
  for (const row of rows) {
    const id = row.id as string;
    const group = (row.repeat_group_id as string | null) ?? crypto.randomUUID();
    groupFor.set(id, group);
    if (!row.repeat_group_id) needGroup.push(id);
  }
  for (const id of needGroup) {
    const { error } = await supabase
      .from(QUESTIONS)
      .update({ repeat_group_id: groupFor.get(id) } as never)
      .eq('id', id);
    if (error) throw error;
  }

  // Ids minted here, so each copy can be paired with its original for the tag
  // copy below without relying on the order rows come back in.
  const originalOfCopy = new Map<string, string>();
  const inserts = rows.map((row) => {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!NOT_COPIED.has(key)) copy[key] = value;
    }
    copy.id = crypto.randomUUID();
    originalOfCopy.set(copy.id as string, row.id as string);
    copy.original_paper_id = target.id;
    copy.repeat_group_id = groupFor.get(row.id as string);
    copy.exam_relevance = 'JEE';
    if (callerId) copy.created_by = callerId;
    return copy;
  });

  const { data: created, error: insertError } = await supabase
    .from(QUESTIONS)
    .insert(inserts as never)
    .select('id, display_order');
  if (insertError) throw insertError;
  const createdRows = (created || []) as Array<{ id: string; display_order: number | null }>;

  // Source rows, so the copy is counted under JEE Paper 2B in every
  // exam-scoped list (practice, weightage, the exam tree).
  if (createdRows.length > 0) {
    const { error: sourceError } = await supabase.from(SOURCES).insert(
      createdRows.map((r) => ({
        question_id: r.id,
        exam_type: 'JEE_PAPER_2B',
        year: target.year,
        session: target.session,
        shift: target.shift,
        question_number: r.display_order,
      })) as never,
    );
    if (sourceError) throw sourceError;
  }

  // Tags travel with the question.
  const originalIds = rows.map((r) => r.id as string);
  const { data: tagRows, error: tagError } = await supabase
    .from(QUESTION_TAGS)
    .select('question_id, tag_id')
    .in('question_id', originalIds);
  if (tagError) throw tagError;
  const tagsByOriginal = new Map<string, string[]>();
  for (const t of (tagRows || []) as Array<{ question_id: string; tag_id: string }>) {
    const list = tagsByOriginal.get(t.question_id) ?? [];
    list.push(t.tag_id);
    tagsByOriginal.set(t.question_id, list);
  }
  const tagInserts = createdRows.flatMap((r) => {
    const original = originalOfCopy.get(r.id);
    return (original ? tagsByOriginal.get(original) ?? [] : []).map((tag_id) => ({ question_id: r.id, tag_id }));
  });
  if (tagInserts.length > 0) {
    const { error } = await supabase.from(QUESTION_TAGS).insert(tagInserts as never);
    if (error) throw error;
  }

  await refreshPaperStats(target.id, typed);

  return {
    paper_id: target.id,
    source_paper_id: source.id,
    copied: createdRows.length,
    skipped_sections: [...skipped],
  };
}
