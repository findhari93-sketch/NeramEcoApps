/**
 * How many of each paper's questions have a solution.
 *
 * The paper row stores three counters (parsed, answer keyed, complete) and none
 * of them is about solutions. "complete" reads like it should be, but a drawing
 * prompt lands complete the moment it is imported and an activated question
 * counts too, so a paper of drawings with no worked answers reads 100% complete.
 *
 * A solution is any of the four places one can live: the brief or detailed
 * explanation, a solution image, or a video.
 *
 * A drawing is counted too, and on its image alone. Words do not teach a
 * drawing, and a question split into parts owes one image per part, because in
 * an "attempt any one" the student may answer either option. That is stricter
 * than the rule for everything else, and deliberately the same rule the paper
 * page's "Solution missing" chip applies, so the two screens cannot disagree.
 * Drawings used to be excluded here entirely, which is how a paper of
 * unanswered drawings read 100% solved.
 */

import type { TypedSupabaseClient } from '@neram/database';
import { readDrawingParts } from './drawing-parts';

export interface PaperSolutionCounts {
  /** Questions that owe a solution. Every question, drawings included. */
  solvable: number;
  /** Of those, the ones that do. */
  solved: number;
}

const PAGE = 1000;

/**
 * Read every matching row, a page at a time. PostgREST caps a single response
 * at the project's max rows (1000 by default), and JEE Paper 2 alone holds more
 * than two thousand questions, so one unpaged select would silently undercount.
 */
async function allRows<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function allPaperIds(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<string[]> {
  const rows = await allRows<{ original_paper_id: string | null }>(build);
  return rows.flatMap((row) => (row.original_paper_id ? [row.original_paper_id] : []));
}

/** The columns the drawing half of the count needs. */
export interface DrawingSolutionRow {
  original_paper_id: string | null;
  drawing_parts: unknown;
  solution_image_url: string | null;
}

/**
 * Pure: tally drawing rows. Every part must carry its own solution image, and a
 * drawing that was never split falls back to the question's own column.
 *
 * Its own pass rather than a PostgREST filter because "every element of a JSONB
 * array has a non-null key" is not something the query language can say.
 */
export function tallyDrawingSolutions(
  rows: DrawingSolutionRow[],
): Map<string, PaperSolutionCounts> {
  const counts = new Map<string, PaperSolutionCounts>();
  for (const row of rows) {
    const paperId = row.original_paper_id;
    if (!paperId) continue;
    let entry = counts.get(paperId);
    if (!entry) {
      entry = { solvable: 0, solved: 0 };
      counts.set(paperId, entry);
    }
    entry.solvable++;
    const parts = readDrawingParts(row.drawing_parts);
    const solved = parts
      ? parts.items.every((part) => !!part.solution_image_url)
      : !!row.solution_image_url;
    if (solved) entry.solved++;
  }
  return counts;
}

/** Pure: tally two id lists into per paper counts. */
export function tallySolutions(
  paperIds: string[],
  solvableIds: string[],
  solvedIds: string[],
): Map<string, PaperSolutionCounts> {
  const counts = new Map<string, PaperSolutionCounts>(
    paperIds.map((id) => [id, { solvable: 0, solved: 0 }]),
  );
  for (const id of solvableIds) {
    const entry = counts.get(id);
    if (entry) entry.solvable++;
  }
  for (const id of solvedIds) {
    const entry = counts.get(id);
    if (entry) entry.solved++;
  }
  return counts;
}

export async function countPaperSolutions(
  paperIds: string[],
  supabase: TypedSupabaseClient,
): Promise<Map<string, PaperSolutionCounts>> {
  if (paperIds.length === 0) return new Map();

  // Only the id column comes back: selecting the explanation text itself for
  // two thousand questions to test it for emptiness would move megabytes.
  const base = () =>
    supabase
      .from('nexus_qb_questions')
      .select('original_paper_id')
      .in('original_paper_id', paperIds)
      .neq('question_format', 'DRAWING_PROMPT');
  // Ordered so pages do not overlap or skip rows between requests.
  const solvable = () => base().order('id');
  const solved = () =>
    base()
      .or(
        'explanation_brief.not.is.null,explanation_detailed.not.is.null,solution_image_url.not.is.null,solution_video_url.not.is.null',
      )
      .order('id');

  // Only the drawings pay for the drawing_parts column. A paper holds a handful
  // of them against two thousand MCQs, so the extra bytes are a rounding error.
  const drawings = () =>
    supabase
      .from('nexus_qb_questions')
      .select('original_paper_id, drawing_parts, solution_image_url')
      .in('original_paper_id', paperIds)
      .eq('question_format', 'DRAWING_PROMPT')
      .order('id');

  const [solvableIds, solvedIds, drawingRows] = await Promise.all([
    allPaperIds(solvable),
    allPaperIds(solved),
    allRows<DrawingSolutionRow>(drawings),
  ]);

  const counts = tallySolutions(paperIds, solvableIds, solvedIds);
  for (const [paperId, drawing] of tallyDrawingSolutions(drawingRows)) {
    const entry = counts.get(paperId);
    if (!entry) continue;
    entry.solvable += drawing.solvable;
    entry.solved += drawing.solved;
  }
  return counts;
}
