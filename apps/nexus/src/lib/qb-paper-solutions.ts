/**
 * How many of each paper's questions have a solution.
 *
 * The paper row stores three counters (parsed, answer keyed, complete) and none
 * of them is about solutions. "complete" reads like it should be, but a drawing
 * prompt lands complete the moment it is imported and an activated question
 * counts too, so a paper of drawings with no worked answers reads 100% complete.
 *
 * A solution is any of the four places one can live: the brief or detailed
 * explanation, a solution image, or a video. Drawing prompts have no solution
 * to write and are left out of the count on both sides.
 */

import type { TypedSupabaseClient } from '@neram/database';

export interface PaperSolutionCounts {
  /** Questions that could carry a solution, i.e. everything but drawings. */
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
async function allPaperIds(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { original_paper_id: string | null }[];
    for (const row of rows) if (row.original_paper_id) ids.push(row.original_paper_id);
    if (rows.length < PAGE) break;
  }
  return ids;
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

  const [solvableIds, solvedIds] = await Promise.all([allPaperIds(solvable), allPaperIds(solved)]);
  return tallySolutions(paperIds, solvableIds, solvedIds);
}
