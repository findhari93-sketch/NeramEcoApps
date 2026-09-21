/**
 * The ticket deep link, built in one place and read in one place.
 *
 * A reply on a support ticket now reaches the other side as a Teams chat and a
 * bell entry, and both have to land on the ticket itself rather than on a list
 * of seventy-seven. Staff and students read the same ticket at two different
 * addresses, so the side the RECIPIENT is on decides the path, never the
 * sender's. Spelling that out at each call site is how a link and the page that
 * reads it drift apart.
 *
 * Neither issues page has an [id] route: both hold the open ticket in React
 * state. So this is a query parameter, which is also the convention
 * getNavigationUrl already uses for ?why= and ?placement_id=.
 *
 * PURE and client safe.
 */

export const ISSUE_PARAM = 'issue';

function withRef(base: string, ref: string): string {
  return `${base}?${ISSUE_PARAM}=${encodeURIComponent(ref)}`;
}

/** Where the reporter reads their own ticket. `ref` is a ticket number or the uuid. */
export function studentIssuePath(ref: string): string {
  return withRef('/student/issues', ref);
}

/** Where staff read the same ticket. */
export function teacherIssuePath(ref: string): string {
  return withRef('/teacher/issues', ref);
}

/**
 * The path for whoever is going to READ the notification.
 *
 * Nexus roles other than teacher fall back to the student page, matching
 * getNavigationUrl's own `nexusRole || 'student'` idiom.
 */
export function issuePathFor(role: string | null | undefined, ref: string): string {
  return role === 'teacher' || role === 'admin' || role === 'manager'
    ? teacherIssuePath(ref)
    : studentIssuePath(ref);
}

function absolute(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** The full link for a Teams chat, from a base like https://nexus.neramclasses.com. */
export function studentIssueUrl(base: string, ref: string): string {
  return absolute(base, studentIssuePath(ref));
}

export function teacherIssueUrl(base: string, ref: string): string {
  return absolute(base, teacherIssuePath(ref));
}

interface IssueRef {
  id: string;
  ticket_number?: string | null;
}

/**
 * Which ticket a ?issue= parameter names.
 *
 * Accepts either form, because a human pasting a link from a Teams message has
 * the ticket number in front of them ("NXS-0125") while the code that built the
 * link may only have had the uuid. The ticket number match ignores case: Teams
 * and some mail clients title-case or upper-case a bare token in a URL.
 */
export function findIssueForRef<T extends IssueRef>(issues: T[], ref: string): T | null {
  const needle = ref.trim();
  if (!needle) return null;
  const byId = issues.find((i) => i.id === needle);
  if (byId) return byId;
  const lower = needle.toLowerCase();
  return issues.find((i) => (i.ticket_number || '').toLowerCase() === lower) || null;
}
