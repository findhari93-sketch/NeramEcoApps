/**
 * The tests a class has actually sat.
 *
 * A teacher on /teacher/tests could not answer "how did the class test go?"
 * without already knowing which class it hung off. The paper library lists
 * PAPERS; the exam lives on nexus_exams, reachable only from the timetable; and
 * "By location" keeps one placement per paper, so a paper that is both a
 * chapter test and an exam shows up as whichever placement happened to sort
 * first. Nothing anywhere listed RUNS in date order.
 *
 * PURE. All the I/O is in api/tests/conducted/route.ts. What is encoded here is
 * which contexts count as "conducted", where each one keeps its date, and how
 * the three counts on a row are derived. Those are the parts worth testing
 * without a database.
 */

/**
 * The five ways a paper ends up in front of a class, named as a teacher would.
 *
 * Deliberately NOT the same axis as `RunDoor` in test-run-scope.ts. That answers
 * "which of the three doors did this attempt come through" for analytics; this
 * answers "what kind of thing was conducted" for a list a teacher scans. An
 * exam and a class test are both `class`-ish to a teacher but must be told apart
 * on this screen, and catch-up needs its own name because it is per student
 * rather than something the class sat together.
 */
export type ConductedKind = 'exam' | 'class_test' | 'assigned' | 'catchup' | 'prep';

/** Shown unless the teacher asks for more. The rest sit behind filter chips. */
export const DEFAULT_KINDS: ConductedKind[] = ['exam', 'class_test', 'assigned'];

export const KIND_LABELS: Record<ConductedKind, string> = {
  exam: 'Exam',
  class_test: 'Class test',
  assigned: 'Assigned',
  catchup: 'Catch-up',
  prep: 'Before class',
};

/** One placement, plus everything the route resolved about where it points. */
export interface ConductedRunInput {
  placement_id: string;
  test_id: string;
  paper_title: string | null;
  context_type: string;
  /** The lecture this run followed. Null for a classroom-wide assignment. */
  class_title: string | null;
  /** nexus_scheduled_classes.scheduled_date, a plain YYYY-MM-DD. */
  class_date: string | null;
  classroom_name: string | null;
  /** nexus_test_placements.available_from, or the exam's opens_at. */
  opens_at: string | null;
  /** nexus_test_placements.available_until, or the exam's closes_at. */
  closes_at: string | null;
  /** gating.due_at, which class tests write even when the run never shuts. */
  due_at: string | null;
  passing_pct: number | null;
  /** exam runs only. 'unpublished' means students still cannot see their answers. */
  results_state?: string | null;
}

/** What one grouped read of nexus_test_attempts says about one run. */
export interface RunTally {
  students_sat: number;
  attempts: number;
  passed: number;
}

export interface ConductedRun {
  placement_id: string;
  test_id: string;
  kind: ConductedKind;
  title: string;
  class_title: string | null;
  classroom_name: string | null;
  /** The run's own date, ISO. Null only when nothing anywhere carried one. */
  at: string | null;
  students_sat: number;
  attempts: number;
  passed: number;
  enrolled: number;
  passing_pct: number | null;
  /** True only for an exam whose results are still held back from students. */
  results_unpublished: boolean;
  href: string;
}

/**
 * Which kind of conducted run a placement is, or null if it is not one.
 *
 * study_file, student_practice, class_recap_section, foundation_section,
 * module_item and qb_paper all return null: a chapter test and a practice pool
 * are always open to everybody and were never "conducted" on a date, so putting
 * them in a chronological record would be answering a different question.
 */
export function classifyConducted(contextType: string | null | undefined): ConductedKind | null {
  switch (contextType) {
    case 'exam':
      return 'exam';
    case 'class_test':
      return 'class_test';
    case 'classroom_assignment':
      return 'assigned';
    case 'catchup_class':
      return 'catchup';
    case 'class_prep_test':
      return 'prep';
    default:
      return null;
  }
}

/**
 * When this run happened.
 *
 * Order matters and is not arbitrary. `opens_at` is the only field that says
 * when students actually sat it, so it wins outright. `due_at` beats
 * `closes_at` because a class test writes both and they are usually the same
 * instant, while a soft class test writes only `due_at`. The scheduled class
 * date is the last resort: it is a plain date with no time, so it sorts a run
 * to the start of its day rather than to the moment it ran.
 */
export function resolveRunDate(input: {
  opens_at?: string | null;
  due_at?: string | null;
  closes_at?: string | null;
  class_date?: string | null;
}): string | null {
  const usable = (v: string | null | undefined): string | null => {
    if (!v) return null;
    return Number.isNaN(Date.parse(v)) ? null : v;
  };
  return (
    usable(input.opens_at) ||
    usable(input.due_at) ||
    usable(input.closes_at) ||
    // A bare YYYY-MM-DD parses as midnight UTC, which is 05:30 IST. Pinned to
    // IST midnight instead so a class on the 18th never renders as the 17th.
    (input.class_date ? usable(`${String(input.class_date).slice(0, 10)}T00:00:00+05:30`) : null)
  );
}

/**
 * An "Assign to the class" placement counts as conducted only if it has a date.
 *
 * Without `available_until` such a placement is open forever and has no moment
 * to file it under. It is a standing expectation, not a sitting, and putting it
 * in a chronological list would mean inventing a date it never had.
 */
export function assignedRunHasDate(input: { closes_at?: string | null; due_at?: string | null }): boolean {
  return Boolean(input.closes_at || input.due_at);
}

const EMPTY_TALLY: RunTally = { students_sat: 0, attempts: 0, passed: 0 };

/**
 * The rows for one classroom, newest first.
 *
 * A run with nobody in it is kept, not dropped: "the class ignored this" is one
 * of the two answers a teacher opens this screen for, and a list that silently
 * hid it would only ever show good news.
 */
export function buildConductedRuns(input: {
  inputs: ConductedRunInput[];
  /** Keyed by placement_id. A missing entry means nobody sat it. */
  tallies: Record<string, RunTally>;
  /** Active student enrolments in the classroom, the same for every row. */
  enrolled: number;
  /** Which kinds to return. Defaults to DEFAULT_KINDS. */
  include?: ConductedKind[];
}): ConductedRun[] {
  const wanted = new Set(input.include && input.include.length > 0 ? input.include : DEFAULT_KINDS);

  const rows: ConductedRun[] = [];

  for (const r of input.inputs) {
    const kind = classifyConducted(r.context_type);
    if (!kind) continue;
    if (!wanted.has(kind)) continue;
    if (kind === 'assigned' && !assignedRunHasDate(r)) continue;

    const tally = input.tallies[r.placement_id] || EMPTY_TALLY;

    rows.push({
      placement_id: r.placement_id,
      test_id: r.test_id,
      kind,
      title: r.paper_title || 'Untitled test',
      class_title: r.class_title,
      classroom_name: r.classroom_name,
      at: resolveRunDate(r),
      students_sat: tally.students_sat,
      attempts: tally.attempts,
      passed: tally.passed,
      enrolled: input.enrolled,
      passing_pct: r.passing_pct,
      // Only an exam holds results back. A class test and an assigned paper
      // show the student their answers the moment they submit, so flagging
      // them here would invent a problem that does not exist.
      results_unpublished: kind === 'exam' && r.results_state === 'unpublished',
      href: `/teacher/tests/${r.test_id}?tab=results&placement_id=${r.placement_id}`,
    });
  }

  // Newest first, undated last. Ties broken on placement_id so the order is
  // stable between requests rather than whatever the database happened to
  // return, which would make rows jump around on a refresh.
  return rows.sort((a, b) => {
    if (a.at && b.at) {
      const diff = Date.parse(b.at) - Date.parse(a.at);
      if (diff !== 0) return diff;
    } else if (a.at !== b.at) {
      return a.at ? -1 : 1;
    }
    return a.placement_id.localeCompare(b.placement_id);
  });
}

/**
 * Tally one grouped read of nexus_test_attempts into per-run counts.
 *
 * `passed` counts distinct STUDENTS, not attempts: a student who scrapes the
 * bar on their fourth try passed once, and counting four would let the passed
 * figure exceed the number who sat it.
 *
 * The bar is the run's own `passing_pct`, never the paper's. The same paper is
 * routinely practice at 70 and an exam at 80, and reading the paper's bar would
 * silently report the wrong number of passes for one of them.
 */
export function tallyAttempts(
  // `percentage` is NUMERIC, and PostgREST sends NUMERIC as a string. Typed to
  // admit that rather than pretending, the way getClassTestRoster already does
  // by wrapping every read of the same column in Number().
  attempts: Array<{ placement_id: string | null; student_id: string; percentage: number | string | null }>,
  passingByPlacement: Record<string, number | null>,
): Record<string, RunTally> {
  const seen = new Map<string, Set<string>>();
  const passedSeen = new Map<string, Set<string>>();
  const out: Record<string, RunTally> = {};

  for (const a of attempts) {
    const pid = a.placement_id;
    if (!pid) continue;

    if (!out[pid]) out[pid] = { students_sat: 0, attempts: 0, passed: 0 };
    if (!seen.has(pid)) seen.set(pid, new Set());
    if (!passedSeen.has(pid)) passedSeen.set(pid, new Set());

    out[pid].attempts += 1;
    if (!seen.get(pid)!.has(a.student_id)) {
      seen.get(pid)!.add(a.student_id);
      out[pid].students_sat += 1;
    }

    const bar = passingByPlacement[pid];
    if (bar != null && a.percentage != null && Number(a.percentage) >= bar) {
      if (!passedSeen.get(pid)!.has(a.student_id)) {
        passedSeen.get(pid)!.add(a.student_id);
        out[pid].passed += 1;
      }
    }
  }

  return out;
}

/** Parse the `include` query string into kinds, ignoring anything unrecognised. */
export function parseIncludeParam(raw: string | null): ConductedKind[] {
  if (!raw) return DEFAULT_KINDS;
  const all: ConductedKind[] = ['exam', 'class_test', 'assigned', 'catchup', 'prep'];
  const asked = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ConductedKind => (all as string[]).includes(s));
  return asked.length > 0 ? asked : DEFAULT_KINDS;
}
