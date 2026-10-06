/**
 * Nexus held after three classes missed in silence: the decision, in one pure
 * function.
 *
 * A student down as attending who does not join and says nothing anywhere (no
 * away window, no reason on the class, no decline) is a `no_reason` cell in
 * attendance-register.ts. Three in a row, each with a message sent AND proven
 * seen, puts their Nexus on hold until they record a reason or speak to a
 * teacher. The blocker is self-serve and clears in under a minute, which is the
 * only reason a gate like this is defensible at all: the same argument
 * photo-gate.ts makes for itself.
 *
 * THIS MODULE READS A DECISION, IT DOES NOT MAKE ONE. The streak is computed
 * once a morning by the sweep, which writes a row; here we only look it up.
 * Three reasons, all of which were learned the hard way elsewhere:
 *
 *   /api/auth/me cannot afford it. The streak needs the class list plus
 *   attendance, absences, RSVPs and away windows: five reads, two over IN
 *   lists, on the route that runs for every signed-in person on every page
 *   load. That route's own comments document how hard its waits were fought
 *   down. A streak in there is a whole-app regression nobody asked for.
 *
 *   A lockout has to be an EVENT, with evidence and a timestamp, not a
 *   conclusion recomputed per page load that flips the moment a sync lands.
 *   The student is owed the date and the reason.
 *
 *   A computed gate cannot be lifted. A teacher takes a phone call, restores
 *   access, and the next page load locks the student out again.
 *
 * PURE TypeScript: no JSX, no Supabase, no next/navigation, so the same
 * decision runs on the server and in unit tests. Same discipline as
 * photo-gate.ts and feature-flags.ts.
 *
 * Deliberate rules, each of which has bitten a previous access gate:
 *
 *   Impersonation is NEVER blocked. "View as Student" is how a teacher
 *   diagnoses what a student is seeing, and a held student is exactly who they
 *   will be looking at. A gate that fires there shows the teacher the lockout
 *   screen and nothing else.
 *
 *   Staff are never blocked. The rule is about students, and holding a teacher
 *   would lock out the person who has to lift it.
 *
 *   A student with no active classroom is never blocked. RoleGuard already
 *   gives them NoClassroomWelcome, which is the more useful message.
 *
 *   The flag is read first, so the whole rule is reversible from the admin
 *   panel without a deploy. Reversing something this visible needs a switch.
 */

/** Feature-flag id that arms the gate. Off by default, see feature-flags.ts. */
export const ABSENCE_GATE_FEATURE = 'student.absence-reason-gate';

/** Why a hold was put on. A rule did it, or a person did. */
export type RestrictionReason = 'silent_absence' | 'manual';

/** One class the hold is evidence of, denormalised so the gate needs no join. */
export interface HeldClass {
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
}

export interface AbsenceGateInput {
  /** Resolved value of the student.absence-reason-gate flag. */
  flagEnabled: boolean;
  /** 'student' | 'teacher' | 'admin' | 'parent', as derived by /api/auth/me. */
  nexusRole: string;
  /** True when the request carries an impersonation token. */
  impersonating: boolean;
  /** Number of active, non-archived classrooms the user is enrolled in. */
  classroomCount: number;
  /** A live nexus_student_access_restrictions row, or null. */
  restriction: {
    reason: RestrictionReason;
    setAt: string;
    /** Null when a rule did this rather than a person. */
    setBy: string | null;
  } | null;
}

/** Should this request be shown the full-screen hold? */
export function shouldBlockForAbsence(input: AbsenceGateInput): boolean {
  if (!input.flagEnabled) return false;
  if (input.nexusRole !== 'student') return false;
  if (input.impersonating) return false;
  if (input.classroomCount <= 0) return false;
  return input.restriction !== null;
}

/** What /api/auth/me returns, and what the client blocker reads. */
export interface AbsenceGateState {
  required: boolean;
  /**
   * The classes this hold is made of, newest first.
   *
   * Carried on the payload rather than fetched by the blocker, because the
   * blocker renders above every route and must not need a second request to
   * explain itself. A hold a student cannot see the reasons for is the kind
   * they screenshot to a parent.
   */
  classes: HeldClass[];
  setAt: string | null;
  /** True when a person did this, so the screen says "your teacher", not "Nexus". */
  byTeacher: boolean;
  /** A teacher's note, only ever set when byTeacher. */
  teacherNote: string | null;
}

/**
 * Safe default for the client before /api/auth/me resolves, for parent
 * sessions, and for E2E test mode.
 *
 * Never blocks. A gate defaulting to "held" would flash the blocker on every
 * page load for every compliant student, and a failed read of the restriction
 * table must land here rather than throwing: unlike the enrolments read above
 * it in that route, a failure here has a safe direction and this is it.
 */
export const DEFAULT_ABSENCE_GATE: AbsenceGateState = {
  required: false,
  classes: [],
  setAt: null,
  byTeacher: false,
  teacherNote: null,
};
