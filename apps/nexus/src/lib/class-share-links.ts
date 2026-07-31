/**
 * Every student deep link for a scheduled class, built from one base.
 *
 * These paths were previously retyped at each call site, which is how the Teams
 * wrap-up card came to point at `/student/timetable?class=<id>`: a URL nothing
 * reads. One owner means one place to fix when a route moves.
 *
 * Pure and client-safe. Do NOT import anything server-side here: the share
 * dialog pulls this in through the model, and teams-class-announcements.ts
 * reaches for getSupabaseAdminClient the moment it is loaded.
 */

/** Trim a trailing slash so `${base}/student/...` never yields a double slash. */
function normalizeBase(base: string): string {
  return base.replace(/\/+$/, '');
}

/**
 * Resolve the public origin for student links.
 *
 * NEXT_PUBLIC_NEXUS_URL first, the request origin as the fallback, which is the
 * idiom every other link builder in this app uses. On the client, pass
 * window.location.origin.
 */
export function shareBaseUrl(fallbackOrigin?: string | null): string {
  return normalizeBase(process.env.NEXT_PUBLIC_NEXUS_URL || fallbackOrigin || '');
}

export interface ClassShareLinkBuilder {
  /** One assignment. Drawing and document share this route; the type is a field. */
  assignment(assignmentId: string): string;
  /** The short test a student must pass BEFORE the class unlocks. */
  prepTest(classId: string): string;
  /** The test attached to a class a student missed. Not the same paper. */
  catchUpTest(classId: string): string;
  /**
   * The guided recap player. SINGULAR `class-recap`: the plural is the list
   * page and has no [recapId] child, so the obvious guess 404s.
   */
  recap(recapId: string): string;
  /** The per-class catch-up page, the fallback when there is no published recap. */
  catchUp(classId: string): string;
  /** One-tap RSVP. The only per-class student route no feature flag gates. */
  rsvp(classId: string): string;
  /**
   * The student timetable, opened on one class.
   *
   * There is no `/student/timetable/[classId]` page, so this is a query
   * parameter the page reads to open its detail panel. The Teams wrap-up card
   * posted this shape for months before anything read it; keeping it here means
   * the page and the card can never disagree about the parameter name again.
   */
  classInTimetable(classId: string): string;
}

export function classShareLinks(base: string): ClassShareLinkBuilder {
  const b = normalizeBase(base);
  return {
    assignment: (id) => `${b}/student/assignments/${id}`,
    prepTest: (classId) => `${b}/student/class-prep/${classId}/test`,
    catchUpTest: (classId) => `${b}/student/catch-up/${classId}/test`,
    recap: (recapId) => `${b}/student/class-recap/${recapId}`,
    catchUp: (classId) => `${b}/student/timetable/${classId}/catch-up`,
    rsvp: (classId) => `${b}/student/rsvp/${classId}`,
    classInTimetable: (classId) => `${b}/student/timetable?class=${classId}`,
  };
}
