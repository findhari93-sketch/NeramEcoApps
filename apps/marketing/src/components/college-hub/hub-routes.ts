/** True on /colleges and every page under it, with or without a locale prefix (/ta/colleges/...). */
export function isHubRoute(pathname: string): boolean {
  return /^(\/[a-z]{2})?\/colleges(\/|$)/.test(pathname);
}

/** Two-segment /colleges routes that are hubs, not a college page. */
const HUB_SECTIONS = new Set(['city', 'type', 'accreditation', 'counseling', 'fees', 'rankings', 'compare', 'saved', 'tnea', 'josaa']);

/** A college page: /colleges/<state>/<slug>. It has its own phone action bar instead of the hub nav. */
export function isCollegeProfileRoute(pathname: string): boolean {
  const m = pathname.match(/^(?:\/[a-z]{2})?\/colleges\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
  return Boolean(m && !HUB_SECTIONS.has(m[1]));
}

/**
 * Routes where comparing colleges is offered, so the compare tray may mount:
 * the whole College Hub (every /colleges page, including list views and college
 * profiles) plus the two exam hubs whose college cards carry a Compare button.
 * Everywhere else (home, fees, blog, apply, ...) the tray stays hidden even when
 * the saved compare list is not empty, so it never leaks onto the home page.
 */
export function isCompareRoute(pathname: string): boolean {
  return isHubRoute(pathname) || /^(\/[a-z]{2})?\/(nata-hub|jee-barch-hub)(\/|$)/.test(pathname);
}
