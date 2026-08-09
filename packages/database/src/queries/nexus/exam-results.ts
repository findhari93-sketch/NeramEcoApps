/**
 * Who scored what on an exam, and in what order.
 *
 * The ranking is ONE pure function so the publish preview, the Teams post, the
 * private message each student gets, the badge decision and the student's own
 * result card can never disagree about who came first. Getting two of those to
 * differ is the kind of bug that gets noticed in public.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { effectiveAttemptScore, sectionBreakdown, type ExamSectionScore } from './exam-score';
import { getComposedTestQuestions } from './test-repository';
import { gradeQBAnswerStrict } from './question-bank';
import { getExam } from './exams';

export interface ExamCandidate {
  student_id: string;
  student_name: string;
  avatar_url?: string | null;
  attempt_id: string | null;
  score: number;
  total_marks: number;
  percentage: number;
  /** Provisional while any drawing on their paper is still unmarked. */
  provisional: boolean;
  /** Never sat it, and the window has closed. */
  absent: boolean;
  time_spent_seconds: number | null;
  section_scores: ExamSectionScore[];
}

export interface RankedCandidate extends ExamCandidate {
  /** 1-based, dense: two students on the same percentage share a rank. Null when absent. */
  rank: number | null;
}

/**
 * Rank the candidates of one exam.
 *
 * Percentage descending, then the faster paper, then the name so two identical
 * papers still order deterministically rather than by whatever the database
 * handed back.
 *
 * Ties SHARE a rank, and the next rank skips accordingly (1, 2, 2, 4). Breaking
 * a genuine tie by time would mean telling two students with identical marks
 * that one of them beat the other, which is not true and is exactly the kind of
 * thing that ends up in a parent's message. Time only orders the LIST, never
 * separates equal marks.
 *
 * An absent student is not ranked at all. They appear in the roster, never on
 * the ladder.
 */
export function rankExamCandidates(candidates: ExamCandidate[]): RankedCandidate[] {
  const sat = candidates.filter((c) => !c.absent && c.attempt_id);
  const absent = candidates.filter((c) => c.absent || !c.attempt_id);

  const ordered = [...sat].sort(
    (a, b) =>
      b.percentage - a.percentage ||
      (a.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) -
        (b.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) ||
      a.student_name.localeCompare(b.student_name),
  );

  const ranked: RankedCandidate[] = [];
  let lastPct: number | null = null;
  let lastRank = 0;

  ordered.forEach((c, i) => {
    const rank = lastPct !== null && c.percentage === lastPct ? lastRank : i + 1;
    lastPct = c.percentage;
    lastRank = rank;
    ranked.push({ ...c, rank });
  });

  return [
    ...ranked,
    ...absent
      .sort((a, b) => a.student_name.localeCompare(b.student_name))
      .map((c) => ({ ...c, rank: null, absent: true })),
  ];
}

export interface ExamResultsSummary {
  rows: RankedCandidate[];
  stats: {
    roster: number;
    sat: number;
    absent: number;
    average: number;
    highest: number;
    lowest: number;
    passed: number;
    passing_pct: number | null;
  };
  /** Averages per section across everyone who sat it. */
  section_averages: Array<{ section: string | null; label: string; average: number; total_marks: number }>;
  /** Ranks 1 to 3, already resolved. Shorter when fewer sat. */
  podium: RankedCandidate[];
  /** Drawings still waiting for a teacher, across the whole exam. */
  drawings_ungraded: number;
}

/**
 * Everything the results screen, the preview and the Teams post need.
 *
 * Scoped to ONE exam, meaning one classroom, because each classroom has its own
 * Teams channel and so its post must carry its own podium. The cross-classroom
 * view folds several of these by series_id.
 */
export async function getExamResults(
  examId: string,
  roster: Array<{ id: string; name: string; avatar_url?: string | null }>,
  client?: TypedSupabaseClient,
): Promise<ExamResultsSummary> {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  const studentIds = roster.map((r) => r.id);

  const { data: attempts, error } = await supabase
    .from('nexus_test_attempts' as any)
    .select(
      'id, student_id, status, score, total_marks, percentage, final_score, final_total_marks, final_percentage, finalised_at, time_spent_seconds, answers',
    )
    .eq('test_id', exam.test_id)
    .eq('mode', 'official')
    .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);
  if (error) throw error;

  // One attempt per student: the exam allows exactly one, but an abandoned
  // first try can leave a second row, so keep the submitted one.
  const bestByStudent = new Map<string, any>();
  for (const a of (attempts || []) as any[]) {
    const prior = bestByStudent.get(a.student_id);
    if (!prior || (prior.status !== 'submitted' && a.status === 'submitted')) {
      bestByStudent.set(a.student_id, a);
    }
  }

  const questions = await getComposedTestQuestions(exam.test_id, true, supabase);
  const closed = new Date(exam.closes_at) <= new Date();

  const candidates: ExamCandidate[] = roster.map((student) => {
    const attempt = bestByStudent.get(student.id);
    if (!attempt || attempt.status !== 'submitted') {
      return {
        student_id: student.id,
        student_name: student.name,
        avatar_url: student.avatar_url ?? null,
        attempt_id: null,
        score: 0,
        total_marks: 0,
        percentage: 0,
        provisional: false,
        // Not "absent" while the door is still open: they may simply not have
        // started yet. Same rule as the invigilation roster.
        absent: closed,
        time_spent_seconds: null,
        section_scores: [],
      };
    }

    const eff = effectiveAttemptScore(attempt);
    const review = buildReviewFromAnswers(questions, attempt.answers || {});

    return {
      student_id: student.id,
      student_name: student.name,
      avatar_url: student.avatar_url ?? null,
      attempt_id: attempt.id,
      score: eff.score,
      total_marks: eff.total_marks,
      percentage: eff.percentage,
      provisional: eff.provisional,
      absent: false,
      time_spent_seconds: attempt.time_spent_seconds ?? null,
      section_scores: sectionBreakdown(
        questions.map((q) => ({
          question_id: q.question_id,
          section: q.section,
          section_order: q.section_order,
          marks: q.marks,
        })),
        review,
      ),
    };
  });

  const rows = rankExamCandidates(candidates);
  const sat = rows.filter((r) => !r.absent && r.attempt_id);
  const percentages = sat.map((r) => r.percentage);
  const passingPct = exam.passing_pct == null ? null : Number(exam.passing_pct);

  const sectionTotals = new Map<string, { label: string; sum: number; n: number; total: number }>();
  for (const row of sat) {
    for (const s of row.section_scores) {
      const key = s.section ?? '__none__';
      const entry = sectionTotals.get(key) ?? { label: s.label, sum: 0, n: 0, total: s.total_marks };
      entry.sum += s.score;
      entry.n += 1;
      entry.total = Math.max(entry.total, s.total_marks);
      sectionTotals.set(key, entry);
    }
  }

  return {
    rows,
    stats: {
      roster: roster.length,
      sat: sat.length,
      absent: rows.filter((r) => r.absent).length,
      average: percentages.length ? round2(avg(percentages)) : 0,
      highest: percentages.length ? Math.max(...percentages) : 0,
      lowest: percentages.length ? Math.min(...percentages) : 0,
      passed: passingPct == null ? sat.length : sat.filter((r) => r.percentage >= passingPct).length,
      passing_pct: passingPct,
    },
    section_averages: Array.from(sectionTotals.entries()).map(([key, v]) => ({
      section: key === '__none__' ? null : key,
      label: v.label,
      average: v.n > 0 ? round2(v.sum / v.n) : 0,
      total_marks: v.total,
    })),
    podium: rows.filter((r) => r.rank != null && r.rank <= 3),
    drawings_ungraded: sat.reduce(
      (n, r) => n + r.section_scores.reduce((m, s) => m + s.ungraded, 0),
      0,
    ),
  };
}

/**
 * Re-derive a review from stored answers.
 *
 * The attempt row keeps the answers but not the per-question verdicts, so a
 * section breakdown computed after the fact has to re-mark. Uses the same
 * grading primitives, so it cannot disagree with what the student was told.
 */
function buildReviewFromAnswers(
  questions: Array<{
    question_id: string;
    question_format: string;
    marks: number;
    negative_marks: number;
    correct_answer?: string | null;
  }>,
  answers: Record<string, string>,
) {
  return questions.map((q) => {
    const selected = answers?.[q.question_id] ?? null;
    const verdict = gradeQBAnswerStrict(
      q.question_format,
      selected,
      q.correct_answer,
      (q as any).answer_tolerance,
    );
    const gradable = verdict !== null;
    const answered = selected != null && String(selected).trim() !== '';
    const penalty = Math.abs(Number(q.negative_marks) || 0);

    let awarded = 0;
    if (verdict === true) awarded = Number(q.marks) || 1;
    else if (gradable && answered && penalty > 0) awarded = -penalty;

    return {
      question_id: q.question_id,
      marks_awarded: awarded,
      is_gradable: gradable,
      selected,
    };
  });
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
