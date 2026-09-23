/**
 * Which bank question a drawing was practised from.
 *
 * A Question Bank practice attempt already lands in the student's sketchbook
 * like any other drawing, because the sketchbook is a window over
 * drawing_submissions rather than a table of its own. What was missing is the
 * label: a month of squares with no way to tell which one was "JEE 2014 Q81B"
 * and which was Tuesday's ten minute sketch.
 *
 * Read separately rather than added to the sketchbook's own select, on purpose.
 * A name in a PostgREST select list that the database does not have makes the
 * whole request answer an error instead of rows, and this walks two tables that
 * a sketchbook read has no other reason to touch. A label that fails to resolve
 * leaves the drawing exactly as it was; the sketchbook itself never breaks over
 * a caption.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export interface QBPracticeOrigin {
  /** The bank question, to link back to it. */
  qb_question_id: string;
  /** Which option of an "any one of N" drawing. '' is the whole question. */
  part_id: string;
  /** 'A', 'B'..., or null when the question is not split. */
  part_label: string | null;
  /** 'JEE' or 'NATA', as a student says it. */
  exam: string | null;
  year: number | null;
  question_number: number | null;
  /** What to put on screen: "JEE 2014 Q81B", or "Question bank" when the paper is unknown. */
  label: string;
}

interface MirrorRow {
  id: string;
  qb_question_id: string | null;
  qb_part_id: string | null;
}

/** The option `partId` names, out of a drawing_parts JSONB blob. */
function labelOfPart(drawingParts: unknown, partId: string): string | null {
  if (!partId) return null;
  const items = (drawingParts as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const hit = (items as Array<{ id?: string; key?: string; label?: string }>).find(
    (p) => p?.key === partId || p?.id === partId,
  );
  return hit?.label ?? null;
}

/** "JEE" or "NATA". nexus_qb_question_sources spells the exam several ways. */
function examWord(examType: string | null | undefined): string | null {
  if (!examType) return null;
  return /^jee/i.test(examType) ? 'JEE' : 'NATA';
}

function labelFrom(o: Omit<QBPracticeOrigin, 'label'>): string {
  const number = o.question_number ? `Q${o.question_number}${o.part_label ?? ''}` : null;
  const paper = [o.exam, o.year ? String(o.year) : null].filter(Boolean).join(' ');
  const parts = [paper || null, number].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Question bank';
}

/**
 * Where each of these practice drawings came from, keyed by the
 * drawing_questions mirror id that drawing_submissions.question_id holds.
 *
 * Mirrors with no bank question behind them (an assignment's hidden question)
 * are simply absent from the result.
 */
export async function getQBPracticeOrigins(
  mirrorIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, QBPracticeOrigin>> {
  const ids = Array.from(new Set(mirrorIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const supabase: any = client || getSupabaseAdminClient();

  const { data: mirrors, error } = await supabase
    .from('drawing_questions')
    .select('id, qb_question_id, qb_part_id')
    .in('id', ids);
  if (error) throw error;

  // An assignment's hidden drawing question has no bank question behind it.
  const rows = ((mirrors || []) as MirrorRow[]).filter((r) => !!r.qb_question_id);
  if (rows.length === 0) return {};

  const qbIds = Array.from(new Set(rows.map((r) => r.qb_question_id).filter(Boolean) as string[]));

  const [{ data: questions }, { data: sources }] = await Promise.all([
    supabase.from('nexus_qb_questions').select('id, drawing_parts').in('id', qbIds),
    supabase
      .from('nexus_qb_question_sources')
      .select('question_id, exam_type, year, question_number')
      .in('question_id', qbIds)
      .order('year', { ascending: false }),
  ]);

  const partsById = new Map<string, unknown>(
    ((questions || []) as Array<{ id: string; drawing_parts: unknown }>).map((q) => [
      q.id,
      q.drawing_parts,
    ]),
  );

  // Newest paper wins, which is what the practice reader's own numbering does
  // for a question that appears in more than one year.
  const sourceById = new Map<
    string,
    { exam_type: string | null; year: number | null; question_number: number | null }
  >();
  for (const s of (sources || []) as Array<{
    question_id: string;
    exam_type: string | null;
    year: number | null;
    question_number: number | null;
  }>) {
    if (!sourceById.has(s.question_id)) sourceById.set(s.question_id, s);
  }

  const out: Record<string, QBPracticeOrigin> = {};
  for (const row of rows) {
    const qbId = row.qb_question_id as string;
    const partId = row.qb_part_id || '';
    const source = sourceById.get(qbId);
    const base = {
      qb_question_id: qbId,
      part_id: partId,
      part_label: labelOfPart(partsById.get(qbId), partId),
      exam: examWord(source?.exam_type),
      year: source?.year ?? null,
      question_number: source?.question_number ?? null,
    };
    out[row.id] = { ...base, label: labelFrom(base) };
  }
  return out;
}

/**
 * What each of these attempts was drawn with: 'solution', 'peers', both, or
 * nothing at all.
 *
 * Stamped on the row at submit time, so this is a plain read and never a
 * derivation. A student who opened the answer after they had already drawn it
 * has not copied anything.
 */
export async function getQBHelpUsed(
  submissionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, string[]>> {
  const ids = Array.from(new Set(submissionIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const supabase: any = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, qb_help_used')
    .in('id', ids);
  if (error) throw error;

  const out: Record<string, string[]> = {};
  for (const row of (data || []) as Array<{ id: string; qb_help_used: string[] | null }>) {
    if (row.qb_help_used && row.qb_help_used.length > 0) out[row.id] = row.qb_help_used;
  }
  return out;
}
