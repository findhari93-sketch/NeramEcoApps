/**
 * A paper and its runs.
 *
 * A "run" is one scheduled use of a paper: who it is for, when it closes, and
 * how they did. The same 150 question paper is very often both an always-open
 * practice pool and a dated class test, and until the results tab could tell
 * those two apart a teacher asking "how did my class do" was shown every
 * stranger who had ever practised it.
 *
 * PURE. All the I/O lives in the results route. The only thing encoded here is
 * the shape of nexus_test_placements.context_id, which is polymorphic with no
 * FK and therefore has to be interpreted per context_type. Getting that wrong
 * means looking up a classroom by a class id and quietly finding nothing, so it
 * is written down once, here, with tests.
 */

export type RunDoor = 'practice' | 'class' | 'exam' | 'other';

/**
 * Contexts whose context_id is a nexus_scheduled_classes id.
 *
 * Verified against the writers: class-test.ts and class-prep.ts pass
 * `contextId: input.scheduledClassId`, catchup-test.ts passes
 * `recap.scheduled_class_id`, and exams.ts reads its placement back by
 * `.eq('context_id', exam.scheduled_class_id)`.
 */
export const CLASS_ANCHORED_CONTEXTS = new Set([
  'class_test',
  'class_prep_test',
  'catchup_class',
  'exam',
]);

/** Contexts whose context_id is a nexus_classrooms id. */
export const CLASSROOM_ANCHORED_CONTEXTS = new Set([
  'classroom_assignment',
  'student_practice',
]);

/**
 * Which of the three doors a run came through.
 *
 * Deliberately the same three buckets as classifyAttemptKind in
 * packages/database/src/queries/nexus/test-analytics.ts, so the teacher's
 * vocabulary and the analytics vocabulary cannot drift into two taxonomies for
 * one idea. 'other' covers the contexts a teacher never picks (a chapter gate,
 * a recap section), which are reported but not offered as a way to set a paper.
 */
export function classifyRunDoor(contextType: string | null | undefined): RunDoor {
  if (contextType === 'exam') return 'exam';
  if (contextType === 'classroom_assignment' || contextType === 'class_test') return 'class';
  if (contextType === 'student_practice') return 'practice';
  return 'other';
}

/** True when a run can say who was supposed to sit it. */
export function canBuildRoster(contextType: string | null | undefined): boolean {
  return (
    CLASS_ANCHORED_CONTEXTS.has(String(contextType)) ||
    CLASSROOM_ANCHORED_CONTEXTS.has(String(contextType))
  );
}

function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * What the run picker calls this run.
 *
 * Names the door first, because that is the distinction the teacher came here
 * to make, then the thing that pins it down: the class it followed, or the day
 * it ran. A class test with no linked class says so rather than pretending, so
 * an old "Assign to classroom" placement is not mistaken for a lecture test.
 */
export function buildRunLabel(input: {
  contextType: string | null;
  contextLabel: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
}): string {
  const door = classifyRunDoor(input.contextType);
  const when = formatDay(input.opensAt) || formatDay(input.closesAt);

  if (door === 'practice') return 'Practice (always open)';

  if (door === 'exam') {
    return input.contextLabel
      ? `Exam: ${input.contextLabel}${when ? `, ${when}` : ''}`
      : `Exam${when ? `: ${when}` : ''}`;
  }

  if (door === 'class') {
    if (input.contextType === 'classroom_assignment') {
      return input.contextLabel
        ? `Class test: ${input.contextLabel} (whole class, no class linked)`
        : 'Class test (whole class, no class linked)';
    }
    return input.contextLabel
      ? `Class test: ${input.contextLabel}${when ? `, ${when}` : ''}`
      : `Class test${when ? `: ${when}` : ''}`;
  }

  // The contexts a teacher never sets by hand. Named plainly so an attempt that
  // came through one is explainable rather than mysterious.
  const fallback: Record<string, string> = {
    study_file: 'Chapter test',
    class_prep_test: 'Before class',
    catchup_class: 'Catch-up',
    class_recap_section: 'Recap checkpoint',
    foundation_section: 'Foundation section',
    module_item: 'Module item',
  };
  const base = fallback[String(input.contextType)] || 'Other';
  return input.contextLabel ? `${base}: ${input.contextLabel}` : base;
}
