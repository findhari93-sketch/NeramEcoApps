import type { RosterMember } from '@neram/database';

/**
 * One fact per student, folded from however many enrolments they hold.
 *
 * Lives here rather than inline in the route because a Next App Router
 * `route.ts` may only export the handlers and its config, so anything exported
 * from one is untestable. The fold is the only part of that route with a
 * decision in it, and the decisions below are subtle enough to want pinning.
 * Same split as lib/class-prep-roster.ts.
 */

export interface StudentFact {
  /** nexus_enrollments.current_standard, from the NEWEST enrolment. Null means unrecorded. */
  stage: string | null;
  /** Enrolled but paused. True only when EVERY enrolment says so. */
  dormant: boolean;
  /** users.avatar_url, so a screen holding only an id can still show the real face. */
  photo: string | null;
  /** users.name, so a screen holding only an id can still show the real name. */
  name: string | null;
}

export function foldStudentFacts(members: RosterMember[]): Record<string, StudentFact> {
  /**
   * Classroom-per-year means a returning student legitimately holds an enrolment
   * in both the 2026 and the 2027 classroom, so the four fields fold three
   * different ways:
   *
   *   stage        varies per enrolment  -> newest enrolled_at wins, because a
   *                                        student who was in Class 11 last year
   *                                        is in Class 12 now and the older row
   *                                        is simply out of date.
   *   dormant      varies per enrolment  -> true only when every enrolment agrees,
   *                                        matching pickTrackedIds. Dormant in
   *                                        last year's archived classroom and
   *                                        active in this year's is not a break.
   *   photo, name  PER USER, not per enrolment -> first sight, and that is the
   *                                        whole rule. loadClassroomRoster joins
   *                                        one `user:users!...` embed per query,
   *                                        so every row for a person carries the
   *                                        identical users row: "newest" and "all
   *                                        agree" are both no-ops on a constant.
   *                                        If a caller ever passes userColumns to
   *                                        vary them per row, copy the stage rule.
   */
  const newest = new Map<string, string>();
  const facts: Record<string, StudentFact> = {};

  for (const member of members) {
    const existing = facts[member.user_id];
    const at = member.enrolled_at || '';

    if (!existing) {
      facts[member.user_id] = {
        stage: member.current_standard ?? null,
        dormant: member.participation_status === 'dormant',
        photo: member.user?.avatar_url ?? null,
        name: member.user?.name ?? null,
      };
      newest.set(member.user_id, at);
      continue;
    }

    // Any participating enrolment clears the dormant flag for this person.
    if (member.participation_status !== 'dormant') existing.dormant = false;

    if (at > (newest.get(member.user_id) || '')) {
      newest.set(member.user_id, at);
      existing.stage = member.current_standard ?? null;
    }
  }

  return facts;
}
