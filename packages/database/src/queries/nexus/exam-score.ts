/**
 * How an exam is scored, section by section and in two stages.
 *
 * PURE, and deliberately so: the preview dialog, the Teams post, the private
 * message a student gets, the badge decision and the student's own result card
 * must all agree on the number. One definition, one place, same discipline as
 * resolvePassingPct in test-repository.ts.
 *
 * THE TWO STAGES
 * A JEE Paper 2 drawing section is 100 of its 200 marks and no machine can mark
 * it. So an exam produces a PROVISIONAL score the moment it is submitted (the
 * objective sections only), and a FINAL score once a teacher has marked the
 * drawings. Publishing before that is allowed but is labelled provisional.
 */

import { QB_SECTION_ORDER, isQBQuestionSection, qbSectionLabel } from '../../types';

export interface ExamSectionScore {
  section: string | null;
  label: string;
  /** Marks earned in this section. Floored at zero, like the paper total. */
  score: number;
  /** Marks available from the questions a machine could mark. */
  total_marks: number;
  percentage: number;
  /** How many of this section's questions the student put an answer to. */
  answered: number;
  questions: number;
  /** Questions in this section awaiting a human. Drawings, before they are marked. */
  ungraded: number;
}

interface ScoredQuestion {
  question_id: string;
  section?: string | null;
  section_order?: number | null;
  marks: number;
}

interface ScoredReviewItem {
  question_id: string;
  marks_awarded: number;
  is_gradable: boolean;
  selected: string | null;
}

/** Sections in paper order, with anything unrecognised last. */
function orderOf(section: string | null | undefined, fallback: number | null | undefined): number {
  if (section && isQBQuestionSection(section)) return QB_SECTION_ORDER[section];
  if (typeof fallback === 'number') return fallback;
  return 99;
}

/**
 * Break a graded attempt down by section.
 *
 * Mirrors gradeComposedAnswers exactly: a question no machine could mark stays
 * out of that section's total_marks rather than counting as zero out of full.
 * A drawing section before marking therefore reads "0 of 0, 2 awaiting review"
 * and not "0 of 100", which would tell a student they failed something nobody
 * has looked at yet.
 */
export function sectionBreakdown(
  questions: ScoredQuestion[],
  review: ScoredReviewItem[],
): ExamSectionScore[] {
  const byQuestion = new Map(review.map((r) => [r.question_id, r]));
  const groups = new Map<string, ExamSectionScore & { _order: number }>();

  for (const q of questions) {
    const key = q.section ?? '__unsectioned__';
    let group = groups.get(key);
    if (!group) {
      group = {
        section: q.section ?? null,
        label: q.section ? qbSectionLabel(q.section) : 'Unsectioned',
        score: 0,
        total_marks: 0,
        percentage: 0,
        answered: 0,
        questions: 0,
        ungraded: 0,
        _order: orderOf(q.section, q.section_order),
      };
      groups.set(key, group);
    }

    group.questions += 1;

    const r = byQuestion.get(q.question_id);
    if (!r) {
      // Served but never reviewed. Counted as a question and nothing else.
      group.ungraded += 1;
      continue;
    }

    if (r.selected != null && String(r.selected).trim() !== '') group.answered += 1;

    if (r.is_gradable) {
      group.total_marks += Number(q.marks) || 0;
      group.score += Number(r.marks_awarded) || 0;
    } else {
      group.ungraded += 1;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...s }) => {
      const score = Math.max(0, s.score);
      return {
        ...s,
        score,
        percentage: s.total_marks > 0 ? Math.round((score / s.total_marks) * 10000) / 100 : 0,
      };
    });
}

export interface DrawingMark {
  question_id: string;
  /** What this drawing is worth, from nexus_test_questions.marks. */
  max_marks: number;
  /** Null until a teacher has marked it. */
  awarded: number | null;
}

export interface FinalisedExamScore {
  score: number;
  total_marks: number;
  percentage: number;
  /** How many drawings are still waiting for a teacher. Zero means this is final. */
  ungraded: number;
}

/**
 * Fold marked drawings into the objective score.
 *
 * THE RULE, and it is the same one gradeComposedAnswers already follows: a
 * drawing whose `awarded` is still null stays out of BOTH the numerator and the
 * denominator. Two consequences, both wanted:
 *
 *   - A half-marked exam is still a valid percentage. It moves as drawings land
 *     rather than starting at an insulting number and climbing.
 *   - One forgotten drawing can never make a paper unpassable, which is exactly
 *     the failure the original contract was written to prevent.
 *
 * A negative awarded mark is clamped to zero: drawings are never negatively
 * marked in any published scheme, and a typo in a grading box should not be
 * able to take marks off the objective sections.
 */
export function finaliseExamScore(input: {
  objective: { score: number; total_marks: number };
  drawings: DrawingMark[];
}): FinalisedExamScore {
  let score = Number(input.objective.score) || 0;
  let totalMarks = Number(input.objective.total_marks) || 0;
  let ungraded = 0;

  for (const d of input.drawings) {
    if (d.awarded == null) {
      ungraded += 1;
      continue;
    }
    const max = Math.max(0, Number(d.max_marks) || 0);
    score += Math.min(max, Math.max(0, Number(d.awarded) || 0));
    totalMarks += max;
  }

  const safeScore = Math.max(0, score);
  return {
    score: safeScore,
    total_marks: totalMarks,
    percentage: totalMarks > 0 ? Math.round((safeScore / totalMarks) * 10000) / 100 : 0,
    ungraded,
  };
}

export interface EffectiveScore {
  score: number;
  total_marks: number;
  percentage: number;
  /** True while drawings are still outstanding, so every surface can label it. */
  provisional: boolean;
}

/**
 * The score to show for an attempt, whichever stage it is at.
 *
 * The final columns are written alongside the objective ones rather than over
 * them, because getTestResults, getStudentTestStats, listStudentAttempts and
 * the leaderboard all read score/percentage. Overwriting would make a
 * half-marked exam indistinguishable from a real score everywhere at once.
 * So every exam surface reads through here instead of picking a column.
 */
export function effectiveAttemptScore(attempt: {
  score?: number | null;
  total_marks?: number | null;
  percentage?: number | null;
  final_score?: number | null;
  final_total_marks?: number | null;
  final_percentage?: number | null;
  finalised_at?: string | null;
}): EffectiveScore {
  if (attempt.finalised_at) {
    return {
      score: Number(attempt.final_score) || 0,
      total_marks: Number(attempt.final_total_marks) || 0,
      percentage: Number(attempt.final_percentage) || 0,
      provisional: false,
    };
  }
  return {
    score: Number(attempt.score) || 0,
    total_marks: Number(attempt.total_marks) || 0,
    percentage: Number(attempt.percentage) || 0,
    provisional: true,
  };
}
