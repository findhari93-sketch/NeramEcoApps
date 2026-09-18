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

import { factsFromErrorRow, failureCodeOf, isExpectedRefusal } from './test-error-classify';

export type TestIssueSeverity = 'error' | 'warning';
export type TestIssueStream = 'structural' | 'technical' | 'reported';

export interface TestIssue {
  stream: TestIssueStream;
  severity: TestIssueSeverity;
  /** One line, addressed to a teacher, naming what to do where possible. */
  title: string;
  /**
   * How many questions this covers, or for a technical issue how many distinct
   * STUDENTS. 1 for a whole-paper problem.
   */
  count: number;
  /** Technical issues only: which phase, so the panel can list who it happened to. */
  phase?: string;
}

/** A nexus_test_attempt_errors row, as much as the health check reads. */
export interface AttemptErrorRow {
  phase?: string | null;
  question_id?: string | null;
  student_id?: string | null;
  attempt_id?: string | null;
  message?: string | null;
  detail?: unknown;
  created_at?: string | null;
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

export interface FailureFilterContext {
  /** users.id of anyone on staff. A teacher previewing a paper is not a student failing to sit it. */
  staffIds?: ReadonlySet<string>;
  /** nexus_test_attempts.status by attempt id, for closed-attempt submit rows. */
  attemptStatusById?: ReadonlyMap<string, string>;
  /**
   * When a teacher last pressed "Mark as fixed" on this paper. Rows at or before
   * it are hidden; anything that fails afterwards shows again.
   */
  clearedAt?: string | null;
}

/**
 * PURE. The rows that are the app really failing a real student since the paper
 * was last marked fixed.
 *
 * Three things were inflating the banner on acf8084d and each is removed here:
 * the door refusing on purpose (see test-error-classify.ts), staff previews (the
 * errors route stored whoever called it), and failures a teacher had already
 * dealt with but had no way to say so.
 */
export function realFailures(rows: AttemptErrorRow[], ctx: FailureFilterContext = {}): AttemptErrorRow[] {
  const clearedMs = ctx.clearedAt ? Date.parse(ctx.clearedAt) : NaN;
  return (rows || []).filter((row) => {
    if (!row) return false;
    if (row.student_id && ctx.staffIds?.has(row.student_id)) return false;
    if (Number.isFinite(clearedMs) && row.created_at) {
      const at = Date.parse(row.created_at);
      if (Number.isFinite(at) && at <= clearedMs) return false;
    }
    const looked = row.attempt_id ? ctx.attemptStatusById?.get(row.attempt_id) ?? null : null;
    return !isExpectedRefusal(factsFromErrorRow(row, looked));
  });
}

/**
 * The attempts whose status decides whether a row is a failure: a submit refused
 * because the attempt was closed, on a row that did not record whether that
 * attempt was in fact submitted (every row written before this change).
 */
export function attemptIdsToLookUp(rows: AttemptErrorRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows || []) {
    if (row?.phase !== 'submit' || !row.attempt_id) continue;
    const facts = factsFromErrorRow(row);
    if (facts.attemptStatus) continue;
    if (failureCodeOf(facts) === 'ATTEMPT_CLOSED') ids.add(row.attempt_id);
  }
  return [...ids];
}

/** One student a technical failure happened to, for the panel's "See who". */
export interface AffectedStudent {
  student_id: string;
  /** When it last happened to them. */
  last_at: string | null;
  /** The message from that latest time. */
  message: string;
  /** How many times it was recorded for them in this phase. */
  times: number;
}

/** PURE. Who each phase's failures happened to, newest first. */
export function affectedStudentsByPhase(rows: AttemptErrorRow[]): Record<string, AffectedStudent[]> {
  const byPhase = new Map<string, Map<string, AffectedStudent>>();
  const ms = (at: string | null | undefined) => {
    const parsed = at ? Date.parse(at) : NaN;
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };

  for (const row of rows || []) {
    if (!row?.student_id) continue;
    const phase = row.phase || 'unknown';
    let students = byPhase.get(phase);
    if (!students) {
      students = new Map();
      byPhase.set(phase, students);
    }
    const existing = students.get(row.student_id);
    if (!existing) {
      students.set(row.student_id, {
        student_id: row.student_id,
        last_at: row.created_at ?? null,
        message: String(row.message ?? ''),
        times: 1,
      });
      continue;
    }
    existing.times += 1;
    if (ms(row.created_at) > ms(existing.last_at)) {
      existing.last_at = row.created_at ?? null;
      existing.message = String(row.message ?? '');
    }
  }

  const out: Record<string, AffectedStudent[]> = {};
  for (const [phase, students] of byPhase) {
    out[phase] = [...students.values()].sort((a, b) => ms(b.last_at) - ms(a.last_at));
  }
  return out;
}

/**
 * Machine-observed failures, one line per phase, counting distinct STUDENTS.
 *
 * It used to count rows, so one student tapping Submit three times read as three
 * students. A row with no student id (never written by the errors route, which
 * always stores the caller) still counts once rather than vanishing.
 */
export function technicalIssues(
  errors: Array<{ phase?: string | null; question_id?: string | null; student_id?: string | null }>,
): TestIssue[] {
  const studentsByPhase = new Map<string, Set<string>>();
  let anonymous = 0;
  for (const e of errors || []) {
    const phase = e?.phase || 'unknown';
    let students = studentsByPhase.get(phase);
    if (!students) {
      students = new Set();
      studentsByPhase.set(phase, students);
    }
    students.add(e?.student_id || `anonymous-${anonymous++}`);
  }
  const byPhase = new Map<string, number>([...studentsByPhase].map(([phase, set]) => [phase, set.size]));

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
      phase,
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
  /** Already passed through realFailures, so these are real students and real failures. */
  errors?: Array<{ phase?: string | null; question_id?: string | null; student_id?: string | null }>;
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

/* ── Handing a problem to an AI ─────────────────────────────────────────── */

/** A name beside an affected student, which the panel has and this module does not. */
export interface NamedAffectedStudent extends AffectedStudent {
  name?: string | null;
}

export interface HealthPromptInput {
  testTitle: string;
  testId: string;
  placementId: string | null;
  /** How the run picker labels this run, e.g. "Exam: 18 Aug". */
  runLabel: string | null;
  /** The page the teacher is looking at, so the fix can be checked in place. */
  pageUrl: string;
  issues: TestIssue[];
  affected: Record<string, NamedAffectedStudent[]>;
  reports: Array<{ report_type?: string | null; description?: string | null }>;
}

/** Roughly a screenful of paste, past which nobody reads it and nothing is gained. */
export const HEALTH_PROMPT_LIMIT = 8000;
/** Enough names to see a pattern. The rest are counted, not listed. */
const PROMPT_STUDENT_LIMIT = 12;
const PROMPT_REPORT_LIMIT = 8;

function promptWhen(at: string | null | undefined): string {
  if (!at) return 'time not recorded';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'time not recorded';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * PURE. The banner, written out as something an AI can act on without the page.
 *
 * The founder's loop is copy the problem, get it fixed, confirm, then press Mark
 * as fixed. Only the last step existed, so the first was a teacher retyping
 * "6 students could not submit" into a chat with none of the facts that make it
 * findable: which paper, which run, who, when, and what the app actually said.
 *
 * Everything here is already on the screen. The value is that it leaves in one
 * piece, with the ids and the table names that turn a symptom into a search.
 */
export function buildHealthPrompt(input: HealthPromptInput): string {
  const lines: string[] = [];

  lines.push('A test paper in Nexus has problems. Find the root cause and fix it.');
  lines.push('');
  lines.push(`Paper: ${input.testTitle || 'Untitled'} (nexus_tests.id ${input.testId})`);
  if (input.runLabel || input.placementId) {
    lines.push(
      `Run: ${input.runLabel || 'this run'}${input.placementId ? ` (nexus_test_placements.id ${input.placementId})` : ''}`,
    );
  }
  lines.push(`Teacher screen: ${input.pageUrl}`);
  lines.push('');

  lines.push('PROBLEMS');
  const streamWord: Record<TestIssueStream, string> = {
    structural: 'Paper',
    technical: 'App',
    reported: 'Students',
  };
  input.issues.forEach((issue, i) => {
    lines.push(
      `${i + 1}. [${streamWord[issue.stream]}] ${issue.title}` +
        (issue.phase ? ` (phase: ${issue.phase})` : ''),
    );
    const who = issue.stream === 'technical' && issue.phase ? input.affected[issue.phase] || [] : [];
    who.slice(0, PROMPT_STUDENT_LIMIT).forEach((s) => {
      lines.push(
        `   - ${s.name?.trim() || s.student_id}: ${s.times} ${plural(s.times, 'time', 'times')}, ` +
          `last ${promptWhen(s.last_at)}, message: ${s.message?.trim() || 'none recorded'}`,
      );
    });
    if (who.length > PROMPT_STUDENT_LIMIT) {
      lines.push(`   - and ${who.length - PROMPT_STUDENT_LIMIT} more students`);
    }
  });
  if (input.issues.length === 0) lines.push('(none listed)');
  lines.push('');

  const reports = (input.reports || []).filter((r) => String(r.description ?? '').trim());
  if (reports.length > 0) {
    lines.push('WHAT STUDENTS SAID');
    reports.slice(0, PROMPT_REPORT_LIMIT).forEach((r) => {
      lines.push(`- [${r.report_type || 'other'}] ${String(r.description).trim()}`);
    });
    if (reports.length > PROMPT_REPORT_LIMIT) {
      lines.push(`- and ${reports.length - PROMPT_REPORT_LIMIT} more reports`);
    }
    lines.push('');
  }

  lines.push('WHERE THE DATA IS');
  lines.push('- App lines come from nexus_test_attempt_errors, written by POST /api/student/tests/errors.');
  lines.push('- The banner is built by GET /api/question-bank/tests/[id]/health, rules in apps/nexus/src/lib/test-health.ts.');
  lines.push('- Expected refusals are already filtered out by apps/nexus/src/lib/test-error-classify.ts, so these rows are real failures.');
  lines.push('- Paper lines are computed from nexus_test_questions joined to nexus_qb_questions.');
  lines.push('- Student reports are nexus_qb_question_reports.');
  lines.push('');

  lines.push('WHAT TO DO');
  lines.push('1. Reproduce or trace each problem above to its root cause. Do not guess from the wording.');
  lines.push('2. Fix it, and add a regression test that fails without the fix.');
  lines.push('3. Tell me exactly how you verified it, with the command output.');
  lines.push('4. Do not deploy. I will test locally and press Mark as fixed on the screen above.');

  const text = lines.join('\n');
  if (text.length <= HEALTH_PROMPT_LIMIT) return text;
  return `${text.slice(0, HEALTH_PROMPT_LIMIT)}\n\n(truncated, open the screen above for the rest)`;
}
