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
