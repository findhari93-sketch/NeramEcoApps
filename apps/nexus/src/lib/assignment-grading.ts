/**
 * Marking an assignment that has both halves: questions a machine can mark and
 * working only a teacher can judge.
 *
 * The grader itself is not reimplemented here. gradeQBAnswerStrict in
 * @neram/database is the one engine that marks answers in this product, and it
 * already returns null rather than true for anything it must not mark, which is
 * exactly what a SUBJECTIVE question needs. This module only decides how the two
 * halves add up, and does it in a pure function so the arithmetic that decides a
 * student's grade is testable without a database.
 */
import { gradeQBAnswerStrict } from '@neram/database';

export interface GradableQuestion {
  id: string;
  format: string;
  marks: number;
  correct_answer?: string | null;
  answer_tolerance?: number | null;
}

export interface QuestionOutcome {
  question_id: string;
  /** What the student put. */
  answer: string | null;
  /** true, false, or null when a machine must not decide. */
  correct: boolean | null;
  /** Marks earned automatically. Always 0 for a question a teacher must mark. */
  marks_awarded: number;
  marks_possible: number;
}

export interface AutoMarkResult {
  outcomes: QuestionOutcome[];
  /** Marks the machine awarded. */
  auto_awarded: number;
  /** Marks that were on offer automatically. */
  auto_possible: number;
  /** Marks reserved for the teacher's judgement. */
  manual_possible: number;
  /** Every question a teacher still has to mark. */
  needs_teacher: string[];
}

/**
 * Mark the objective half of a paper.
 *
 * A question the grader refuses (SUBJECTIVE, or anything unrecognised) scores 0
 * here and is listed in needs_teacher. It is NEVER silently given its marks:
 * that would hand full credit to anyone who pressed submit.
 */
export function autoMarkAnswers(
  questions: GradableQuestion[],
  answers: Record<string, string | null | undefined>,
): AutoMarkResult {
  const outcomes: QuestionOutcome[] = [];
  const needsTeacher: string[] = [];
  let autoAwarded = 0;
  let autoPossible = 0;
  let manualPossible = 0;

  for (const q of questions) {
    const answer = answers[q.id] ?? null;
    const correct = gradeQBAnswerStrict(q.format, answer, q.correct_answer, q.answer_tolerance);

    if (correct === null) {
      manualPossible += q.marks;
      needsTeacher.push(q.id);
      outcomes.push({
        question_id: q.id,
        answer,
        correct: null,
        marks_awarded: 0,
        marks_possible: q.marks,
      });
      continue;
    }

    autoPossible += q.marks;
    const awarded = correct ? q.marks : 0;
    autoAwarded += awarded;
    outcomes.push({
      question_id: q.id,
      answer,
      correct,
      marks_awarded: awarded,
      marks_possible: q.marks,
    });
  }

  return {
    outcomes,
    auto_awarded: autoAwarded,
    auto_possible: autoPossible,
    manual_possible: manualPossible,
    needs_teacher: needsTeacher,
  };
}

/**
 * The single number that goes on the submission.
 *
 * teacherMarks is what the teacher awarded for the working. It is clamped to the
 * marks actually reserved for them, so a mistyped 50 in a box worth 5 cannot
 * push a student past the paper's total.
 */
export function combineMarks(auto: AutoMarkResult, teacherMarks: number | null): number {
  const manual = teacherMarks == null ? 0 : Math.max(0, Math.min(teacherMarks, auto.manual_possible));
  return round2(auto.auto_awarded + manual);
}

/** Marks are shown to students, so trailing float noise is not acceptable. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
