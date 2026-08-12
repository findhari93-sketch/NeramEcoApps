/**
 * Routes that opt out of the shared content Container and its padding.
 *
 * Both entries are the same shape of screen: sized off the viewport, scrolling
 * internally, so the 1200px cap (900px for parents, which already clipped the
 * seven-column grid) and the page padding both work against them.
 *
 * The timetable is a calendar. The question-bank paper workspace is a
 * two-pane editor where the teacher spends most of a session, and the cap was
 * costing it roughly 200px of width while `main`'s padding was being applied on
 * top of the page's own. Its list page and its `overview` sibling are ordinary
 * scrolling pages and stay capped, hence the negative lookahead.
 *
 * Every other route keeps the Container untouched, which is why this is a route
 * test rather than a layout change.
 *
 * Kept in one module so the three role layouts cannot drift apart, and so the
 * matching pattern sits next to SHELL_CHROME (lib/shell-chrome), which encodes
 * the chrome heights these routes leave behind.
 */
const FULL_BLEED =
  /^\/(teacher|student|parent)\/timetable\/?$|^\/teacher\/question-bank\/papers\/(?!overview\/?$)[^/]+\/?$/;

export function isFullBleedRoute(pathname: string | null | undefined): boolean {
  return !!pathname && FULL_BLEED.test(pathname);
}

/**
 * Routes that render with NO app chrome at all: no sidebar, no top bar, no
 * bottom nav, no report-issue button.
 *
 * Distinct from full bleed, which only drops the Container and its padding while
 * keeping the navigation. Focus Mode needs the stronger version for two reasons.
 * It opens in a chromeless popup on desktop, where a sidebar and a bottom nav
 * would be absurd. And it is a deliberate attention contract with the student:
 * the point of the screen is that the class is the only thing on it, and a
 * bottom nav offering five ways to leave undermines that before they start.
 *
 * The role guard still applies. Chromeless means no navigation, not no auth.
 */
const CHROMELESS = /^\/student\/focus(\/|$)/;

export function isChromelessRoute(pathname: string | null | undefined): boolean {
  return !!pathname && CHROMELESS.test(pathname);
}
