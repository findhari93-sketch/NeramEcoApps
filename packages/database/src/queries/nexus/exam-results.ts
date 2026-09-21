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
import {
  answersAsOriginal,
  attemptDrawKey,
  getComposedTestQuestions,
  loadAttemptDraws,
} from './test-repository';
import { gradeQBAnswerStrict } from './question-bank';
import { getExam, listExamMakeups, resolveExamWindowForStudent } from './exams';
import { loadRunSittings, loadRunAccessRequests } from './run-sittings';

/** Which of an exam's two rank lists a paper belongs to. */
export type ExamSitting = 'main' | 'second';

/**
 * Where one roster student stands. Exactly one per student, and the four
 * always sum to the roster.
 *
 * still_to_sit exists because "no paper" is not the same as "absent": 28
 * students on the History of Architecture exam hold live windows, and calling
 * them absent would privately tell each of them so.
 */
export type ExamBucket = 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent';

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
  /** Null when they have not submitted a paper. */
  sitting: ExamSitting | null;
  bucket: ExamBucket;
  /**
   * When this student's own window shuts. Set only on a still_to_sit row, so a
   * teacher deciding whether to publish now can see whether they are waiting
   * two days or three weeks.
   */
  window_closes_at: string | null;
}

export interface RankedCandidate extends ExamCandidate {
  /**
   * 1-based, dense, WITHIN this student's own sitting: two students on the
   * same percentage share a rank and the next rank skips. Null when they did
   * not sit.
   */
  rank: number | null;
  /** How many sat in that same sitting, so a rank always travels with its denominator. */
  sitting_size: number;
}

/**
 * Which sitting one paper belongs to.
 *
 * STARTED, not submitted. Production holds a paper begun at 17:00 and handed in
 * at 18:05 against a 17:15 close: that student sat on the day and overran, and
 * an overrun is the common case rather than the exception. Reading submitted_at
 * would move them out of the podium they competed for.
 *
 * Deliberately does NOT read the grant or make-up tables. A grant overlapping
 * the normal window should move nobody, and the only question that matters is
 * whether the student beat the shared deadline.
 */
export function examSittingFor(
  attempt: { started_at?: string | null; submitted_at?: string | null },
  examClosesAt: string,
): ExamSitting {
  const closes = Date.parse(examClosesAt);
  const began = Date.parse(attempt.started_at ?? attempt.submitted_at ?? '');
  if (Number.isNaN(began) || Number.isNaN(closes)) return 'main';
  return began <= closes ? 'main' : 'second';
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
 * TWO SITTINGS, RANKED SEPARATELY. A student who started the paper after the
 * exam's shared window closed had days or weeks longer to prepare, so they are
 * ranked among themselves rather than against the people who sat on the day.
 * The partition, not a freeze flag, is what stops a late sitting renumbering a
 * podium that has already been announced: a second-sitting paper simply cannot
 * enter the main set.
 */
export function rankExamCandidates(candidates: ExamCandidate[]): RankedCandidate[] {
  const byMarks = (a: ExamCandidate, b: ExamCandidate) =>
    b.percentage - a.percentage ||
    (a.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) -
      (b.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) ||
    a.student_name.localeCompare(b.student_name);

  const rankGroup = (group: ExamCandidate[]): RankedCandidate[] => {
    const ordered = [...group].sort(byMarks);
    const out: RankedCandidate[] = [];
    let lastPct: number | null = null;
    let lastRank = 0;

    ordered.forEach((c, i) => {
      const rank = lastPct !== null && c.percentage === lastPct ? lastRank : i + 1;
      lastPct = c.percentage;
      lastRank = rank;
      out.push({ ...c, rank, sitting_size: group.length });
    });

    return out;
  };

  const sat = candidates.filter((c) => !c.absent && c.attempt_id);
  const unsat = candidates.filter((c) => c.absent || !c.attempt_id);

  return [
    ...rankGroup(sat.filter((c) => c.sitting !== 'second')),
    ...rankGroup(sat.filter((c) => c.sitting === 'second')),
    // The absent flag is NOT forced here. A student holding a live window has
    // no paper and is not absent, and getExamResults has already said which.
    ...unsat
      .sort((a, b) => a.student_name.localeCompare(b.student_name))
      .map((c) => ({ ...c, rank: null, sitting_size: 0 })),
  ];
}

export interface ExamResultsSummary {
  rows: RankedCandidate[];
  /** Every figure here is main-sitting only, so a class's announced average never moves later. */
  stats: {
    roster: number;
    sat: number;
    absent: number;
    still_to_sit: number;
    average: number;
    highest: number;
    lowest: number;
    passed: number;
    passing_pct: number | null;
  };
  /**
   * The second sitting's own figures, null until somebody sits late.
   *
   * Kept OUT of `stats` on purpose: the channel card is built from `stats`, and
   * the average a class was told on results day has to stay true afterwards.
   */
  second: { sat: number; average: number; highest: number; lowest: number; passed: number } | null;
  /** Averages per section across the main sitting, like every other figure in stats. */
  section_averages: Array<{ section: string | null; label: string; average: number; total_marks: number }>;
  /** Ranks 1 to 3 of the main sitting, already resolved. Shorter when fewer sat. */
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
  const { placementId, byStudent: bestByStudent } = await loadExamSittings(exam, studentIds, supabase);

  // Who still has time. Resolved through resolveExamWindowForStudent, the one
  // function that decides whether a door is open for one student, so the
  // teacher's roster and that student's own card cannot disagree.
  const [makeups, accessByPlacement] = await Promise.all([
    listExamMakeups(examId, supabase),
    placementId
      ? loadRunAccessRequests([placementId], studentIds, supabase)
      : Promise.resolve(new Map()),
  ]);
  const makeupByStudent = new Map(makeups.map((m) => [m.student_id, m]));
  const grantByStudent = placementId
    ? (accessByPlacement.get(placementId) ?? new Map())
    : new Map();
  const now = Date.now();

  const [questions, draws] = await Promise.all([
    getComposedTestQuestions(exam.test_id, true, supabase),
    // The section breakdown re-marks stored answers, and a shuffled exam stores
    // the letter the student CLICKED. Without the draw every shuffled option is
    // marked against the wrong letter and the section averages are noise, while
    // the total (read from the attempt row) still looks right beside them.
    loadAttemptDraws({ testIds: [exam.test_id] }, supabase),
  ]);

  const candidates: ExamCandidate[] = roster.map((student) => {
    const attempt = bestByStudent.get(student.id);

    if (!attempt || attempt.status !== 'submitted') {
      // A granted row only. A pending ask is a question, not a door.
      const grant = grantByStudent.get(student.id);
      const reopen = grant?.status === 'granted' ? grant : null;
      const window = resolveExamWindowForStudent(exam, makeupByStudent.get(student.id) ?? null, reopen);
      const stillOpen = Date.parse(window.closes_at) > now;

      return {
        student_id: student.id,
        student_name: student.name,
        avatar_url: student.avatar_url ?? null,
        attempt_id: null,
        score: 0,
        total_marks: 0,
        percentage: 0,
        provisional: false,
        // Absent means no paper AND no way left to produce one. A student whose
        // window is still open has simply not sat it yet.
        absent: !stillOpen,
        time_spent_seconds: null,
        section_scores: [],
        sitting: null,
        bucket: stillOpen ? ('still_to_sit' as const) : ('absent' as const),
        window_closes_at: stillOpen ? window.closes_at : null,
      };
    }

    const eff = effectiveAttemptScore(attempt);
    const draw = draws.get(attemptDrawKey(exam.test_id, student.id, attempt.attempt_number));
    const review = buildReviewFromAnswers(questions, answersAsOriginal(attempt.answers, draw));
    const sitting = examSittingFor(attempt, exam.closes_at);

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
      sitting,
      bucket: sitting === 'second' ? ('second_sitting' as const) : ('exam_day' as const),
      window_closes_at: null,
    };
  });

  const rows = rankExamCandidates(candidates);
  const sat = rows.filter((r) => r.bucket === 'exam_day');
  const late = rows.filter((r) => r.bucket === 'second_sitting');
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
      absent: rows.filter((r) => r.bucket === 'absent').length,
      still_to_sit: rows.filter((r) => r.bucket === 'still_to_sit').length,
      average: percentages.length ? round2(avg(percentages)) : 0,
      highest: percentages.length ? Math.max(...percentages) : 0,
      lowest: percentages.length ? Math.min(...percentages) : 0,
      passed: passingPct == null ? sat.length : sat.filter((r) => r.percentage >= passingPct).length,
      passing_pct: passingPct,
    },
    second:
      late.length === 0
        ? null
        : {
            sat: late.length,
            average: round2(avg(late.map((r) => r.percentage))),
            highest: Math.max(...late.map((r) => r.percentage)),
            lowest: Math.min(...late.map((r) => r.percentage)),
            passed:
              passingPct == null ? late.length : late.filter((r) => r.percentage >= passingPct).length,
          },
    section_averages: Array.from(sectionTotals.entries()).map(([key, v]) => ({
      section: key === '__none__' ? null : key,
      label: v.label,
      average: v.n > 0 ? round2(v.sum / v.n) : 0,
      total_marks: v.total,
    })),
    // Four, not three (founder, 2026-09-20). Filtered by RANK, so a tie at the
    // bottom of it brings both students in and the card names five: dropping
    // one of two equal scores is the one outcome worth avoiding here.
    podium: rows.filter((r) => r.sitting === 'main' && r.rank != null && r.rank <= 4),
    // Across BOTH sittings, unlike stats and section_averages: a second-sitting
    // drawing still needs a teacher's mark, and this count is what tells them
    // grading work remains.
    drawings_ungraded: [...sat, ...late].reduce(
      (n, r) => n + r.section_scores.reduce((m, s) => m + s.ungraded, 0),
      0,
    ),
  };
}

/**
 * Delete snapshot rows that hold no paper, for students who are no longer part
 * of this exam.
 *
 * The publish route sets aside students the exam was never set for (joined
 * after the covered classes, still catching up, excused by a teacher). A publish
 * made BEFORE one of them was excused may already have written them an absent
 * row, and their card would go on saying "You were marked absent" forever. Only
 * rows with a null attempt_id are touched, so a result somebody earned can never
 * be removed by this, whatever the caller passes.
 */
export async function removePaperlessExamResults(
  examId: string,
  studentIds: string[],
  client?: TypedSupabaseClient,
): Promise<void> {
  if (studentIds.length === 0) return;
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_exam_results')
    .delete()
    .eq('exam_id', examId)
    .in('student_id', studentIds)
    .is('attempt_id', null);
  if (error) throw error;
}

const EXAM_ATTEMPT_COLUMNS =
  'id, student_id, status, attempt_number, score, total_marks, percentage, final_score, final_total_marks, final_percentage, finalised_at, time_spent_seconds, started_at, submitted_at, answers';

/**
 * The one attempt that is each student's exam.
 *
 * Decided by run-sittings.ts, the rule the Students tab and the student's own
 * card share: the exam door first, then a sitting through another door made
 * inside the exam window, then a teacher's count. This used to take any
 * submitted attempt on the paper, from any door, at any time, so a chapter
 * practised a week early could rank as the exam.
 *
 * The first submitted attempt is the exam score. An exam door still open with
 * nothing submitted keeps its open row, which reads as not sat.
 */
async function loadExamSittings(
  exam: { test_id: string; scheduled_class_id?: string | null },
  studentIds: string[],
  supabase: TypedSupabaseClient,
): Promise<{ placementId: string | null; byStudent: Map<string, any> }> {
  const out = new Map<string, any>();
  if (studentIds.length === 0) return { placementId: null, byStudent: out };

  const { data: placement } = await (supabase as any)
    .from('nexus_test_placements')
    .select('id, test_id, available_from, available_until')
    .eq('context_type', 'exam')
    .eq('context_id', exam.scheduled_class_id ?? null)
    .eq('is_active', true)
    .maybeSingle();

  if (placement) {
    const byRun = await loadRunSittings<any>(
      [placement],
      { studentIds, columns: EXAM_ATTEMPT_COLUMNS },
      supabase,
    );
    byRun.get(placement.id)?.forEach((sitting, studentId) => {
      out.set(studentId, sitting.first ?? sitting.attempts[0] ?? null);
    });
    return { placementId: placement.id, byStudent: out };
  }

  // No placement to anchor a window to. The paper wide reading, unchanged.
  const { data: attempts, error } = await supabase
    .from('nexus_test_attempts' as any)
    .select(EXAM_ATTEMPT_COLUMNS)
    .eq('test_id', exam.test_id)
    .eq('mode', 'official')
    .in('student_id', studentIds);
  if (error) throw error;

  // One attempt per student: the exam allows exactly one, but an abandoned
  // first try can leave a second row, so keep the submitted one.
  for (const a of (attempts || []) as any[]) {
    const prior = out.get(a.student_id);
    if (!prior || (prior.status !== 'submitted' && a.status === 'submitted')) {
      out.set(a.student_id, a);
    }
  }
  return { placementId: null, byStudent: out };
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
