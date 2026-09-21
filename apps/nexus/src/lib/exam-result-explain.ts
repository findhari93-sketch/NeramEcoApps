/**
 * The working behind one student's exam result.
 *
 * WHY THIS EXISTS. The founder's question about publishing results was not "how
 * do I send them", it was "what happens when a student says the number is
 * wrong". Two of those disputes were predicted by name, and both are real:
 *
 *   "I scored more but my percentage is less."  The card used to headline the
 *   BEST of every attempt on the door while the rank beside it came from the
 *   published snapshot, which ranks the FIRST submitted attempt.
 *
 *   "I attempted it more than once."  Nothing anywhere told a student which of
 *   their attempts had been counted, and nothing tells a teacher either without
 *   a database session.
 *
 * So a query carries the answer with it. Every field below is read off rows that
 * already exist (nexus_exam_results holds attempt_id, rank, sitting, percentage
 * and is_provisional; loadRunSittings enumerates the attempts), and the teacher
 * receives it in a sentence rather than being asked to go and look.
 *
 * PURE. The route does the reading; this decides what the facts mean.
 */

export type ResultQueryReason =
  | 'marks_wrong'
  | 'rank_wrong'
  | 'wrong_attempt'
  | 'question_marked_wrong'
  | 'something_else';

export interface ResultQueryReasonDef {
  code: ResultQueryReason;
  /** What the student picks. Their words, not the schema's. */
  label: string;
  /** A note is useless-without for these two: there is nothing to check otherwise. */
  requiresNote: boolean;
}

/**
 * Ordered by what a student is most likely to mean. "The wrong attempt was
 * counted" is third rather than last because it is the one the product actually
 * got wrong, so it needs to be findable.
 */
export const RESULT_QUERY_REASONS: ResultQueryReasonDef[] = [
  { code: 'marks_wrong', label: 'My marks look wrong', requiresNote: false },
  { code: 'rank_wrong', label: 'My rank looks wrong', requiresNote: false },
  { code: 'wrong_attempt', label: 'The wrong attempt was counted', requiresNote: false },
  { code: 'question_marked_wrong', label: 'A question was marked wrong when it was right', requiresNote: true },
  { code: 'something_else', label: 'Something else', requiresNote: true },
];

export function resultQueryReason(code: string | null | undefined): ResultQueryReasonDef | null {
  return RESULT_QUERY_REASONS.find((r) => r.code === code) ?? null;
}

export function resultQueryRequiresNote(code: string | null | undefined): boolean {
  return resultQueryReason(code)?.requiresNote === true;
}

export interface ExplainAttempt {
  /** nexus_test_attempts.id, matched against the snapshot's attempt_id. */
  id: string;
  attemptNumber: number;
  percentage: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  /** 'official' counts towards the exam; practice never does. */
  mode: string | null;
}

export interface ExplainInput {
  examTitle: string;
  /** The published snapshot row for this student. */
  snapshot: {
    attemptId: string | null;
    score: number | null;
    totalMarks: number | null;
    percentage: number | null;
    rank: number | null;
    sitting: 'main' | 'second';
    isProvisional: boolean;
    absent: boolean;
  };
  /** Everyone ranked in the same sitting, the student included. */
  sittingSize: number;
  /** Every attempt this student has on the paper, in attempt_number order. */
  attempts: ExplainAttempt[];
  /** The pass bar stored with the exam now. Null when the exam has none. */
  passingPctNow: number | null;
}

export interface ResultFacts {
  examTitle: string;
  /** Null when no paper was counted: absent, or still to sit. */
  counted: { attemptNumber: number | null; startedAt: string | null; submittedAt: string | null } | null;
  marks: { score: number; total: number; percentage: number } | null;
  rank: { position: number | null; outOf: number; sitting: 'main' | 'second' };
  provisional: boolean;
  absent: boolean;
  passingPctNow: number | null;
  /** Attempts that exist but were NOT the one ranked. The "I scored more" answer. */
  otherAttempts: Array<ExplainAttempt & { higherThanCounted: boolean }>;
}

export function explainExamResult(input: ExplainInput): ResultFacts {
  const { snapshot } = input;
  // An equality check on the id, not a heuristic: the snapshot stores the very
  // attempt_id these rows were loaded with. Guessing by "the first one" is the
  // bug this whole module exists to explain.
  const countedAttempt = snapshot.attemptId
    ? (input.attempts.find((a) => a.id === snapshot.attemptId) ?? null)
    : null;

  const countedPct = snapshot.percentage ?? null;
  const others = input.attempts
    .filter((a) => a !== countedAttempt)
    .map((a) => ({
      ...a,
      higherThanCounted: countedPct != null && a.percentage != null && a.percentage > countedPct,
    }));

  return {
    examTitle: input.examTitle,
    counted: countedAttempt
      ? {
          attemptNumber: countedAttempt.attemptNumber,
          startedAt: countedAttempt.startedAt,
          submittedAt: countedAttempt.submittedAt,
        }
      : snapshot.attemptId
        ? { attemptNumber: null, startedAt: null, submittedAt: null }
        : null,
    marks:
      snapshot.attemptId && snapshot.percentage != null
        ? {
            score: Number(snapshot.score ?? 0),
            total: Number(snapshot.totalMarks ?? 0),
            percentage: Number(snapshot.percentage),
          }
        : null,
    rank: { position: snapshot.rank, outOf: input.sittingSize, sitting: snapshot.sitting },
    provisional: snapshot.isProvisional,
    absent: snapshot.absent,
    passingPctNow: input.passingPctNow,
    otherAttempts: others,
  };
}

function pct(n: number | null): string {
  return n == null ? 'not recorded' : `${Math.round(n * 10) / 10}%`;
}

function when(iso: string | null): string {
  if (!iso) return 'an unrecorded time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unrecorded time';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * What the teacher reads in Teams.
 *
 * Written so the common disputes answer themselves before the teacher opens
 * anything. The "You also have N other attempts" block is the whole reason this
 * module exists: a student who sat the paper twice and sees the lower number is
 * not wrong about what they scored, only about which sitting counts.
 *
 * Times are IST with an explicit timeZone. Formatting an ISO instant without one
 * has already shipped a bug here once, where a parent notice read a day early.
 */
export function renderFactsForTeacher(facts: ResultFacts, studentName: string, said: string): string {
  const lines: string[] = [`${studentName} thinks their result for ${facts.examTitle} is wrong.`, '', `They said: ${said}`, ''];

  lines.push('What Nexus has:');
  if (facts.absent) {
    lines.push('  Marked absent. No attempt was recorded for them.');
  } else if (!facts.counted) {
    lines.push('  No paper counted yet. Their window may still be open.');
  } else {
    if (facts.counted.attemptNumber != null) {
      lines.push(`  Counted: attempt ${facts.counted.attemptNumber}, submitted ${when(facts.counted.submittedAt)}`);
    } else {
      lines.push('  Counted: the attempt on their published row');
    }
    if (facts.marks) {
      lines.push(`  Marks: ${round1(facts.marks.score)} of ${round1(facts.marks.total)}`);
      lines.push(`  Percentage: ${round1(facts.marks.score)} / ${round1(facts.marks.total)} = ${pct(facts.marks.percentage)}`);
    }
    lines.push(
      `  Rank: ${facts.rank.position ?? 'unranked'} of ${facts.rank.outOf}, ranked against the ${
        facts.rank.sitting === 'second' ? 'second sitting' : 'exam day sitting'
      } only`,
    );
    if (facts.passingPctNow != null) lines.push(`  Pass mark now set at: ${pct(facts.passingPctNow)}`);
    if (facts.provisional) lines.push('  Provisional: a drawing is still being marked, so the total can still change.');
  }

  if (facts.otherAttempts.length > 0) {
    lines.push('', `They have ${facts.otherAttempts.length} other attempt${facts.otherAttempts.length === 1 ? '' : 's'} on this paper:`);
    for (const a of facts.otherAttempts) {
      const higher = a.higherThanCounted ? ', HIGHER than the one counted' : '';
      lines.push(`  Attempt ${a.attemptNumber}: ${pct(a.percentage)}${a.mode ? ` (${a.mode})` : ''}, ${when(a.submittedAt)}${higher}`);
    }
    if (facts.otherAttempts.some((a) => a.higherThanCounted)) {
      lines.push('', 'The exam is ranked on the first submitted attempt, so a higher later attempt does not change it. That is most likely what they are seeing.');
    }
  }

  return lines.join('\n');
}

function round1(n: number): number {
  return Math.round(Number(n) * 10) / 10;
}
