/**
 * Which API requests can move a sidebar badge.
 *
 * NavBadgeProvider watches every fetch the page makes and refreshes the badge
 * counts after a successful request listed here. That replaced "each page calls
 * refreshBadges() after it acts", which every new screen forgot: the Issues page
 * never called it, so closing the last ticket left a 3 in the sidebar for up to
 * two minutes while the page behind it said 0.
 *
 * Deliberately an allowlist, not "every mutation". Exam autosave, Answer Pad
 * strokes and heartbeats fire every few seconds, and each one costing a badge
 * request would be a poll loop by another name.
 *
 * Keyed by badge so a new badge cannot ship without saying what moves it:
 * badge-mutations.test.ts fails when a key in PATH_TO_BADGE_KEY has no entry.
 */

/** A path prefix, or a pattern for routes with an id in the middle. */
type RouteMatch = string | RegExp;

export const BADGE_MUTATION_ROUTES: Record<string, RouteMatch[]> = {
  // Every ticket move, reply, delete and new report.
  issues: ['/api/foundation/issues'],

  // Staff: excuse / restore / celebrate, a class marked not taught, reasons
  // logged from the attendance report. Student: start, give a reason, mark
  // watched, mark caught up.
  catchup: [
    '/api/catchup/',
    '/api/timetable/attendance-report',
    /^\/api\/timetable\/[^/]+\/(catch-up|not-taught)(\/|$)/,
  ],

  photo_review: ['/api/photo-review'],

  // Reacting to or skipping a sketch.
  sketchbook_inbox: ['/api/sketchbook/entries'],

  // A review sent on a drawing settles what is owed in both places.
  assignment_drawings: ['/api/drawing/submissions', '/api/drawing/evaluations'],
  test_drawings: ['/api/drawing/submissions', '/api/drawing/evaluations'],

  // A student reporting a question, and staff resolving a report.
  qb_reports: ['/api/question-bank/reports/', /^\/api\/question-bank\/questions\/[^/]+\/reports?(\/|$)/],
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Opening a ticket is a GET, but `?seen=1` stamps the team's read mark and so
 * clears the unread half of the Issues badge. The one read that writes.
 */
const SEEN_TICKET = /^\/api\/foundation\/issues\/[^/]+$/;

const ALL_ROUTES = Array.from(new Set(Object.values(BADGE_MUTATION_ROUTES).flat()));

function matches(path: string, route: RouteMatch): boolean {
  return typeof route === 'string' ? path.startsWith(route) : route.test(path);
}

/** Same-origin URL parts, or null for anything this app did not serve. */
function parse(url: string): URL | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    return parsed.origin === base ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a successful request with this method and URL may have changed a badge. */
export function affectsBadges(method: string | undefined, url: string): boolean {
  const parsed = parse(url);
  if (!parsed) return false;
  const path = parsed.pathname;
  if (path.startsWith('/api/nav-badges')) return false;

  const verb = (method || 'GET').toUpperCase();
  if (verb === 'GET') return SEEN_TICKET.test(path) && parsed.searchParams.get('seen') === '1';
  if (!MUTATING.has(verb)) return false;
  return ALL_ROUTES.some((route) => matches(path, route));
}

/** The method and URL of whatever was handed to fetch. */
export function describeFetch(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } {
  if (typeof input === 'string') return { method: init?.method || 'GET', url: input };
  if (input instanceof URL) return { method: init?.method || 'GET', url: input.href };
  return { method: init?.method || input.method || 'GET', url: input.url };
}
