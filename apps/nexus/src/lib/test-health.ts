/**
 * Is this paper actually usable?
 *
 * Three independent streams answer "is this test broken", and they fail in
 * different ways, which is why they are combined here rather than conflated:
 *
 *   reported    a student flagged a QUESTION (nexus_qb_question_reports).
 *               Human judgement, high signal, low volume. 3 open on production
 *               that nobody has ever seen, because the only surface for them is
 *               a page nothing links to.
 *   technical   the app FAILED while someone was sitting it
 *               (nexus_test_attempt_errors). Machine-observed, no judgement.
 *   structural  the paper is malformed on its face. Computed here, from data we
 *               already hold, needing nothing to have gone wrong first. This is
 *               the only stream that can warn BEFORE a student is harmed.
 *
 * Pure TypeScript so the route and the panel share one definition of "broken"
 * and cannot drift into disagreeing about it on the same screen.
 */

export type TestIssueSeverity = 'error' | 'warning';
export type TestIssueStream = 'structural' | 'technical' | 'reported';

export interface TestIssue {
  stream: TestIssueStream;
  severity: TestIssueSeverity;
  /** One line, addressed to a teacher, naming what to do where possible. */
  title: string;
  /** How many questions or events this covers. 1 for a whole-paper problem. */
  count: number;
}

/** One question, as much as a structural check needs. */
export interface CheckableQuestion {
  id: string;
  is_active?: boolean | null;
  correct_answer?: string | null;
  question_text?: string | null;
  question_image_url?: string | null;
  question_format?: string | null;
  options?: unknown;
}

export interface StructuralInput {
  question_count: number;
  questions: CheckableQuestion[];
  /** The stored title, used only to catch one that contradicts the contents. */
  title?: string | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * PURE. What is wrong with this paper on its face.
 *
 * Ordered by how much it hurts a student sitting it. An empty paper and a
 * missing answer key are errors because they make the test unanswerable or
 * ungradeable; everything else degrades the experience without breaking it.
 */
export function structuralIssues(input: StructuralInput): TestIssue[] {
  const issues: TestIssue[] = [];
  const questions = input.questions || [];

  // Nothing to sit. composeTest refuses to create one of these, so an empty
  // paper means its questions were deleted from the bank afterwards.
  if (input.question_count === 0) {
    issues.push({
      stream: 'structural',
      severity: 'error',
      title: 'This paper has no questions. It cannot be sat.',
      count: 1,
    });
    return issues;
  }

  // A question deactivated in the bank after the paper was built. The paper
  // still references it, so a student sees a gap or a smaller paper than the
  // count promises.
  const inactive = questions.filter((q) => q.is_active === false);
  if (inactive.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'error',
      title: `${inactive.length} ${plural(inactive.length, 'question has', 'questions have')} been removed from the question bank since this paper was built`,
      count: inactive.length,
    });
  }

  // Ungradeable. The student answers and the grader has nothing to compare
  // against, which reads to them as a wrong answer they cannot argue with.
  const noAnswer = questions.filter((q) => q.is_active !== false && !String(q.correct_answer ?? '').trim());
  if (noAnswer.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'error',
      title: `${noAnswer.length} ${plural(noAnswer.length, 'question has', 'questions have')} no correct answer recorded, so ${plural(noAnswer.length, 'it cannot', 'they cannot')} be marked`,
      count: noAnswer.length,
    });
  }

  // Nothing to read and nothing to look at. Almost always a failed import.
  const empty = questions.filter(
    (q) => q.is_active !== false && !String(q.question_text ?? '').trim() && !q.question_image_url,
  );
  if (empty.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'error',
      title: `${empty.length} ${plural(empty.length, 'question has', 'questions have')} neither text nor an image`,
      count: empty.length,
    });
  }

  // A multiple-choice question with fewer than two options is not a choice.
  const tooFewOptions = questions.filter((q) => {
    if (q.is_active === false) return false;
    const format = String(q.question_format ?? '').toUpperCase();
    if (format && format !== 'MCQ' && format !== 'MSQ') return false;
    return Array.isArray(q.options) ? q.options.length < 2 : q.options == null;
  });
  if (tooFewOptions.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'warning',
      title: `${tooFewOptions.length} multiple-choice ${plural(tooFewOptions.length, 'question has', 'questions have')} fewer than two options`,
      count: tooFewOptions.length,
    });
  }

  // The stored title claims a question count the paper does not have. Harmless
  // to a student sitting it, actively misleading to staff scanning a list, and
  // the reason "Practice - 0 questions" sits on a 544-question paper.
  const claimed = /(\d+)\s+questions?\b/i.exec(String(input.title ?? ''));
  if (claimed) {
    const n = Number(claimed[1]);
    if (Number.isFinite(n) && n !== input.question_count) {
      issues.push({
        stream: 'structural',
        severity: 'warning',
        title: `The name says ${n} question${n === 1 ? '' : 's'} but the paper holds ${input.question_count}`,
        count: 1,
      });
    }
  }

  return issues;
}

/** Machine-observed failures, grouped into one line per phase. */
export function technicalIssues(
  errors: Array<{ phase?: string | null; question_id?: string | null }>,
): TestIssue[] {
  const byPhase = new Map<string, number>();
  for (const e of errors || []) {
    const phase = e?.phase || 'unknown';
    byPhase.set(phase, (byPhase.get(phase) || 0) + 1);
  }

  const WORDING: Record<string, string> = {
    load: 'failed to open the paper',
    render: 'could not display a question',
    image: 'could not load a question image',
    submit: 'could not submit their answers',
    grade: 'submitted but the paper failed to mark',
    unknown: 'hit an unrecognised error',
  };

  // Submit and load failures cost a student their work or their attempt
  // outright. An image failure is severe too, but it degrades one question
  // rather than the sitting.
  const HARD = new Set(['load', 'submit', 'grade']);

  return [...byPhase.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phase, count]) => ({
      stream: 'technical' as const,
      severity: HARD.has(phase) ? ('error' as const) : ('warning' as const),
      title: `${count} ${plural(count, 'student', 'students')} ${WORDING[phase] || WORDING.unknown}`,
      count,
    }));
}

/** Student-filed complaints about the questions themselves. */
export function reportedIssues(reports: Array<{ report_type?: string | null }>): TestIssue[] {
  const open = (reports || []).length;
  if (open === 0) return [];
  return [
    {
      stream: 'reported',
      // A student has looked at a specific question and said it is wrong. That
      // deserves the same weight as a machine-detected fault, not less.
      severity: 'error',
      title: `${open} unresolved ${plural(open, 'report', 'reports')} from students about questions in this paper`,
      count: open,
    },
  ];
}

/**
 * Everything wrong with this paper, worst first.
 *
 * Errors before warnings, and within each, the ones affecting most questions
 * first. A teacher opening this reads top down and stops when they run out of
 * time, so the order is the feature.
 */
export function collectTestIssues(input: {
  structural?: StructuralInput;
  errors?: Array<{ phase?: string | null; question_id?: string | null }>;
  reports?: Array<{ report_type?: string | null }>;
}): TestIssue[] {
  const all = [
    ...(input.structural ? structuralIssues(input.structural) : []),
    ...technicalIssues(input.errors || []),
    ...reportedIssues(input.reports || []),
  ];
  const rank = (i: TestIssue) => (i.severity === 'error' ? 0 : 1);
  return all.sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

/** True when at least one issue is severe enough to stop giving this paper out. */
export function hasBlockingIssue(issues: TestIssue[]): boolean {
  return (issues || []).some((i) => i.severity === 'error');
}
