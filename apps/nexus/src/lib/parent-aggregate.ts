/**
 * "18 of 24 have submitted", and never one word more.
 *
 * WHAT THIS IS FOR
 * ----------------
 * A parent can see whether their own child did the work. That alone gives them
 * no sense of scale: is an unsubmitted assignment a crisis, or did the teacher
 * set it yesterday and nobody has started? The class total answers that, and it
 * is the thing that lets a parent decide whether to say something at dinner.
 *
 * WHAT THIS MUST NEVER BECOME
 * ---------------------------
 * The output shape is `{ submitted, of }` and it will not widen. No names, no
 * ids, no avatars, no "who is late", no per-bucket split. A parent is entitled
 * to know where their child sits in a distribution; they are not entitled to
 * anything about a specific other child. Every field added here is a field
 * somebody can use to work out who.
 *
 * THE DENOMINATOR IS NOT NEGOTIABLE
 * ---------------------------------
 * It comes from loadClassroomRoster (packages/database/src/queries/nexus/roster.ts),
 * the same helper the teacher's own submission counts use. If the parent's
 * denominator were computed differently, the two screens would report different
 * numbers for the same class and neither would be believable.
 *
 * That helper excludes dormant students, and so does this. It is the reason a
 * paused child appears in neither the "submitted" nor the "not submitted" list,
 * which is precisely the report that prompted this work. The fix for that
 * confusion is the enrolment notice in lib/parent-enrollment.ts, NOT quietly
 * counting dormant students here: that would make the parent's number disagree
 * with the teacher's and fix nothing.
 *
 * Pure and DB-free, so all of the above is unit-testable.
 */

/**
 * Below this many eligible students, publish no total at all.
 *
 * The genuinely identifying case is 2: a parent who knows their own child's
 * status can derive the other student's exactly. 3 and 4 leak less but still
 * narrow it to one or two families. 5 is the conservative round number, and the
 * cost of being wrong in the safe direction is one missing line of context.
 */
export const SMALL_CLASS_FLOOR = 5;

/** The only shape that crosses the wire. */
export interface AnonymousAggregate {
  /** How many of `of` have done the thing. Always <= of. */
  submitted: number;
  /** Eligible students. Never the raw class size. */
  of: number;
}

/** The roster fields this module needs. A subset of RosterMember, on purpose. */
export interface AggregateMember {
  user_id: string;
  /** timestamptz */
  enrolled_at: string | null;
}

/** IST end of day, the same literal roster.ts uses for its `asOf` filter. */
function endOfDayIst(date: string): string {
  return `${date}T23:59:59+05:30`;
}

/**
 * The roster as it stood on a given day.
 *
 * A student who enrolled the week after an assignment was set never had the
 * chance to do it, so counting them in the denominator would understate the
 * class and make a parent's child look better by comparison than they are.
 *
 * Applied in JS rather than by passing `asOf` to loadClassroomRoster because the
 * date differs per assignment: one roster read plus pure arithmetic stays flat
 * as the assignment count grows, whereas one roster query per assignment does
 * not. Same boundary literal either way, so the two agree exactly.
 */
export function eligibleAtDate(
  members: AggregateMember[],
  onDate: string | null | undefined
): string[] {
  const list = members || [];
  if (!onDate) return list.map((m) => m.user_id);

  const cutoff = Date.parse(endOfDayIst(onDate));
  if (!Number.isFinite(cutoff)) return list.map((m) => m.user_id);

  return list
    .filter((m) => {
      // No enrolment timestamp means we cannot prove they joined late. Counting
      // them is the honest default: it can only make the class look worse, never
      // a specific child look better.
      if (!m.enrolled_at) return true;
      const joined = Date.parse(m.enrolled_at);
      if (!Number.isFinite(joined)) return true;
      return joined <= cutoff;
    })
    .map((m) => m.user_id);
}

/**
 * Turn an eligible set and a set of doers into the one publishable number.
 *
 * Returns null below the privacy floor. Callers must render the "not shown for
 * small groups" line rather than falling back to a raw count.
 */
export function buildAnonymousAggregate(args: {
  eligibleIds: string[] | Set<string>;
  /**
   * Everyone recorded as having done it, from any source. Union the document and
   * drawing submission tables before calling: a student who submitted to both
   * must count once, and the intersection below is what guarantees that.
   */
  submitterIds: string[] | Set<string>;
}): AnonymousAggregate | null {
  const eligible =
    args.eligibleIds instanceof Set ? args.eligibleIds : new Set(args.eligibleIds || []);
  const of = eligible.size;

  if (of < SMALL_CLASS_FLOOR) return null;

  const submitters =
    args.submitterIds instanceof Set ? args.submitterIds : new Set(args.submitterIds || []);

  // Intersect, never count the submitter rows directly. A submission from a
  // student who has since gone dormant, graduated, or left the classroom is a
  // real row that is not in the denominator, and counting it would produce
  // "25 of 24", which destroys trust in every other number on the page.
  let submitted = 0;
  for (const id of submitters) {
    if (eligible.has(id)) submitted += 1;
  }

  return { submitted: Math.min(submitted, of), of };
}

/**
 * The sentence under a class total.
 *
 * Here rather than in the component so the small-group case is worded once, and
 * so no caller can accidentally render "0 of 0".
 */
export function describeAggregate(
  aggregate: AnonymousAggregate | null,
  noun: 'submitted' | 'attempted' = 'submitted'
): string {
  if (!aggregate) return 'Class totals are not shown for very small groups.';
  const verb = noun === 'submitted' ? 'handed this in' : 'attempted this';
  if (aggregate.submitted === 0) {
    return `Nobody in the class has ${verb} yet.`;
  }
  if (aggregate.submitted === aggregate.of) {
    return `Everyone in the class has ${verb}.`;
  }
  return `${aggregate.submitted} of ${aggregate.of} in the class have ${verb}.`;
}
