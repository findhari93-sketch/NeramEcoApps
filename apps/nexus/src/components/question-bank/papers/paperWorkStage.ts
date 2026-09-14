import { derivePaperStats, type PaperStats } from './derivePaperStats';
import type { PaperWithBreakdown } from './paperTypes';

/**
 * A paper as a teacher's to-do list sees it: what is the next job on it.
 *
 * WHY NOT `paperBucket`
 *
 * The Uploaded papers list sorts by what a STUDENT can see, so "Live" outranks
 * everything. That is the wrong question for the exam page. There, a teacher is
 * asking what still needs doing, and a paper that is live with twelve questions
 * missing their answer key is unfinished work, not a finished paper. So here the
 * content comes first and publishing last, and only a paper that is complete
 * AND live counts as done.
 */

export const WORK_STAGES = [
  'needsQuestions',
  'needsAnswers',
  'needsSolutions',
  'readyToPublish',
  'done',
] as const;
export type WorkStage = (typeof WORK_STAGES)[number];

/** The stat card and filter names. */
export const WORK_STAGE_LABELS: Record<WorkStage, string> = {
  needsQuestions: 'Needs questions',
  needsAnswers: 'Needs answer key',
  needsSolutions: 'Needs solutions',
  readyToPublish: 'Ready to publish',
  done: 'Done',
};

/** The same stage said as the job to do, for the row's "Next step" chip. */
export const NEXT_STEP_LABELS: Record<WorkStage, string> = {
  needsQuestions: 'Upload questions',
  needsAnswers: 'Add answer key',
  needsSolutions: 'Add solutions',
  readyToPublish: 'Publish',
  done: 'Complete and live',
};

/** The papers route adds these when asked for `?solutions=1`. */
export interface WorkPaper extends PaperWithBreakdown {
  /** Questions that could carry a solution (everything but drawing prompts). */
  solvable_count?: number;
  /** Of those, the ones that have one. */
  solution_count?: number;
}

export interface WorkRow {
  paper: WorkPaper;
  stats: PaperStats;
  stage: WorkStage;
  solvable: number;
  solved: number;
  /** 0 to 1 across answers and solutions together, for the row's bar. */
  readiness: number;
}

/**
 * Exactly one stage, first unmet requirement wins.
 *
 * A drawing-only paper has nothing to solve, so it skips "Needs solutions"
 * rather than sitting there forever.
 */
export function paperWorkStage(
  paper: Pick<WorkPaper, 'is_student_visible'>,
  stats: Pick<PaperStats, 'total' | 'keyed'>,
  solvable: number,
  solved: number,
): WorkStage {
  if (stats.total === 0) return 'needsQuestions';
  if (stats.keyed < stats.total) return 'needsAnswers';
  if (solvable > 0 && solved < solvable) return 'needsSolutions';
  if (!paper.is_student_visible) return 'readyToPublish';
  return 'done';
}

export function toWorkRows(papers: WorkPaper[]): WorkRow[] {
  return papers.map((paper) => {
    const stats = derivePaperStats(paper);
    const solvable = paper.solvable_count ?? 0;
    // A count can run ahead of its denominator for a moment after an edit; a
    // bar past 100% or "81 of 80" helps nobody.
    const solved = Math.min(paper.solution_count ?? 0, solvable);
    const denominator = stats.total + solvable;
    return {
      paper,
      stats,
      stage: paperWorkStage(paper, stats, solvable, solved),
      solvable,
      solved,
      readiness: denominator === 0 ? 0 : (Math.min(stats.keyed, stats.total) + solved) / denominator,
    };
  });
}

export function countStages(rows: WorkRow[]): Record<WorkStage, number> {
  const counts = Object.fromEntries(WORK_STAGES.map((s) => [s, 0])) as Record<WorkStage, number>;
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

/** Session order within a year: named sessions alphabetically, forenoon first. */
function sittingKey(paper: WorkPaper): string {
  const shift = paper.shift === 'forenoon' ? '0' : paper.shift === 'afternoon' ? '1' : '2';
  return `${paper.session ?? ''}|${shift}`;
}

/**
 * The list for one filter.
 *
 * With no stage chosen, every unfinished paper: the finished ones are not a
 * teacher's job, and listing them first (newest year first, as it used to) put
 * seven fully done papers above the one that needed work. Ordered by how far
 * each paper has to go, then newest year, so the least finished comes first.
 */
export function queryWorkRows(rows: WorkRow[], stage: WorkStage | null): WorkRow[] {
  const rank = (s: WorkStage) => WORK_STAGES.indexOf(s);
  return rows
    .filter((row) => (stage ? row.stage === stage : row.stage !== 'done'))
    .sort(
      (a, b) =>
        rank(a.stage) - rank(b.stage) ||
        b.paper.year - a.paper.year ||
        sittingKey(a.paper).localeCompare(sittingKey(b.paper)),
    );
}

export function isWorkStage(value: unknown): value is WorkStage {
  return typeof value === 'string' && (WORK_STAGES as readonly string[]).includes(value);
}

/** "2024 Session 1 (FN)", the way the teacher's rows have always named a sitting. */
export function sittingLabel(paper: Pick<WorkPaper, 'session' | 'shift'>): string | null {
  if (!paper.session) return null;
  if (!paper.shift) return paper.session;
  return `${paper.session} (${paper.shift === 'forenoon' ? 'FN' : 'AN'})`;
}
