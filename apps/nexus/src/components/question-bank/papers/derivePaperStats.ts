import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import type { PaperBucket, PaperWithBreakdown } from './paperTypes';

export interface PaperStats {
  /** Questions parsed out of the source. The denominator for everything else. */
  total: number;
  /** Questions with an answer key, which includes the complete ones. */
  keyed: number;
  complete: number;
  /** Parsed but with no answer yet. */
  draft: number;
  /** Answer-keyed but not yet complete, i.e. the middle progress-bar segment. */
  answerKeyedOnly: number;
  activeCount: number;
  /** Answer-keyed and complete, minus what is already active. */
  activatable: number;
  hindiCount: number;
  hasPdf: boolean;
  /** "JEE Paper 2 2024 January (Forenoon)". Used in headings and the delete dialog. */
  paperLabel: string;
  /**
   * Whether students would get anything from this paper.
   *
   * A hint only. `setPaperStudentVisibility` enforces the same rule server-side
   * and returns its own sentence, which is what gets shown when it refuses.
   */
  readyForStudents: boolean;
  /** 0 to 1, how much of the paper has an answer key. Empty papers read as 0. */
  readiness: number;
}

/**
 * Everything the list views need about one paper, in one place.
 *
 * These eleven values used to be computed inline inside the card's `.map()`
 * callback, which was fine while there was one view. Three views cannot each
 * keep their own copy of "activatable is keyed minus active" without one of
 * them eventually being wrong.
 *
 * Pure on purpose: no hooks, no formatting that depends on a locale set
 * elsewhere, so it can be tested directly.
 */
export function derivePaperStats(paper: PaperWithBreakdown): PaperStats {
  const total = paper.questions_parsed || 0;
  const keyed = paper.questions_answer_keyed || 0;
  const complete = paper.questions_complete || 0;
  const activeCount = paper.active_count || 0;

  const shiftSuffix = paper.shift
    ? ` (${paper.shift === 'forenoon' ? 'Forenoon' : 'Afternoon'})`
    : '';
  const examLabel = QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type;

  return {
    total,
    keyed,
    complete,
    draft: Math.max(0, total - keyed),
    answerKeyedOnly: Math.max(0, keyed - complete),
    activeCount,
    activatable: Math.max(0, keyed - activeCount),
    hindiCount: paper.hindi_count ?? 0,
    hasPdf: !!paper.study_file_id,
    paperLabel: `${examLabel} ${paper.year}${paper.session ? ` ${paper.session}` : ''}${shiftSuffix}`,
    readyForStudents: activeCount > 0 || !!paper.study_file_id,
    readiness: total === 0 ? 0 : keyed / total,
  };
}

/**
 * Which bucket the status chips put this paper in. Exactly one, always.
 *
 * Order is the point. "Live" wins over everything because it is what a student
 * can see right now, and an empty paper that has had its PDF linked is ready
 * rather than empty, since the PDF alone is something to publish.
 */
export function paperBucket(paper: PaperWithBreakdown, stats: PaperStats): PaperBucket {
  if (paper.is_student_visible) return 'live';
  if (stats.readyForStudents) return 'ready';
  if (stats.total === 0) return 'empty';
  return 'needsWork';
}
