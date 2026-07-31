/**
 * Routes that opt out of the shared content Container and its padding.
 *
 * The timetable is a calendar: it is sized off the viewport and scrolls
 * internally, so the 1200px cap (900px for parents, which already clipped the
 * seven-column grid) and the page padding both work against it. Every other
 * route keeps the Container untouched, which is why this is a route test rather
 * than a layout change.
 *
 * Kept in one module so the three role layouts cannot drift apart, and so the
 * matching pattern sits next to LAYOUT.shellChrome, which encodes the chrome
 * heights these routes leave behind.
 */
const FULL_BLEED = /^\/(teacher|student|parent)\/timetable\/?$/;

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
