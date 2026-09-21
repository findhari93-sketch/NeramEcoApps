import { isFeatureEnabled, type FlagMap } from './feature-flags';

/**
 * Drawings: one destination for a student's drawing life.
 *
 * Sketchbook and Inspiration used to be two nav items sitting next to each
 * other in the same group, which asked every teacher and every student to know
 * the difference before they had seen either. They are one item now, and this
 * module is the only place that knows what its tabs are.
 *
 * Two kinds of tab live in the same bar:
 *
 *   - An IN-PAGE tab (no `href`) is a piece of the hub page, switched with
 *     `?view=`. Flip through and Class rhythm have always worked this way and
 *     the evening digest deep-links to `?view=rhythm`.
 *   - A tab that OWNS ITS ROUTE (`href`) is a link. Inspiration is one, and has
 *     to be: it carries its own URL state (q, type, exam, by, year, sort,
 *     scope), a `/saved` list and a page per drawing. Folding that into a query
 *     param would mean rewriting `lib/inspiration-query.ts` and re-pathing the
 *     feature flag whose value is already persisted in nexus_settings.
 *
 * That split is also what keeps the founder's "one tab level, never tabs inside
 * tabs" rule intact: a tab with sub-routes coexists with the bar by owning its
 * own URL, and its deeper screens (a drawing, the Saved list, one student's
 * sketchbook) render no bar at all.
 *
 * The hub keeps the /sketchbook paths. Renaming them to /drawings would collide
 * with the retired /student/drawings tree, which still holds live Question Bank
 * pages, and would break the Teams cards and digests that already point at
 * /teacher/sketchbook/[studentId]/[sketchId]. The label is what people read.
 */

export type HubRole = 'teacher' | 'student';

/** Tab keys. `to-mark` and `wall` join here with the milestones that build them. */
export type HubTabKey = 'flip' | 'rhythm' | 'inspiration' | 'mine';

export interface HubTab {
  key: HubTabKey;
  label: string;
  /** Set only on a tab that owns its own route. In-page tabs use `?view=`. */
  href?: string;
  /**
   * The feature that owns this tab's screen. It must be the same id that gates
   * the tab's route, or the bar offers a tab whose page answers "unavailable".
   */
  flag?: string;
}

/** Where the hub itself lives, per role. */
export const HUB_PATH: Record<HubRole, string> = {
  teacher: '/teacher/sketchbook',
  student: '/student/sketchbook',
};

const INSPIRATION_PATH: Record<HubRole, string> = {
  teacher: '/teacher/inspiration',
  student: '/student/inspiration',
};

const TABS: Record<HubRole, HubTab[]> = {
  teacher: [
    { key: 'flip', label: 'Flip through' },
    { key: 'rhythm', label: 'Class rhythm' },
    { key: 'inspiration', label: 'Inspiration', href: INSPIRATION_PATH.teacher, flag: 'staff.inspiration' },
  ],
  student: [
    { key: 'mine', label: 'My sketchbook' },
    { key: 'inspiration', label: 'Inspiration', href: INSPIRATION_PATH.student, flag: 'student.inspiration' },
  ],
};

/** Every tab for a role, in bar order, before flags are applied. */
export function hubTabs(role: HubRole): HubTab[] {
  return TABS[role];
}

/** The tabs this viewer may actually see. */
export function visibleHubTabs(role: HubRole, flags: FlagMap): HubTab[] {
  return TABS[role].filter((t) => !t.flag || isFeatureEnabled(t.flag, flags));
}

/**
 * Where a tab lives. The first tab is deliberately paramless, so the hub path
 * on its own opens it and nothing has to carry `?view=flip` around.
 */
export function hubHref(role: HubRole, key: HubTabKey): string {
  const tab = TABS[role].find((t) => t.key === key);
  if (tab?.href) return tab.href;
  if (!tab || tab.key === TABS[role][0].key) return HUB_PATH[role];
  return `${HUB_PATH[role]}?view=${tab.key}`;
}

/**
 * Which tab a URL is showing, or null where the bar must not be drawn at all:
 * one student's sketchbook and one drawing are tasks, not tabs, and a bar there
 * would offer to switch away mid-correction.
 */
export function activeHubTab(role: HubRole, pathname: string, search: string): HubTabKey | null {
  const inspiration = INSPIRATION_PATH[role];
  if (pathname === inspiration || pathname.startsWith(`${inspiration}/`)) return 'inspiration';

  const hub = HUB_PATH[role];
  if (pathname !== hub && pathname !== `${hub}/`) return null;

  const asked = new URLSearchParams(search).get('view');
  const inPage = TABS[role].filter((t) => !t.href);
  return inPage.find((t) => t.key === asked)?.key ?? inPage[0].key;
}
