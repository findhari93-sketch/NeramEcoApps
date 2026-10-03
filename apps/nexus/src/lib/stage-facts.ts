import type { RosterMember, RosterMemberUser } from '@neram/database';
import { languageKeyOf, type LanguageKey } from './student-language';
import { isLevelKey, overallLevel, type LevelKey } from './student-level';

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
  /**
   * users.home_language, already resolved: NULL, an unknown word and a roster
   * loaded without the column all read as English. Drives the avatar mark.
   */
  language: LanguageKey;
  /** users.limited_english. Flips the mark to its outlined form. */
  limitedEnglish: boolean;
  /** nexus_student_skill_levels, skill 'drawing'. Null means not rated. */
  drawingLevel: LevelKey | null;
  /** The one level the avatar shows. See overallLevel() in student-level.ts. */
  overallLevel: LevelKey | null;
}

/** The roster row this fold reads: the base users embed plus the language columns. */
export type StageFactMember = RosterMember<
  RosterMemberUser & { home_language?: string | null; limited_english?: boolean | null }
>;

export function foldStudentFacts(members: StageFactMember[]): Record<string, StudentFact> {
  /**
   * Classroom-per-year means a returning student legitimately holds an enrolment
   * in both the 2026 and the 2027 classroom, so the five fields fold three
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
   *   photo, name, PER USER, not per enrolment -> first sight, and that is the
   *   language, limitedEnglish             whole rule. loadClassroomRoster joins
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
        language: languageKeyOf(member.user?.home_language),
        limitedEnglish: member.user?.limited_english === true,
        drawingLevel: null,
        overallLevel: null,
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

/** One row of nexus_student_skill_levels, as the stage-facts route selects it. */
export interface SkillLevelRow {
  student_id: string;
  skill: string;
  level: string;
}

/**
 * Lays the levels over the folded facts, in place. Levels belong to the student,
 * not to an enrolment, so there is nothing to fold: a row either names a known
 * student or is ignored (an alumnus, someone no longer enrolled). An unknown
 * level word is ignored too rather than trusted, so a bad row reads as "Not
 * rated" instead of drawing a mark nobody chose.
 */
export function applySkillLevels(facts: Record<string, StudentFact>, rows: readonly SkillLevelRow[]): void {
  for (const row of rows) {
    const fact = facts[row.student_id];
    if (!fact || row.skill !== 'drawing' || !isLevelKey(row.level)) continue;
    fact.drawingLevel = row.level;
  }
  for (const fact of Object.values(facts)) {
    fact.overallLevel = overallLevel({ drawing: fact.drawingLevel });
  }
}

/**
 * The wire form of the lookup: each fact with every field that is still at its
 * default left out. StudentStageFactsProvider already reads a missing field as
 * that default (null, false, English), and on a roster where most students are
 * unpaused English speakers with no level yet that is most of the payload.
 * Every student keeps an entry, even an empty one, so the optimistic level patch
 * in student-level-client.ts still finds the row it spreads into.
 */
export function compactStudentFacts(
  facts: Record<string, StudentFact>,
): Record<string, Partial<StudentFact>> {
  const out: Record<string, Partial<StudentFact>> = {};
  for (const [id, f] of Object.entries(facts)) {
    const c: Partial<StudentFact> = {};
    if (f.stage !== null) c.stage = f.stage;
    if (f.dormant) c.dormant = true;
    if (f.photo !== null) c.photo = f.photo;
    if (f.name !== null) c.name = f.name;
    if (f.language !== 'english') c.language = f.language;
    if (f.limitedEnglish) c.limitedEnglish = true;
    if (f.drawingLevel !== null) c.drawingLevel = f.drawingLevel;
    if (f.overallLevel !== null) c.overallLevel = f.overallLevel;
    out[id] = c;
  }
  return out;
}
